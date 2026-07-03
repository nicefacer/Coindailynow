/**
 * Distribution Dispatcher (P7.2).
 *
 * Pops items from Redis list `distribution:queue` and fans them out to
 * every ENABLED DistributionTarget. Records a DistributionPost row per
 * (item, target) pair with status PENDING → POSTED | FAILED.
 *
 * Queue payload shape:
 *   { type: 'article' | 'video_run' | 'image', id: string, at: string }
 *
 * For 'video_run': loads the run's SHORT and LONG assets and dispatches
 * them as `itemType: 'video'`. Each format goes to the relevant platforms
 * (SHORT to TikTok/Reels/Shorts; LONG to YouTube/Facebook/LinkedIn).
 */

import type Redis from 'ioredis';
import { logger } from '../../utils/logger';
import prisma from '../../lib/prisma';
import { getAdapter, listAdapters, NotConfiguredError } from './socialAdapter';
import type { DistributionPlatform, DistributionPayload } from './socialAdapter';
import { initAdapters as _bootAdapters } from './registry';

const QUEUE_KEY = 'distribution:queue';
const POLL_MS = parseInt(process.env.DISTRIBUTION_POLL_MS || '5000', 10);

let running = false;
let stopRequested = false;

const SHORT_FORMAT_PLATFORMS: DistributionPlatform[] = ['tiktok', 'instagram', 'youtube']; // YouTube Shorts
const LONG_FORMAT_PLATFORMS: DistributionPlatform[] = ['youtube', 'facebook', 'linkedin'];
const ARTICLE_PLATFORMS: DistributionPlatform[] = ['telegram', 'x', 'facebook', 'linkedin', 'whatsapp'];

export function startDistributionDispatcher(redis: Redis): void {
  if (running) return;
  if (process.env.DISTRIBUTION_DISABLE === 'true') {
    logger.info('[distribution] disabled via env');
    return;
  }
  if (process.env.REDIS_ENABLED === 'false' || !process.env.REDIS_URL) {
    logger.info('[distribution] skipped — Redis not configured');
    _bootAdapters();   // still register adapters so /api/admin/distribution/platforms works
    return;
  }
  _bootAdapters();
  running = true;
  stopRequested = false;
  logger.info(`[distribution] starting; pollMs=${POLL_MS}; adapters=${listAdapters().map(a => a.platform).join(',')}`);
  loop(redis).catch(err => {
    logger.error('[distribution] fatal loop error', { err: err.message });
    running = false;
  });
}

export async function stopDistributionDispatcher(): Promise<void> {
  stopRequested = true;
  running = false;
}

async function loop(redis: Redis): Promise<void> {
  while (!stopRequested) {
    try {
      const raw = await redis.rpop(QUEUE_KEY);
      if (!raw) { await sleep(POLL_MS); continue; }
      const job = JSON.parse(raw) as { type: 'article' | 'video_run' | 'image'; id: string };
      await processJob(job);
    } catch (err: any) {
      logger.warn('[distribution] iteration error', { err: err.message });
      await sleep(POLL_MS);
    }
  }
}

async function processJob(job: { type: string; id: string }): Promise<void> {
  if (job.type === 'video_run') {
    return processVideoRun(job.id);
  }
  if (job.type === 'article') {
    return processArticle(job.id);
  }
  if (job.type === 'image') {
    logger.info(`[distribution] image dispatch not yet implemented (id=${job.id})`);
    return;
  }
  logger.warn(`[distribution] unknown job type: ${job.type}`);
}

async function processVideoRun(runId: string): Promise<void> {
  const run = await prisma.videoRun.findUnique({
    where: { id: runId },
    include: {
      assets: true,
    },
  });
  if (!run) return;
  const article = await prisma.article.findUnique({
    where: { id: run.articleId },
    select: { id: true, title: true, slug: true, excerpt: true, language: true, tags: true, featuredImageUrl: true },
  });
  if (!article) return;

  const short = run.assets.find(a => a.format === 'SHORT');
  const long = run.assets.find(a => a.format === 'LONG');
  const articleUrl = `${publicSiteUrl()}/${article.language || 'en'}/news/${article.slug}`;

  // Short → vertical platforms
  if (short) {
    await fanOutToPlatforms(SHORT_FORMAT_PLATFORMS, {
      itemType: 'video',
      itemId: short.id,
      title: article.title,
      description: article.excerpt,
      articleUrl,
      mediaUrl: short.url,
      thumbnailUrl: short.thumbnailUrl || article.featuredImageUrl || undefined,
      tags: parseTags(article.tags),
    });
  }

  // Long → landscape platforms
  if (long) {
    await fanOutToPlatforms(LONG_FORMAT_PLATFORMS, {
      itemType: 'video',
      itemId: long.id,
      title: article.title,
      description: article.excerpt,
      articleUrl,
      mediaUrl: long.url,
      thumbnailUrl: long.thumbnailUrl || article.featuredImageUrl || undefined,
      tags: parseTags(article.tags),
    });
  }

  // Also push the article link itself to article-friendly platforms
  await fanOutToPlatforms(ARTICLE_PLATFORMS, {
    itemType: 'article',
    itemId: article.id,
    title: article.title,
    description: article.excerpt,
    articleUrl,
    tags: parseTags(article.tags),
  });
}

async function processArticle(articleId: string): Promise<void> {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: { id: true, title: true, slug: true, excerpt: true, language: true, tags: true, featuredImageUrl: true },
  });
  if (!article) return;
  const articleUrl = `${publicSiteUrl()}/${article.language || 'en'}/news/${article.slug}`;
  await fanOutToPlatforms(ARTICLE_PLATFORMS, {
    itemType: 'article',
    itemId: article.id,
    title: article.title,
    description: article.excerpt,
    articleUrl,
    tags: parseTags(article.tags),
  });
}

async function fanOutToPlatforms(platforms: DistributionPlatform[], payload: DistributionPayload): Promise<void> {
  const targets = await prisma.distributionTarget.findMany({
    where: { enabled: true, platform: { in: platforms } },
  });

  for (const target of targets) {
    const adapter = getAdapter(target.platform as DistributionPlatform);
    if (!adapter) continue;

    // Create the post row in PENDING up-front so failures are visible in the dashboard
    const post = await prisma.distributionPost.create({
      data: {
        targetId: target.id,
        itemType: payload.itemType,
        itemId: payload.itemId,
        status: 'PENDING',
      },
    });

    try {
      const result = await adapter.post({ ...payload, targetMetadata: (target.metadata as any) || undefined });
      await prisma.distributionPost.update({
        where: { id: post.id },
        data: {
          status: 'POSTED',
          externalId: result.externalId,
          externalUrl: result.externalUrl,
          postedAt: new Date(),
          metadata: result.metadata || undefined,
        },
      });
      logger.info(`[distribution] posted ${payload.itemType} ${payload.itemId} → ${target.platform}/${target.handle}`);
    } catch (err: any) {
      const isNotConfigured = err instanceof NotConfiguredError;
      await prisma.distributionPost.update({
        where: { id: post.id },
        data: {
          status: 'FAILED',
          errorMessage: isNotConfigured
            ? `Adapter not configured: missing ${err.missingEnv.join(', ')}`
            : err.message.slice(0, 500),
        },
      });
      logger.warn(`[distribution] ${target.platform} post failed: ${err.message}`);
    }
  }
}

function publicSiteUrl(): string {
  return process.env.FRONTEND_PUBLIC_URL || 'https://sygn.live';
}

function parseTags(tags: any): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  try {
    const parsed = JSON.parse(String(tags));
    if (Array.isArray(parsed)) return parsed;
  } catch {
    return String(tags).split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

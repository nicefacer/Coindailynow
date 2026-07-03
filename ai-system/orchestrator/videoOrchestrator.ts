/**
 * Video Pipeline Orchestrator (P6).
 *
 * Mirrors aiReviewAgent.orchestrateArticleCreation for video. Given a
 * published Article, produces a SHORT (60s vertical) + LONG (3-5min landscape)
 * video and queues for human review.
 *
 * Steps:
 *   0. loadArticle      — pull Article + featured image
 *   1. script           — generate SHORT + LONG scripts (LLM, with fallback)
 *   2. validateScript   — sanity check (length, hook present, scenes parseable)
 *   3. voiceover        — render TTS per scene via Coqui XTTS
 *   4. shortVideo       — D-ID avatar reads the SHORT script
 *   5. longVideo        — InVideo AI builds the LONG from article URL
 *   6. broll            — fal.ai cinematic clips (optional intro/outro)
 *   7. compose          — stitch (when needed) — most providers return final mp4 directly
 *   8. validateVideo    — duration/size sanity
 *   9. queueForReview   — flip status to READY_FOR_REVIEW
 */

import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import type { Logger } from 'winston';
import { generateVideoScripts, VideoScript } from '../agents/video/scriptAgent';
import { renderVoiceover } from '../agents/video/coquiAdapter';
import { generateShortAvatarVideo } from '../agents/video/didAdapter';
import { generateLongStockVideo } from '../agents/video/invideoAdapter';
import { generateBrollClip } from '../agents/video/falAdapter';
import { composeVideo } from '../agents/video/ffmpegComposer';

const STEP_ORDER: Record<string, number> = {
  loadArticle: 0,
  script: 1,
  validateScript: 2,
  voiceover: 3,
  shortVideo: 4,
  longVideo: 5,
  broll: 6,
  compose: 7,
  validateVideo: 8,
  queueForReview: 9,
};

export interface VideoRunResult {
  runId: string;
  status: 'READY_FOR_REVIEW' | 'FAILED';
  shortAssetId?: string;
  longAssetId?: string;
}

export async function runVideoPipeline(
  prisma: PrismaClient,
  _redis: Redis,
  logger: Logger,
  articleId: string,
): Promise<VideoRunResult> {
  // Create run row up-front so all subsequent step writes have something to FK to.
  const run = await prisma.videoRun.create({
    data: { articleId, status: 'RUNNING' },
    select: { id: true },
  });
  logger.info(`[video] starting run ${run.id} for article ${articleId}`);

  try {
    // Step 0 — load article
    const article = await stepWrap(prisma, run.id, 'loadArticle', 0, { articleId }, async () => {
      const a = await prisma.article.findUnique({
        where: { id: articleId },
        select: {
          id: true, title: true, excerpt: true, content: true, slug: true,
          featuredImageUrl: true, language: true, status: true,
          Category: { select: { name: true, slug: true } },
        },
      });
      if (!a) throw new Error(`article ${articleId} not found`);
      if (a.status !== 'PUBLISHED') throw new Error(`article ${articleId} is not PUBLISHED`);
      return a;
    });

    // Step 1 — script (in the article's language, via P8.1)
    const articleLang = (article.language || 'en').toLowerCase();
    const scripts = await stepWrap(prisma, run.id, 'script', 1, { articleId, title: article.title, language: articleLang }, async () => {
      return generateVideoScripts(
        {
          articleId: article.id,
          title: article.title,
          excerpt: article.excerpt,
          content: article.content,
          category: article.Category?.slug,
          language: articleLang,
        },
        logger,
      );
    });

    // Step 2 — validate script
    await stepWrap(prisma, run.id, 'validateScript', 2, { hasShort: !!scripts.short, hasLong: !!scripts.long }, async () => {
      const issues: string[] = [];
      if (!scripts.short?.scenes?.length) issues.push('short script has no scenes');
      if (!scripts.long?.scenes?.length) issues.push('long script has no scenes');
      if (scripts.short.totalDurationSec < 40 || scripts.short.totalDurationSec > 90) issues.push(`short duration ${scripts.short.totalDurationSec}s out of 40-90 range`);
      if (scripts.long.totalDurationSec < 120 || scripts.long.totalDurationSec > 300) issues.push(`long duration ${scripts.long.totalDurationSec}s out of 120-300 range`);
      if (issues.length) logger.warn(`[video] script validation warnings: ${issues.join('; ')}`);
      return { passed: issues.length === 0, issues };
    });

    // Step 3 — voiceover (Coqui XTTS, free, self-hosted)
    const voiceover = await stepWrap(prisma, run.id, 'voiceover', 3, { format: 'short+long' }, async () => {
      const [shortAudio, longAudio] = await Promise.all([
        renderVoiceover(joinScript(scripts.short), { language: article.language || 'en' }, logger).catch(e => ({ ok: false, error: e.message })),
        renderVoiceover(joinScript(scripts.long), { language: article.language || 'en' }, logger).catch(e => ({ ok: false, error: e.message })),
      ]);
      return { shortAudio, longAudio };
    });

    // Step 4 — SHORT (D-ID avatar, in the article's language)
    const shortVideo = await stepWrap(prisma, run.id, 'shortVideo', 4, { format: 'SHORT', durationSec: scripts.short.totalDurationSec, language: articleLang }, async () => {
      return generateShortAvatarVideo(
        { script: scripts.short, articleId: article.id, articleTitle: article.title, language: articleLang },
        logger,
      );
    });

    // Step 5 — LONG (InVideo AI from article URL)
    const longVideo = await stepWrap(prisma, run.id, 'longVideo', 5, { format: 'LONG', durationSec: scripts.long.totalDurationSec }, async () => {
      return generateLongStockVideo(
        { script: scripts.long, articleId: article.id, articleSlug: article.slug, articleTitle: article.title },
        logger,
      );
    }).catch(err => {
      logger.warn(`[video] long video step failed (non-fatal): ${err.message}`);
      return { url: '', error: err.message } as any;
    });

    // Step 6 — B-roll (fal.ai cinematic intro) — optional, doesn't block
    const broll = await stepWrap(prisma, run.id, 'broll', 6, { hint: scripts.short.scenes[0]?.visualHint }, async () => {
      return generateBrollClip(
        { prompt: scripts.short.scenes[0]?.visualHint || article.title, durationSec: 5 },
        logger,
      );
    }).catch(err => {
      logger.warn(`[video] broll step failed (non-fatal): ${err.message}`);
      return { url: '', error: err.message } as any;
    });

    // Step 7 — compose. ffmpeg stitching (intro + B-roll + base + outro).
    // Returns base URL unchanged if no intro/outro/broll configured.
    const composed = await stepWrap(prisma, run.id, 'compose', 7, { hasShort: !!shortVideo?.url, hasBroll: !!broll?.url }, async () => {
      const out: any = { short: null, long: null };
      if (shortVideo?.url) {
        out.short = await composeVideo({
          baseVideoUrl: shortVideo.url,
          brollUrl: broll?.url,
          articleId: article.id,
          format: 'SHORT',
        }, logger);
      }
      if (longVideo?.url) {
        out.long = await composeVideo({
          baseVideoUrl: longVideo.url,
          articleId: article.id,
          format: 'LONG',
        }, logger);
      }
      return out;
    }).catch(err => {
      logger.warn(`[video] compose step failed (non-fatal): ${err.message}`);
      return { short: null, long: null };
    });

    // Prefer the composed URL when ffmpeg succeeded; fall back to provider URL.
    if (composed?.short?.ok && composed.short.url) shortVideo.url = composed.short.url;
    if (composed?.long?.ok && composed.long.url) longVideo.url = composed.long.url;

    // Persist VideoAssets
    const assets: { format: string; url: string; provider: string }[] = [];
    if (shortVideo?.url) {
      await prisma.videoAsset.create({
        data: {
          runId: run.id, format: 'SHORT', url: shortVideo.url,
          durationSec: scripts.short.totalDurationSec,
          provider: shortVideo.provider || 'd-id',
          thumbnailUrl: (shortVideo as any).thumbnailUrl,
        },
      });
      assets.push({ format: 'SHORT', url: shortVideo.url, provider: shortVideo.provider || 'd-id' });
    }
    if (longVideo?.url) {
      await prisma.videoAsset.create({
        data: {
          runId: run.id, format: 'LONG', url: longVideo.url,
          durationSec: scripts.long.totalDurationSec,
          provider: longVideo.provider || 'invideo',
        },
      });
      assets.push({ format: 'LONG', url: longVideo.url, provider: longVideo.provider || 'invideo' });
    }
    if (broll?.url) {
      await prisma.videoAsset.create({
        data: {
          runId: run.id, format: 'BROLL', url: broll.url,
          durationSec: 5, provider: broll.provider || 'fal',
        },
      });
      assets.push({ format: 'BROLL', url: broll.url, provider: broll.provider || 'fal' });
    }

    // Step 8 — validate video
    await stepWrap(prisma, run.id, 'validateVideo', 8, { assetCount: assets.length }, async () => {
      const issues: string[] = [];
      if (!shortVideo?.url) issues.push('SHORT video missing — only blocker if no manual override available');
      return { passed: !!shortVideo?.url, issues, assets };
    });

    // Step 9 — queue for review
    await stepWrap(prisma, run.id, 'queueForReview', 9, { runId: run.id }, async () => ({ ok: true }));

    await prisma.videoRun.update({ where: { id: run.id }, data: { status: 'READY_FOR_REVIEW' } });
    logger.info(`[video] run ${run.id} READY_FOR_REVIEW; ${assets.length} assets`);

    return { runId: run.id, status: 'READY_FOR_REVIEW' };
  } catch (err: any) {
    logger.error(`[video] run ${run.id} failed: ${err.message}`);
    await prisma.videoRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', errorMessage: err.message },
    });
    return { runId: run.id, status: 'FAILED' };
  }
}

function joinScript(s: VideoScript): string {
  const parts: string[] = [];
  if (s.hook) parts.push(s.hook);
  for (const sc of s.scenes) parts.push(sc.text);
  if (s.cta) parts.push(s.cta);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Lightweight step recorder for VideoStep (mirrors stepRecorder but adapted
 * to the VideoStep model — different FK + smaller surface).
 */
async function stepWrap<T>(
  prisma: PrismaClient,
  runId: string,
  stepName: string,
  stepOrder: number,
  input: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = new Date();
  await prisma.videoStep.upsert({
    where: { runId_stepName: { runId, stepName } },
    create: { runId, stepName, stepOrder, status: 'RUNNING', input: safeJson(input), startedAt },
    update: { stepOrder, status: 'RUNNING', input: safeJson(input), output: null, errorMessage: null, startedAt, completedAt: null, durationMs: null },
  });
  try {
    const out = await fn();
    const completedAt = new Date();
    await prisma.videoStep.update({
      where: { runId_stepName: { runId, stepName } },
      data: {
        status: 'SUCCESS',
        output: safeJson(out),
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      },
    });
    return out;
  } catch (err: any) {
    const completedAt = new Date();
    await prisma.videoStep.update({
      where: { runId_stepName: { runId, stepName } },
      data: {
        status: 'FAILED',
        errorMessage: err.message,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      },
    });
    throw err;
  }
}

function safeJson(v: unknown): any {
  if (v === undefined) return null;
  return JSON.parse(JSON.stringify(v, (_k, x) => x instanceof Map ? Object.fromEntries(x) : x));
}

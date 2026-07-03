/**
 * Scheduled Publisher (P4.2).
 *
 * Polls Article rows with status='SCHEDULED' whose publishScheduledAt has
 * passed; flips them to PUBLISHED, stamps publishedAt, and pings the
 * frontend revalidate webhook. Single-instance per backend process.
 */

import prisma from '../lib/prisma';
import { logger } from '../utils/logger';
import { indexArticleInLanguage, indexTranslation, IndexableArticle } from './languageIndexService';

const POLL_MS = parseInt(process.env.SCHEDULED_PUBLISHER_POLL_MS || '60000', 10);
let timer: NodeJS.Timeout | null = null;
let stopRequested = false;

export function startScheduledPublisher(): void {
  if (timer) return;
  if (process.env.SCHEDULED_PUBLISHER_DISABLE === 'true') {
    logger.info('[scheduledPublisher] disabled via env');
    return;
  }
  stopRequested = false;
  logger.info(`[scheduledPublisher] starting; pollMs=${POLL_MS}`);
  tick();
}

export function stopScheduledPublisher(): void {
  stopRequested = true;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

async function tick(): Promise<void> {
  if (stopRequested) return;
  try {
    const now = new Date();
    const due = await prisma.article.findMany({
      where: {
        status: 'SCHEDULED',
        publishScheduledAt: { lte: now },
      },
      select: { id: true, slug: true },
      take: 50,
    });

    if (due.length) {
      logger.info(`[scheduledPublisher] flipping ${due.length} scheduled articles to PUBLISHED`);
      await prisma.article.updateMany({
        where: { id: { in: due.map(a => a.id) } },
        data: { status: 'PUBLISHED', publishedAt: now },
      });
      for (const a of due) {
        triggerFrontendRevalidate(a.slug).catch(err =>
          logger.warn(`[scheduledPublisher] revalidate ${a.slug} failed: ${err.message}`),
        );
        // P5.A3 — index now that the article is actually live
        indexArticleAndTranslations(a.id).catch(err =>
          logger.warn(`[scheduledPublisher] index ${a.slug} failed: ${err.message}`),
        );
      }
    }
  } catch (err: any) {
    logger.warn('[scheduledPublisher] tick failed', { err: err.message });
  } finally {
    if (!stopRequested) {
      timer = setTimeout(tick, POLL_MS);
    }
  }
}

/** Load full Article + its translations and push every doc to ES. */
async function indexArticleAndTranslations(articleId: string): Promise<void> {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { ArticleTranslation: true },
  });
  if (!article) return;

  const parent: IndexableArticle = {
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    content: article.content,
    language: article.language,
    categoryId: article.categoryId,
    tags: article.tags,
    featuredImageUrl: article.featuredImageUrl,
    territory: article.territory,
    authorId: article.authorId,
    status: article.status,
    publishedAt: article.publishedAt,
  };
  await indexArticleInLanguage(parent);

  for (const t of article.ArticleTranslation || []) {
    if (t.languageCode === article.language) continue;
    await indexTranslation(
      {
        id: t.id,
        articleId: t.articleId,
        languageCode: t.languageCode,
        title: t.title,
        excerpt: t.excerpt,
        content: t.content,
        translationStatus: t.translationStatus,
      },
      parent,
    );
  }
}

async function triggerFrontendRevalidate(slug: string): Promise<void> {
  const url = process.env.FRONTEND_REVALIDATE_URL;
  if (!url) return;
  const secret = process.env.FRONTEND_REVALIDATE_SECRET;
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({ slug, paths: [`/article/${slug}`, '/'] }),
    signal: AbortSignal.timeout(5000),
  });
}

/**
 * One-shot reindex (P5.A5).
 *
 * Walks every PUBLISHED Article + each ArticleTranslation and writes it to
 * the correct per-language Elasticsearch index. Safe to re-run (idempotent;
 * docs are upserted by deterministic `_id`).
 *
 * Run:
 *   cd backend
 *   npx ts-node scripts/reindex-by-language.ts
 *   # or compiled:
 *   npm run build && node dist/backend/scripts/reindex-by-language.js
 *
 * Env: same as backend (DATABASE_URL, ELASTICSEARCH_NODE, ...).
 */

import prisma from '../src/lib/prisma';
import {
  indexArticleInLanguage,
  indexTranslation,
  IndexableArticle,
} from '../src/services/languageIndexService';

const BATCH_SIZE = 50;

async function main() {
  const startedAt = Date.now();
  console.log('[reindex] starting per-language reindex …');

  let cursor: string | undefined;
  let articlesDone = 0;
  let translationsDone = 0;
  let failures = 0;

  while (true) {
    const batch = await prisma.article.findMany({
      where: { status: 'PUBLISHED', deletedAt: null },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { ArticleTranslation: true },
    });
    if (!batch.length) break;

    for (const article of batch) {
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

      const ok = await indexArticleInLanguage(parent);
      if (ok) articlesDone++;
      else failures++;

      for (const t of article.ArticleTranslation || []) {
        if (t.languageCode === article.language) continue;
        const okT = await indexTranslation(
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
        if (okT) translationsDone++;
        else failures++;
      }
    }

    cursor = batch[batch.length - 1].id;
    process.stdout.write(`\r[reindex] articles=${articlesDone} translations=${translationsDone} failed=${failures}`);
  }

  console.log(
    `\n[reindex] done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s — ` +
    `articles=${articlesDone}, translations=${translationsDone}, failed=${failures}`,
  );
  await prisma.$disconnect();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('[reindex] fatal:', err);
  process.exit(1);
});

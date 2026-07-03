/**
 * Faceted Search API
 *
 * GET /api/v1/search?q=bitcoin&type=articles&category=regulation&country=ng&lang=en&page=1&limit=20
 *
 * Tries Elasticsearch first, falls back to Prisma full-text search.
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../context';
import { logger } from '../../utils/logger';

const router = Router();

/* ── Types ── */

interface SearchHit {
  id: string;
  type: 'article' | 'factsheet' | 'press_release';
  title: string;
  excerpt?: string | null;
  slug: string;
  category?: string | null;
  categorySlug?: string | null;
  country?: string | null;
  language?: string | null;
  publishedAt?: string | null;
  featuredImageUrl?: string | null;
  tags?: string[];
  score?: number;
}

interface FacetBucket {
  key: string;
  count: number;
}

interface SearchResponse {
  query: string;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hits: SearchHit[];
  facets: {
    categories: FacetBucket[];
    countries: FacetBucket[];
    languages: FacetBucket[];
    types: FacetBucket[];
  };
  took: number; // ms
  source: 'elasticsearch' | 'prisma';
}

/* ── Elasticsearch attempt ── */

async function tryElasticsearch(
  query: string,
  filters: { type?: string; category?: string; country?: string; lang?: string },
  page: number,
  limit: number,
): Promise<SearchResponse | null> {
  try {
    // Dynamic import so missing ES doesn't crash startup
    const { Client } = await import('@elastic/elasticsearch');
    const esUrl = process.env.ELASTICSEARCH_URL || process.env.ELASTICSEARCH_NODE;
    if (!esUrl) return null;

    const client = new Client({ node: esUrl, requestTimeout: 5000 });

    // Ping first
    await client.ping();

    const must: any[] = [
      {
        multi_match: {
          query,
          fields: ['title^3', 'content^2', 'summary^2', 'tags^1.5', 'excerpt^1.5'],
          type: 'best_fields',
          fuzziness: 'AUTO',
        },
      },
    ];

    // P5.A4 — published status is uppercase in the per-language indexes
    const filterClauses: any[] = [{ terms: { status: ['published', 'PUBLISHED'] } }];
    if (filters.category) filterClauses.push({ term: { category: filters.category } });
    if (filters.country) filterClauses.push({ term: { country: filters.country } });
    // Language filter is now handled by routing to the right index (below),
    // so we drop the language term clause when lang is set.
    if (filters.lang && filters.lang === 'any') {
      // Cross-language search: no term filter needed, query handles it via index wildcard
    } else if (!filters.lang) {
      // No lang specified — let the user see all languages (legacy index also matched)
    }

    const body: any = {
      query: { bool: { must, filter: filterClauses } },
      sort: [{ _score: { order: 'desc' } }, { publishedAt: { order: 'desc' } }],
      from: (page - 1) * limit,
      size: limit,
      highlight: {
        fields: {
          title: { number_of_fragments: 0 },
          content: { fragment_size: 160, number_of_fragments: 2 },
        },
        pre_tags: ['<mark>'],
        post_tags: ['</mark>'],
      },
      aggs: {
        categories: { terms: { field: 'category.keyword', size: 20 } },
        countries: { terms: { field: 'country.keyword', size: 20 } },
        languages: { terms: { field: 'language.keyword', size: 10 } },
      },
    };

    // P5.A4 — route to the per-language index when lang is specified.
    //  - explicit lang → `coindaily_articles_<lang>` only
    //  - lang='any' or unspecified → wildcard across every language index
    //    AND the legacy single index, for backwards-compat during rollout.
    const targetIndex =
      filters.lang && filters.lang !== 'any'
        ? `coindaily_articles_${filters.lang.toLowerCase()}`
        : 'coindaily_articles_*,coindaily_articles';

    const start = Date.now();
    const res = await client.search({
      index: targetIndex,
      body,
      ignore_unavailable: true,   // index for a lang may not exist yet — return empty, don't 404
      allow_no_indices: true,
    } as any);
    const took = Date.now() - start;

    const totalVal = typeof res.hits.total === 'number' ? res.hits.total : res.hits.total?.value || 0;

    const hits: SearchHit[] = res.hits.hits.map((h: any) => ({
      id: h._id,
      type: 'article' as const,
      title: h.highlight?.title?.[0] || h._source.title,
      excerpt: h.highlight?.content?.[0] || h._source.summary || h._source.excerpt,
      slug: h._source.slug || h._id,
      category: h._source.category,
      categorySlug: h._source.categorySlug,
      country: h._source.country,
      language: h._source.language,
      publishedAt: h._source.publishedAt,
      featuredImageUrl: h._source.featuredImageUrl,
      tags: h._source.tags || [],
      score: h._score,
    }));

    const aggs = (res.aggregations || {}) as any;

    return {
      query,
      total: totalVal,
      page,
      limit,
      totalPages: Math.ceil(totalVal / limit),
      hits,
      facets: {
        categories: (aggs.categories?.buckets || []).map((b: any) => ({ key: b.key, count: b.doc_count })),
        countries: (aggs.countries?.buckets || []).map((b: any) => ({ key: b.key, count: b.doc_count })),
        languages: (aggs.languages?.buckets || []).map((b: any) => ({ key: b.key, count: b.doc_count })),
        types: [{ key: 'article', count: totalVal }],
      },
      took,
      source: 'elasticsearch',
    };
  } catch (err: any) {
    logger.warn('[Search] Elasticsearch unavailable, falling back to Prisma', { error: err.message });
    return null;
  }
}

/* ── Prisma fallback ── */

async function prismaSearch(
  query: string,
  filters: { type?: string; category?: string; country?: string; lang?: string },
  page: number,
  limit: number,
): Promise<SearchResponse> {
  const start = Date.now();
  const offset = (page - 1) * limit;

  // Build where clause
  const where: any = {
    status: 'PUBLISHED',
    OR: [
      { title: { contains: query, mode: 'insensitive' } },
      { excerpt: { contains: query, mode: 'insensitive' } },
      { content: { contains: query, mode: 'insensitive' } },
    ],
  };

  if (filters.category) {
    where.category = { slug: filters.category };
  }
  if (filters.country) {
    where.countryCode = filters.country.toUpperCase();
  }
  if (filters.lang) {
    where.language = filters.lang;
  }

  // Run count and find in parallel
  const [total, articles, categoryAgg, langAgg] = await Promise.all([
    prisma.article.count({ where }),
    prisma.article.findMany({
      where,
      select: {
        id: true,
        title: true,
        excerpt: true,
        slug: true,
        territory: true,
        language: true,
        publishedAt: true,
        featuredImageUrl: true,
        Category: { select: { name: true, slug: true } },
      },
      orderBy: [{ publishedAt: 'desc' }],
      skip: offset,
      take: limit,
    }),
    // Category facet
    prisma.article.groupBy({
      by: ['categoryId'],
      where: { status: 'PUBLISHED', OR: where.OR },
      _count: true,
    }),
    // Language facet
    prisma.article.groupBy({
      by: ['language'],
      where: { status: 'PUBLISHED', OR: where.OR },
      _count: true,
    }),
  ]);

  // Resolve category names for facets
  const categoryIds = categoryAgg.map((c: any) => c.categoryId).filter(Boolean);
  const categories = categoryIds.length > 0
    ? await prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true, slug: true } })
    : [];
  const catMap = new Map(categories.map((c: any) => [c.id, c]));

  const hits: SearchHit[] = articles.map((a: any) => ({
    id: a.id,
    type: 'article' as const,
    title: a.title,
    excerpt: a.excerpt,
    slug: a.slug,
    category: a.Category?.name || null,
    categorySlug: a.Category?.slug || null,
    country: Array.isArray(a.territory) && a.territory.length > 0 ? a.territory[0] : a.language,
    language: a.language,
    publishedAt: a.publishedAt?.toISOString() || null,
    featuredImageUrl: a.featuredImageUrl,
    tags: [],
  }));

  const took = Date.now() - start;

  return {
    query,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hits,
    facets: {
      categories: categoryAgg
        .filter((c: any) => c.categoryId)
        .map((c: any) => ({
          key: catMap.get(c.categoryId)?.slug || c.categoryId,
          count: c._count,
        })),
      countries: langAgg
        .filter((l: any) => l.language)
        .map((l: any) => ({ key: l.language, count: l._count })),
      languages: langAgg
        .filter((l: any) => l.language)
        .map((l: any) => ({ key: l.language, count: l._count })),
      types: [{ key: 'article', count: total }],
    },
    took,
    source: 'prisma',
  };
}

/* ── Route ── */

/**
 * GET /api/v1/search
 *
 * Query params:
 *   q        - search query (required)
 *   type     - content type filter (articles, factsheet, press_release)
 *   category - category slug filter
 *   country  - country code filter (ng, ke, za, gh)
 *   lang     - language code filter (en, ha, yo, sw, zu)
 *   page     - page number (default 1)
 *   limit    - results per page (default 20, max 50)
 */
router.get('/', async (req: Request, res: Response) => {
  const q = (req.query.q as string || '').trim();
  if (!q) {
    return res.status(400).json({ error: 'Missing required query parameter: q' });
  }
  if (q.length > 200) {
    return res.status(400).json({ error: 'Query too long (max 200 characters)' });
  }

  const type = req.query.type as string | undefined;
  const category = req.query.category as string | undefined;
  const country = req.query.country as string | undefined;
  const lang = req.query.lang as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));

  try {
    const filters = { type, category, country, lang };

    // Try Elasticsearch first
    let result = await tryElasticsearch(q, filters, page, limit);

    // Fallback to Prisma
    if (!result) {
      result = await prismaSearch(q, filters, page, limit);
    }

    res.json(result);
  } catch (err: any) {
    logger.error('[Search] Error:', { error: err.message, query: q });
    res.status(500).json({ error: 'Search failed', message: err.message });
  }
});

/**
 * GET /api/v1/search/suggest
 *
 * Quick autocomplete suggestions.
 * Query params:
 *   q     - partial query (min 2 chars)
 *   limit - max suggestions (default 5)
 */
/**
 * P5.B1 — GET /api/v1/articles/by-slug?slug=X&lang=Y
 *
 * Direct lookup in the per-language ES index. Used by /<lang>/news/<slug>
 * pages to fetch translated content. Returns first match (slug is unique
 * per language). Falls back to Prisma if ES is unavailable.
 *
 * Mounted at /api/v1/search/by-slug (re-using this router's mount point)
 * — clients should call /api/v1/search/by-slug?slug=...&lang=...
 */
router.get('/by-slug', async (req: Request, res: Response) => {
  const slug = (req.query.slug as string || '').trim();
  const lang = (req.query.lang as string || 'en').trim().toLowerCase();
  if (!slug) return res.status(400).json({ error: 'slug required' });
  if (!/^[a-z]{2,4}$/.test(lang)) return res.status(400).json({ error: 'invalid lang' });

  try {
    // ES first via languageIndexService
    const { searchInLanguage } = await import('../../services/languageIndexService');
    const esResult = await searchInLanguage({
      language: lang,
      query: '', // match-all; the slug filter is below
    });
    // searchInLanguage doesn't accept a slug filter today; do a manual term query
    const { Client } = await import('@elastic/elasticsearch');
    const esUrl = process.env.ELASTICSEARCH_URL || process.env.ELASTICSEARCH_NODE;
    if (esUrl) {
      try {
        const client = new Client({ node: esUrl, requestTimeout: 5000 });
        const r: any = await client.search({
          index: `coindaily_articles_${lang}`,
          body: {
            size: 1,
            query: { bool: { filter: [{ term: { slug } }] } },
          },
          ignore_unavailable: true,
          allow_no_indices: true,
        } as any);
        const hit = r.hits.hits[0];
        if (hit) {
          return res.json({
            source: 'elasticsearch',
            language: lang,
            article: {
              articleId: hit._source.articleId,
              translationId: hit._source.translationId,
              isOriginal: hit._source.isOriginal,
              slug: hit._source.slug,
              title: hit._source.title,
              excerpt: hit._source.excerpt,
              content: hit._source.content,
              featuredImageUrl: hit._source.featuredImageUrl,
              publishedAt: hit._source.publishedAt,
            },
          });
        }
      } catch (esErr: any) {
        logger.warn('[by-slug] ES lookup failed, falling back to Prisma', { err: esErr.message });
      }
    }

    // Prisma fallback: find Article, prefer matching translation
    const article = await prisma.article.findUnique({
      where: { slug },
      include: { ArticleTranslation: { where: { languageCode: lang } } },
    });
    if (!article || article.status !== 'PUBLISHED') {
      return res.status(404).json({ error: 'not found' });
    }
    const translation = article.ArticleTranslation[0];
    res.json({
      source: 'prisma',
      language: lang,
      article: {
        articleId: article.id,
        translationId: translation?.id ?? null,
        isOriginal: !translation,
        slug: article.slug,
        title: translation?.title || article.title,
        excerpt: translation?.excerpt || article.excerpt,
        content: translation?.content || article.content,
        featuredImageUrl: article.featuredImageUrl,
        publishedAt: article.publishedAt,
      },
    });
  } catch (err: any) {
    logger.error('[by-slug] failed', { err: err.message });
    res.status(500).json({ error: 'by-slug failed', detail: err.message });
  }
});

/**
 * P5.B3 — GET /api/v1/search/by-language?lang=Y&page=N&limit=20
 *
 * List recent published articles available in a given language. Pulls from
 * `coindaily_articles_<lang>` ordered by publishedAt desc; falls back to
 * Prisma Article + ArticleTranslation if ES is down.
 */
router.get('/by-language', async (req: Request, res: Response) => {
  const lang = (req.query.lang as string || '').trim().toLowerCase();
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  if (!/^[a-z]{2,4}$/.test(lang)) return res.status(400).json({ error: 'invalid lang' });

  const from = (page - 1) * limit;

  try {
    const { Client } = await import('@elastic/elasticsearch');
    const esUrl = process.env.ELASTICSEARCH_URL || process.env.ELASTICSEARCH_NODE;
    if (esUrl) {
      try {
        const client = new Client({ node: esUrl, requestTimeout: 5000 });
        const r: any = await client.search({
          index: `coindaily_articles_${lang}`,
          body: {
            from,
            size: limit,
            query: { bool: { filter: [{ terms: { status: ['published', 'PUBLISHED'] } }] } },
            sort: [{ publishedAt: { order: 'desc', missing: '_last' } }],
          },
          ignore_unavailable: true,
          allow_no_indices: true,
        } as any);
        const totalVal = typeof r.hits.total === 'number' ? r.hits.total : r.hits.total?.value || 0;
        return res.json({
          source: 'elasticsearch',
          language: lang,
          page,
          limit,
          total: totalVal,
          totalPages: Math.max(1, Math.ceil(totalVal / limit)),
          hits: r.hits.hits.map((h: any) => ({
            articleId: h._source.articleId,
            translationId: h._source.translationId,
            isOriginal: Boolean(h._source.isOriginal),
            slug: h._source.slug,
            title: h._source.title,
            excerpt: h._source.excerpt,
            featuredImageUrl: h._source.featuredImageUrl,
            publishedAt: h._source.publishedAt,
            category: h._source.category,
          })),
        });
      } catch (esErr: any) {
        logger.warn('[by-language] ES failed, falling back to Prisma', { err: esErr.message });
      }
    }

    // Prisma fallback — union of (Article where language=lang) ∪ (ArticleTranslation where languageCode=lang)
    const [originals, translations, originalsTotal, translationsTotal] = await Promise.all([
      prisma.article.findMany({
        where: { status: 'PUBLISHED', language: lang, deletedAt: null },
        orderBy: { publishedAt: 'desc' },
        skip: from,
        take: limit,
        select: {
          id: true, slug: true, title: true, excerpt: true,
          featuredImageUrl: true, publishedAt: true,
        },
      }),
      prisma.articleTranslation.findMany({
        where: { languageCode: lang, Article: { status: 'PUBLISHED', language: { not: lang } } },
        orderBy: { Article: { publishedAt: 'desc' } },
        skip: from,
        take: limit,
        select: {
          id: true, articleId: true, title: true, excerpt: true,
          Article: { select: { slug: true, featuredImageUrl: true, publishedAt: true } },
        },
      }),
      prisma.article.count({ where: { status: 'PUBLISHED', language: lang, deletedAt: null } }),
      prisma.articleTranslation.count({
        where: { languageCode: lang, Article: { status: 'PUBLISHED', language: { not: lang } } },
      }),
    ]);

    const hits = [
      ...originals.map(a => ({
        articleId: a.id,
        translationId: null,
        isOriginal: true,
        slug: a.slug,
        title: a.title,
        excerpt: a.excerpt,
        featuredImageUrl: a.featuredImageUrl,
        publishedAt: a.publishedAt,
      })),
      ...translations.map(t => ({
        articleId: t.articleId,
        translationId: t.id,
        isOriginal: false,
        slug: t.Article.slug,
        title: t.title,
        excerpt: t.excerpt,
        featuredImageUrl: t.Article.featuredImageUrl,
        publishedAt: t.Article.publishedAt,
      })),
    ].sort((a, b) => {
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return tb - ta;
    }).slice(0, limit);

    const total = originalsTotal + translationsTotal;
    res.json({
      source: 'prisma',
      language: lang,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hits,
    });
  } catch (err: any) {
    logger.error('[by-language] failed', { err: err.message });
    res.status(500).json({ error: 'by-language failed', detail: err.message });
  }
});

router.get('/suggest', async (req: Request, res: Response) => {
  const q = (req.query.q as string || '').trim();
  if (q.length < 2) {
    return res.json({ suggestions: [] });
  }

  try {
    const articles = await prisma.article.findMany({
      where: {
        status: 'PUBLISHED',
        title: { contains: q, mode: 'insensitive' },
      },
      select: { title: true, slug: true },
      orderBy: { publishedAt: 'desc' },
      take: parseInt(req.query.limit as string) || 5,
    });

    res.json({
      suggestions: articles.map((a: any) => ({
        text: a.title,
        slug: a.slug,
      })),
    });
  } catch (err: any) {
    logger.error('[Search] Suggest error:', { error: err.message });
    res.json({ suggestions: [] });
  }
});

export default router;

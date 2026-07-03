/**
 * Language Index Service (P5.A1-A4).
 *
 * Per-language Elasticsearch indexes — one "directory" per language so the
 * reader's locale-scoped search hits a single, tightly-tuned index.
 *
 * Index naming:   coindaily_articles_<lang>   (e.g. coindaily_articles_sw)
 * Document _id:   <articleId>_<lang>          (article + its translation share parent articleId)
 *
 * Each doc carries:
 *   articleId      — parent Article.id (translations point back)
 *   translationId  — ArticleTranslation.id, null for the original
 *   language       — matches the index suffix
 *   isOriginal     — true if this is the article's native language
 *
 * Languages we ship in. ES has stemmers/stopwords for some; the rest fall
 * back to the `standard` analyzer (still searchable, just no stemming).
 */

import { Client } from '@elastic/elasticsearch';
import { logger } from '../utils/logger';

const ES_NODE = process.env.ELASTICSEARCH_NODE || process.env.ELASTICSEARCH_URL || 'http://localhost:9200';
const ES_USER = process.env.ELASTICSEARCH_USERNAME || '';
const ES_PASS = process.env.ELASTICSEARCH_PASSWORD || '';
const INDEX_PREFIX = 'coindaily_articles_';

/**
 * Language → ES analyzer mapping. Built-in ES analyzers:
 *   english, french, spanish, portuguese, arabic, dutch, german, italian, ...
 * For languages without a built-in (African + Caribbean langs), use 'standard'.
 */
const LANGUAGE_ANALYZER: Record<string, string> = {
  en: 'english',
  fr: 'french',
  es: 'spanish',
  pt: 'portuguese',
  ar: 'arabic',
  // No built-in stemmer for these — `standard` still tokenizes + lowercases properly.
  sw: 'standard',  // Swahili
  ha: 'standard',  // Hausa
  ig: 'standard',  // Igbo
  yo: 'standard',  // Yoruba
  zu: 'standard',  // Zulu
  af: 'standard',  // Afrikaans (could use 'dutch' but Afrikaans diverged)
  am: 'standard',  // Amharic
  so: 'standard',  // Somali
  rw: 'standard',  // Kinyarwanda
  ht: 'standard',  // Kreyòl
};

/** Build the index name for a language code. */
export function getIndexForLanguage(lang: string): string {
  const safe = String(lang || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  if (!safe) throw new Error('language code required');
  return `${INDEX_PREFIX}${safe}`;
}

/**
 * Lazy ES client. Returns null if ES isn't reachable so callers degrade
 * to fire-and-forget no-ops rather than crashing.
 */
let _client: Client | null | undefined;
function getClient(): Client | null {
  if (_client !== undefined) return _client;
  if (process.env.ELASTICSEARCH_DISABLE === 'true') {
    _client = null;
    return null;
  }
  try {
    _client = new Client({
      node: ES_NODE,
      auth: ES_USER ? { username: ES_USER, password: ES_PASS } : undefined,
      requestTimeout: 8000,
      maxRetries: 1,
    });
    return _client;
  } catch (err: any) {
    logger.warn(`[languageIndex] ES client init failed: ${err.message}`);
    _client = null;
    return null;
  }
}

/**
 * Create the per-language index if it doesn't exist. Idempotent.
 * Called on first write for a given language; safe to call repeatedly.
 */
async function ensureIndex(lang: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  const index = getIndexForLanguage(lang);
  const analyzer = LANGUAGE_ANALYZER[lang] || 'standard';

  try {
    const exists = await client.indices.exists({ index });
    if (exists) return true;

    await client.indices.create({
      index,
      body: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 1,
          analysis: {
            // ES "language analyzers" are pre-built (english, french, etc.).
            // For 'standard' we don't need a custom analyzer entry.
            // Cast to any: SDK types use a literal union for analyzer.type,
            // but ES accepts any built-in analyzer name string at runtime.
            analyzer:
              analyzer === 'standard'
                ? undefined
                : ({ primary_analyzer: { type: analyzer } } as any),
          },
        },
        mappings: {
          properties: {
            articleId: { type: 'keyword' },
            translationId: { type: 'keyword' },
            language: { type: 'keyword' },
            isOriginal: { type: 'boolean' },
            slug: { type: 'keyword' },
            title: {
              type: 'text',
              analyzer: analyzer === 'standard' ? 'standard' : 'primary_analyzer',
              fields: { keyword: { type: 'keyword' }, suggest: { type: 'completion' } },
            },
            excerpt: {
              type: 'text',
              analyzer: analyzer === 'standard' ? 'standard' : 'primary_analyzer',
            },
            content: {
              type: 'text',
              analyzer: analyzer === 'standard' ? 'standard' : 'primary_analyzer',
            },
            categoryId: { type: 'keyword' },
            category: { type: 'keyword' },
            tags: { type: 'keyword' },
            featuredImageUrl: { type: 'keyword', index: false },
            country: { type: 'keyword' },
            territory: { type: 'keyword' },
            authorId: { type: 'keyword' },
            status: { type: 'keyword' },
            publishedAt: { type: 'date' },
            indexedAt: { type: 'date' },
          },
        },
      },
    });
    logger.info(`[languageIndex] created index ${index} (analyzer=${analyzer})`);
    return true;
  } catch (err: any) {
    logger.warn(`[languageIndex] ensureIndex(${lang}) failed: ${err.message}`);
    return false;
  }
}

export interface IndexableArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  language: string;
  categoryId?: string | null;
  tags?: string[] | string | null;
  featuredImageUrl?: string | null;
  territory?: string[] | string | null;
  authorId?: string | null;
  status?: string;
  publishedAt?: Date | string | null;
}

export interface IndexableTranslation {
  id: string;
  articleId: string;
  languageCode: string;
  title: string;
  excerpt: string;
  content: string;
  translationStatus?: string;
}

/**
 * Write an article into its primary-language index. Auto-creates the index
 * on first call. `isOriginal` should be true for the Article's own language;
 * use indexTranslation() for ArticleTranslation rows.
 */
export async function indexArticleInLanguage(article: IndexableArticle): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  const lang = article.language || 'en';
  const ok = await ensureIndex(lang);
  if (!ok) return false;
  const index = getIndexForLanguage(lang);

  try {
    await client.index({
      index,
      id: `${article.id}_${lang}`,
      body: {
        articleId: article.id,
        translationId: null,
        language: lang,
        isOriginal: true,
        slug: article.slug,
        title: article.title,
        excerpt: article.excerpt,
        content: article.content,
        categoryId: article.categoryId,
        tags: normalizeTags(article.tags),
        featuredImageUrl: article.featuredImageUrl,
        territory: Array.isArray(article.territory) ? article.territory : article.territory ? [article.territory] : [],
        authorId: article.authorId,
        status: article.status || 'PUBLISHED',
        publishedAt: article.publishedAt,
        indexedAt: new Date(),
      },
      refresh: false,
    });
    return true;
  } catch (err: any) {
    logger.warn(`[languageIndex] indexArticleInLanguage(${article.id}, ${lang}) failed: ${err.message}`);
    return false;
  }
}

/**
 * Index an ArticleTranslation as a first-class document in the translation's
 * language index. The parent Article's metadata (slug, category, etc.) is
 * passed so the translation document has everything needed for ranking +
 * rendering without joins.
 */
export async function indexTranslation(
  translation: IndexableTranslation,
  parent: IndexableArticle,
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  const lang = translation.languageCode;
  const ok = await ensureIndex(lang);
  if (!ok) return false;
  const index = getIndexForLanguage(lang);

  try {
    await client.index({
      index,
      id: `${parent.id}_${lang}`,
      body: {
        articleId: parent.id,
        translationId: translation.id,
        language: lang,
        isOriginal: false,
        slug: parent.slug, // share slug across languages — URL will be /<lang>/article/<slug>
        title: translation.title,
        excerpt: translation.excerpt,
        content: translation.content,
        categoryId: parent.categoryId,
        tags: normalizeTags(parent.tags),
        featuredImageUrl: parent.featuredImageUrl,
        territory: Array.isArray(parent.territory) ? parent.territory : parent.territory ? [parent.territory] : [],
        authorId: parent.authorId,
        status: translation.translationStatus || parent.status || 'PUBLISHED',
        publishedAt: parent.publishedAt,
        indexedAt: new Date(),
      },
      refresh: false,
    });
    return true;
  } catch (err: any) {
    logger.warn(`[languageIndex] indexTranslation(${parent.id}, ${lang}) failed: ${err.message}`);
    return false;
  }
}

/**
 * Remove an article's documents. Pass lang=null to remove from EVERY
 * language index (used when unpublishing the article entirely).
 */
export async function removeFromIndex(articleId: string, lang: string | null = null): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    if (lang) {
      await client.delete({ index: getIndexForLanguage(lang), id: `${articleId}_${lang}` }, { ignore: [404] });
      return;
    }
    // Cross-index delete-by-query against the wildcard
    await client.deleteByQuery({
      index: `${INDEX_PREFIX}*`,
      body: { query: { term: { articleId } } },
      refresh: false,
    });
  } catch (err: any) {
    logger.warn(`[languageIndex] removeFromIndex(${articleId}, ${lang}) failed: ${err.message}`);
  }
}

export interface LangSearchOptions {
  language: string;        // 'sw', 'en', etc.; or '*' for all languages
  query: string;
  categoryId?: string;
  country?: string;
  size?: number;
  from?: number;
}

export interface LangSearchHit {
  id: string;
  articleId: string;
  translationId: string | null;
  language: string;
  isOriginal: boolean;
  slug: string;
  title: string;
  excerpt: string;
  category?: string;
  featuredImageUrl?: string;
  publishedAt?: string;
  score: number;
}

/**
 * Search within one language's index (or '*' for cross-language).
 * Returns a flat list of hits ranked by score; UI groups / dedupes as needed.
 */
export async function searchInLanguage(opts: LangSearchOptions): Promise<{ hits: LangSearchHit[]; total: number }> {
  const client = getClient();
  if (!client) return { hits: [], total: 0 };

  const index = opts.language === '*' ? `${INDEX_PREFIX}*` : getIndexForLanguage(opts.language);
  const size = Math.min(Math.max(opts.size ?? 20, 1), 100);
  const from = Math.max(opts.from ?? 0, 0);

  const must: any[] = [];
  if (opts.query?.trim()) {
    must.push({
      multi_match: {
        query: opts.query,
        fields: ['title^3', 'excerpt^2', 'content'],
        fuzziness: 'AUTO',
      },
    });
  } else {
    must.push({ match_all: {} });
  }

  const filter: any[] = [{ term: { status: 'PUBLISHED' } }];
  if (opts.categoryId) filter.push({ term: { categoryId: opts.categoryId } });
  if (opts.country) filter.push({ term: { territory: opts.country } });

  try {
    const res: any = await client.search({
      index,
      body: {
        from,
        size,
        query: { bool: { must, filter } },
        sort: [{ _score: { order: 'desc' } }, { publishedAt: { order: 'desc', missing: '_last' } }],
      },
    });

    const total = typeof res.hits.total === 'number' ? res.hits.total : res.hits.total?.value ?? 0;
    const hits: LangSearchHit[] = res.hits.hits.map((h: any) => ({
      id: h._id,
      articleId: h._source.articleId,
      translationId: h._source.translationId ?? null,
      language: h._source.language,
      isOriginal: Boolean(h._source.isOriginal),
      slug: h._source.slug,
      title: h._source.title,
      excerpt: h._source.excerpt,
      category: h._source.category,
      featuredImageUrl: h._source.featuredImageUrl,
      publishedAt: h._source.publishedAt,
      score: h._score,
    }));
    return { hits, total };
  } catch (err: any) {
    // Index-not-found is the common 404 case — degrades to empty, not an error.
    if (err.meta?.statusCode === 404) return { hits: [], total: 0 };
    logger.warn(`[languageIndex] searchInLanguage(${opts.language}) failed: ${err.message}`);
    return { hits: [], total: 0 };
  }
}

function normalizeTags(tags: string[] | string | null | undefined): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.filter(Boolean);
  if (typeof tags === 'string') {
    try {
      const parsed = JSON.parse(tags);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return tags.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return [];
}

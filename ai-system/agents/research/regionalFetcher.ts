/**
 * Regional fetcher — pulls each REGIONAL_SOURCES entry and normalizes the
 * result into a uniform article shape researchAgent can rank.
 *
 * Handles three response kinds:
 *   - rss : XML parsed via fast-xml-parser (already a backend dep)
 *   - json: arbitrary JSON, mapped via a small per-domain heuristic
 *   - html: minimal regex pull of <a> tags inside news/article elements
 *           (we don't pull Cheerio just for this — the heuristic is good
 *            enough for "is there a recent press-release link" signal)
 *
 * Each fetch is wrapped in a 12s timeout. Failures are logged + skipped.
 */

import { REGIONAL_SOURCES, RegionalSource } from './regionalSources';
import { XMLParser } from 'fast-xml-parser';

export interface FetchedArticle {
  url: string;
  title: string;
  summary?: string;
  publishedAt?: string;
  source: string;
  sourceName: string;
  region: RegionalSource['region'];
  country?: string;
  category: RegionalSource['category'];
  domain: string;
  credibility_score: number;
}

const FETCH_TIMEOUT_MS = 12_000;
const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'CoinDailyResearchBot/1.0 (+https://sygn.live)',
        Accept: 'application/json, application/xml, text/xml, text/html;q=0.9, */*;q=0.5',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAllRegionalSources(
  logger: { info: Function; warn: Function },
): Promise<FetchedArticle[]> {
  const results = await Promise.allSettled(
    REGIONAL_SOURCES.map(s => fetchOneSource(s).catch(err => {
      logger.warn(`[regionalFetcher] ${s.name} failed:`, err.message);
      return [] as FetchedArticle[];
    })),
  );

  const out: FetchedArticle[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') out.push(...r.value);
  }
  logger.info(`[regionalFetcher] Pulled ${out.length} articles from ${REGIONAL_SOURCES.length} sources`);
  return out;
}

async function fetchOneSource(src: RegionalSource): Promise<FetchedArticle[]> {
  const res = await fetchWithTimeout(src.url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.text();

  switch (src.kind) {
    case 'rss':
      return parseRss(body, src);
    case 'json':
      return parseJson(body, src);
    case 'html':
      return parseHtml(body, src);
  }
}

function parseRss(xml: string, src: RegionalSource): FetchedArticle[] {
  let parsed: any;
  try {
    parsed = xmlParser.parse(xml);
  } catch {
    return [];
  }

  // Handle RSS 2.0, Atom, and the SEC's edgar atom (channel.item vs feed.entry)
  const items: any[] =
    parsed?.rss?.channel?.item ||
    parsed?.feed?.entry ||
    parsed?.channel?.item ||
    [];
  const list = Array.isArray(items) ? items : [items];

  return list.slice(0, 20).map(item => {
    const url =
      item.link?.['@_href'] || (typeof item.link === 'string' ? item.link : item.link?.[0]?.['@_href']) || item.guid?.['#text'] || item.guid || '';
    const title = item.title?.['#text'] || item.title || 'Untitled';
    const summary = item.description || item.summary?.['#text'] || item.summary || '';
    const publishedAt = item.pubDate || item.published || item.updated;

    return {
      url: String(url).trim(),
      title: String(title).trim(),
      summary: String(summary).slice(0, 500),
      publishedAt: publishedAt ? new Date(publishedAt).toISOString() : undefined,
      source: src.domain,
      sourceName: src.name,
      region: src.region,
      country: src.country,
      category: src.category,
      domain: src.domain,
      credibility_score: src.credibility,
    };
  }).filter(a => a.url);
}

function parseJson(body: string, src: RegionalSource): FetchedArticle[] {
  let data: any;
  try {
    data = JSON.parse(body);
  } catch {
    return [];
  }

  // Try common shapes: { results: [...] } | { items: [...] } | { data: [...] } | bare array
  const list: any[] =
    data?.results || data?.items || data?.data || data?.articles || data?.entries || (Array.isArray(data) ? data : []);

  return list.slice(0, 20).map(item => {
    const url = item.url || item.link || item.html_url || item.permalink || '';
    const title = item.title || item.name || item.headline || 'Untitled';
    const summary = item.summary || item.description || item.excerpt || item.abstract || '';
    const publishedAt =
      item.published_at ||
      item.publishedAt ||
      item.publication_date ||
      item.date ||
      item.created_at;

    return {
      url: String(url).trim(),
      title: String(title).trim(),
      summary: String(summary).slice(0, 500),
      publishedAt: publishedAt ? new Date(publishedAt).toISOString() : undefined,
      source: src.domain,
      sourceName: src.name,
      region: src.region,
      country: src.country,
      category: src.category,
      domain: src.domain,
      credibility_score: src.credibility,
    };
  }).filter(a => a.url);
}

/**
 * HTML fallback — extracts <a> tags from press-release / news sections.
 * Intentionally crude: just grabs the first N article-like links and
 * uses link text as title. Real scraping (Cheerio + per-site selectors)
 * is out of scope for v2; revisit if a specific source becomes important.
 */
function parseHtml(html: string, src: RegionalSource): FetchedArticle[] {
  const out: FetchedArticle[] = [];
  const linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]{15,200})<\/a>/gi;
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = linkRe.exec(html)) !== null && count < 15) {
    const href = m[1];
    const text = m[2].trim();
    if (!/\b(news|press|comunicad|notici|announc|release|publica)/i.test(href + text)) continue;
    const url = href.startsWith('http') ? href : new URL(href, src.url).toString();
    out.push({
      url,
      title: text,
      source: src.domain,
      sourceName: src.name,
      region: src.region,
      country: src.country,
      category: src.category,
      domain: src.domain,
      credibility_score: src.credibility,
    });
    count++;
  }
  return out;
}

/**
 * Regional research sources — multi-region expansion for Research Agent v2.
 *
 * Existing researchAgent.ts covers 6 African regulator pages. This module
 * adds the US, LATAM, Caribbean, and global research-paper sources required
 * for the "info/data hub center" positioning across all CoinDaily regions.
 *
 * Each source is RSS or HTML; the agent fetches in parallel and dedupes
 * by URL/title before scoring. Failures are logged and skipped — one
 * source going dark never blocks the pipeline.
 */

export type SourceKind = 'rss' | 'html' | 'json';

export interface RegionalSource {
  name: string;
  url: string;
  kind: SourceKind;
  region: 'US' | 'LATAM' | 'CARIBBEAN' | 'PAPERS' | 'GLOBAL';
  country?: string;
  category: 'regulator' | 'central_bank' | 'agency' | 'research' | 'gov_announcement';
  domain: string;
  /** Credibility hint (0-100). Govt + central banks are 95; arXiv 90; etc. */
  credibility: number;
}

export const REGIONAL_SOURCES: RegionalSource[] = [
  // ─── US — Federal & Regulator ──────────────────────────────────────────────
  {
    name: 'Federal Register (recent rules)',
    url: 'https://www.federalregister.gov/api/v1/documents.json?per_page=20&order=newest&conditions[topics][]=crypto-assets',
    kind: 'json',
    region: 'US',
    country: 'US',
    category: 'agency',
    domain: 'federalregister.gov',
    credibility: 98,
  },
  {
    name: 'SEC press releases',
    url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&company=&dateb=&owner=include&count=20&output=atom',
    kind: 'rss',
    region: 'US',
    country: 'US',
    category: 'regulator',
    domain: 'sec.gov',
    credibility: 98,
  },
  {
    name: 'CFTC press releases',
    url: 'https://www.cftc.gov/PressRoom/PressReleases/feed',
    kind: 'rss',
    region: 'US',
    country: 'US',
    category: 'regulator',
    domain: 'cftc.gov',
    credibility: 95,
  },
  {
    name: 'US Treasury news',
    url: 'https://home.treasury.gov/news/press-releases/feed',
    kind: 'rss',
    region: 'US',
    country: 'US',
    category: 'agency',
    domain: 'treasury.gov',
    credibility: 97,
  },
  {
    name: 'NIST AI Risk Management updates',
    url: 'https://www.nist.gov/news-events/news/rss.xml',
    kind: 'rss',
    region: 'US',
    country: 'US',
    category: 'agency',
    domain: 'nist.gov',
    credibility: 95,
  },

  // ─── LATAM — Central Banks & Regulators ────────────────────────────────────
  {
    name: 'Banco Central do Brasil — notícias',
    url: 'https://www.bcb.gov.br/api/feed/sitebcb/ultimas-noticias',
    kind: 'json',
    region: 'LATAM',
    country: 'BR',
    category: 'central_bank',
    domain: 'bcb.gov.br',
    credibility: 95,
  },
  {
    name: 'CNBV México — comunicados',
    url: 'https://www.gob.mx/api/news/v1/dependencies/cnbv/articles?limit=20',
    kind: 'json',
    region: 'LATAM',
    country: 'MX',
    category: 'regulator',
    domain: 'gob.mx',
    credibility: 93,
  },
  {
    name: 'BCRA Argentina — comunicados',
    url: 'https://www.bcra.gob.ar/Noticias/Noticias.asp',
    kind: 'html',
    region: 'LATAM',
    country: 'AR',
    category: 'central_bank',
    domain: 'bcra.gob.ar',
    credibility: 92,
  },
  {
    name: 'Banco de la República (Colombia)',
    url: 'https://www.banrep.gov.co/es/feed/noticias.xml',
    kind: 'rss',
    region: 'LATAM',
    country: 'CO',
    category: 'central_bank',
    domain: 'banrep.gov.co',
    credibility: 94,
  },

  // ─── Caribbean — Central Banks & Regulators ────────────────────────────────
  {
    name: 'ECCB (Eastern Caribbean Central Bank)',
    url: 'https://www.eccb-centralbank.org/news',
    kind: 'html',
    region: 'CARIBBEAN',
    category: 'central_bank',
    domain: 'eccb-centralbank.org',
    credibility: 93,
  },
  {
    name: 'Bank of Jamaica — press',
    url: 'https://boj.org.jm/news/feed/',
    kind: 'rss',
    region: 'CARIBBEAN',
    country: 'JM',
    category: 'central_bank',
    domain: 'boj.org.jm',
    credibility: 94,
  },
  {
    name: 'Bank of Guyana — news',
    url: 'https://www.bankofguyana.org.gy/bog/news',
    kind: 'html',
    region: 'CARIBBEAN',
    country: 'GY',
    category: 'central_bank',
    domain: 'bankofguyana.org.gy',
    credibility: 90,
  },
  {
    name: 'Bahamas Securities Commission',
    url: 'https://www.scb.gov.bs/news/',
    kind: 'html',
    region: 'CARIBBEAN',
    country: 'BS',
    category: 'regulator',
    domain: 'scb.gov.bs',
    credibility: 90,
  },

  // ─── Research Papers & Global Bodies ───────────────────────────────────────
  {
    name: 'arXiv cs.AI new submissions',
    url: 'http://export.arxiv.org/rss/cs.AI',
    kind: 'rss',
    region: 'PAPERS',
    category: 'research',
    domain: 'arxiv.org',
    credibility: 88,
  },
  {
    name: 'arXiv q-fin (quantitative finance) new',
    url: 'http://export.arxiv.org/rss/q-fin',
    kind: 'rss',
    region: 'PAPERS',
    category: 'research',
    domain: 'arxiv.org',
    credibility: 88,
  },
  {
    name: 'BIS working papers',
    url: 'https://www.bis.org/doclist/wppubls.rss',
    kind: 'rss',
    region: 'GLOBAL',
    category: 'research',
    domain: 'bis.org',
    credibility: 96,
  },
  {
    name: 'IMF working papers',
    url: 'https://www.imf.org/external/np/feed/atom/working_papers.aspx',
    kind: 'rss',
    region: 'GLOBAL',
    category: 'research',
    domain: 'imf.org',
    credibility: 96,
  },
];

/**
 * Group sources by region. Used by the fetcher to parallelize and tag the
 * resulting articles with provenance.
 */
export function sourcesByRegion(): Record<string, RegionalSource[]> {
  const map: Record<string, RegionalSource[]> = {};
  for (const s of REGIONAL_SOURCES) {
    (map[s.region] ||= []).push(s);
  }
  return map;
}

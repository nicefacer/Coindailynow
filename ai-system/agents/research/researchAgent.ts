/**
 * Research Agent Wrapper for Review Agent Integration
 * Combines existing agents (NewsAggregation, TrendAnalysis, CryptoResearch)
 * to produce ResearchOutcome for Review Agent
 *
 * Fetches from multiple real data sources in parallel:
 *  1. Backend News API (/api/news)
 *  2. Backend regional endpoints (/api/news/region/:code)
 *  3. Backend financial news (/api/news/financial)
 *  4. RSS feed aggregation via NewsAggregationAgent
 *  5. TrendAnalysisAgent for trend context
 *  6. African regulatory body endpoints (Nigerian SEC, CBN, Kenya CMA, SA FSCA)
 *
 * All fetches use timeouts and partial-failure handling so a single
 * source going down never blocks the pipeline.
 */

import { Logger } from 'winston';
import { PrismaClient } from '@prisma/client';
import { ResearchOutcome, Source } from '../../types/admin-types';
import { fetchAllRegionalSources, FetchedArticle } from './regionalFetcher';
import { generateNarrativeAngles, NarrativeAngles } from './narrativeAngleAgent';
import { planResearch } from './plannerAgent';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
const HEALTH_CHECK_TIMEOUT_MS = 5_000;

const AFRICAN_REGIONS = ['NG', 'KE', 'ZA', 'GH', 'EG', 'TN', 'MA', 'SN', 'ZM', 'ZW'];

const AFRICAN_REGULATORY_SOURCES: Array<{
  name: string;
  url: string;
  domain: string;
  country: string;
}> = [
  { name: 'Nigerian SEC', url: 'https://sec.gov.ng/regulation/press-releases/', domain: 'sec.gov.ng', country: 'NG' },
  { name: 'CBN Nigeria', url: 'https://www.cbn.gov.ng/rates/ExchRateByCurrency.asp', domain: 'cbn.gov.ng', country: 'NG' },
  { name: 'Kenya CMA', url: 'https://www.cma.or.ke/index.php/regulatory-framework', domain: 'cma.or.ke', country: 'KE' },
  { name: 'SA FSCA', url: 'https://www.fsca.co.za/News%20Documents/Forms/AllItems.aspx', domain: 'fsca.co.za', country: 'ZA' },
  { name: 'Bank of Ghana', url: 'https://www.bog.gov.gh/economic-data/exchange-rate/', domain: 'bog.gov.gh', country: 'GH' },
  { name: 'CBE Egypt', url: 'https://www.cbe.org.eg/en/economic-research/statistics', domain: 'cbe.org.eg', country: 'EG' },
];

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TrendingTopic {
  keyword: string;
  volume: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  urgency: 'low' | 'medium' | 'high' | 'breaking';
  sources: Array<{
    url: string;
    title: string;
    publishedAt: Date;
    domain: string;
  }>;
}

interface RawArticle {
  url?: string;
  link?: string;
  id?: string;
  title?: string;
  summary?: string;
  description?: string;
  source?: string;
  sourceName?: string;
  publishedAt?: string;
  published_at?: string;
  pubDate?: string;
  sourceCredibility?: number;
  credibility_score?: number;
  urgency?: string;
  region?: string;
  category?: string;
  priority?: number;
  africanRelevance?: number;
  relevanceScore?: number;
  sentiment?: string;
}

interface HealthCheckResult {
  healthy: boolean;
  backendApi: { reachable: boolean; latencyMs: number; error?: string };
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Helper: fetch with timeout
// ---------------------------------------------------------------------------

async function fetchWithTimeout(
  url: string,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// ResearchAgent
// ---------------------------------------------------------------------------

export class ResearchAgent {
  private readonly apiBase: string;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger,
  ) {
    this.apiBase =
      process.env.BACKEND_API_URL || process.env.API_URL || 'http://localhost:4000';
  }

  // =========================================================================
  // Primary entry point — fetch trending topics from all real sources
  // =========================================================================

  async fetchTrendingTopics(): Promise<ResearchOutcome> {
    this.logger.info('[ResearchAgent] Fetching trending topics from multiple real sources…');

    const [
      newsResult,
      regionalResult,
      financialResult,
      rssResult,
      trendResult,
      regulatoryResult,
      multiRegionResult,
    ] = await Promise.allSettled([
      this.fetchBackendNews(),
      this.fetchRegionalNews(),
      this.fetchFinancialNews(),
      this.fetchRssAggregation(),
      this.fetchTrendAnalysis(),
      this.fetchAfricanRegulatoryData(),
      fetchAllRegionalSources(this.logger),
    ]);

    const allArticles: RawArticle[] = [];
    const sourceLabels: string[] = [];

    if (newsResult.status === 'fulfilled' && newsResult.value.length > 0) {
      allArticles.push(...newsResult.value);
      sourceLabels.push('backend_news_api');
    } else {
      this.logger.warn('[ResearchAgent] Backend news fetch failed or empty', {
        reason: newsResult.status === 'rejected' ? newsResult.reason?.message : 'empty',
      });
    }

    if (regionalResult.status === 'fulfilled' && regionalResult.value.length > 0) {
      allArticles.push(...regionalResult.value);
      sourceLabels.push('regional_news');
    }

    if (financialResult.status === 'fulfilled' && financialResult.value.length > 0) {
      allArticles.push(...financialResult.value);
      sourceLabels.push('financial_news');
    }

    if (rssResult.status === 'fulfilled' && rssResult.value.length > 0) {
      allArticles.push(...rssResult.value);
      sourceLabels.push('rss_aggregation');
    }

    if (trendResult.status === 'fulfilled' && trendResult.value.length > 0) {
      allArticles.push(...trendResult.value);
      sourceLabels.push('trend_analysis');
    }

    if (regulatoryResult.status === 'fulfilled' && regulatoryResult.value.length > 0) {
      allArticles.push(...regulatoryResult.value);
      sourceLabels.push('african_regulatory');
    }

    // Multi-region (US, LATAM, Caribbean, research papers, BIS/IMF) — P3.7
    if (multiRegionResult.status === 'fulfilled' && multiRegionResult.value.length > 0) {
      // FetchedArticle and RawArticle have compatible fields for our use here
      allArticles.push(...(multiRegionResult.value as any[]));
      sourceLabels.push('multi_region');
    } else if (multiRegionResult.status === 'rejected') {
      this.logger.warn('[ResearchAgent] Multi-region fetch failed', {
        reason: multiRegionResult.reason?.message,
      });
    }

    if (allArticles.length === 0) {
      this.logger.warn('[ResearchAgent] All sources returned empty — using NewsAggregationAgent fallback');
      return this.fallbackToNewsAggregationAgent();
    }

    const deduped = this.deduplicateArticles(allArticles);
    const scored = this.scoreAndRankArticles(deduped);
    const top = scored[0];

    const sources: Source[] = scored.slice(0, 10).map((a) => ({
      url: this.normalizeUrl(a),
      title: a.title || 'Untitled',
      published_at: new Date(a.publishedAt || a.published_at || a.pubDate || Date.now()),
      credibility_score: this.computeCredibilityScore(a),
      domain: this.extractDomain(a),
    }));

    const facts = scored.slice(0, 6).map(
      (a) => `${a.source || a.sourceName || 'Source'}: ${(a.summary || a.description || a.title || '').slice(0, 250)}`,
    );

    const topic = top.title || 'African crypto markets update';
    const coreMessage = top.summary || top.description || `Breaking coverage: ${topic}`;

    // P3.7 — region tally from scored articles for downstream regional routing.
    // Computed early so the planner (P3.11) can use it.
    const regionTally: Record<string, number> = {};
    for (const a of scored) {
      const r = (a as any).region;
      if (r) regionTally[r] = (regionTally[r] || 0) + 1;
    }

    // P3.7 — narrative angles (Ollama). Best-effort; returns null on any
    // failure so the pipeline keeps running with the existing single-angle flow.
    const dedupedSources = this.deduplicateSources(sources);
    let narrativeAngles: NarrativeAngles | null = await generateNarrativeAngles(
      {
        topic,
        coreMessage,
        sources: dedupedSources.slice(0, 8).map(s => ({
          title: s.title,
          domain: s.domain,
          region: (s as any).region,
        })),
      },
      this.logger,
    );

    // P3.11 — optional planner tool-use loop (Vercel AI SDK + Ollama).
    // Gated by ENABLE_PLANNER_LOOP=true; off by default so a slow/missing
    // model never blocks the existing static-source flow.
    const plan = await planResearch(
      {
        topic,
        coreMessage,
        regions: Object.keys(regionTally),
        existingUrls: dedupedSources.map(s => s.url),
      },
      this.logger,
    );
    let extraSources: Source[] = [];
    let extraFacts: string[] = [];
    if (plan) {
      extraSources = plan.additionalSources.map(s => ({
        url: s.url,
        title: s.title || s.url,
        published_at: new Date(),
        credibility_score: 80,
        domain: this.extractDomainFromUrl(s.url),
      }));
      extraFacts = plan.keyClaims;
      // If the planner produced angles AND the narrative-angle pass didn't, use the planner's.
      if (!narrativeAngles && (plan.suggestedAngles.positive || plan.suggestedAngles.negative)) {
        narrativeAngles = {
          positive: plan.suggestedAngles.positive,
          negative: plan.suggestedAngles.negative,
          regional_relevance: [],
        };
      }
      this.logger.info(
        `[ResearchAgent] planner enriched outcome: +${extraSources.length} sources, +${extraFacts.length} claims (${plan.toolCallCount} tool calls)`,
      );
    }

    // P3.11 — merge planner contributions into the returned outcome.
    const mergedSources = this.deduplicateSources([...dedupedSources, ...extraSources]);
    const mergedFacts = this.deduplicateFacts([...facts, ...extraFacts]);

    return {
      id: `research_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      topic,
      sources: mergedSources,
      facts: mergedFacts,
      core_message: coreMessage,
      word_count: 1200,
      sentiment: this.aggregateSentiment(scored),
      urgency: this.aggregateUrgency(scored),
      trending_score: Math.min(99, 50 + scored.length * 3),
      timestamp: new Date(),
      raw_data: {
        source_labels: [...sourceLabels, ...(plan ? ['planner_loop'] : [])],
        total_articles: allArticles.length,
        deduped_count: deduped.length,
        scored_count: scored.length,
        region_tally: regionTally,
        planner: plan
          ? {
              tool_calls: plan.toolCallCount,
              added_sources: extraSources.length,
              added_claims: extraFacts.length,
              reasoning: plan.reasoning,
            }
          : null,
      },
      narrative_angles: narrativeAngles ?? undefined,
    } as ResearchOutcome;
  }

  /** Bare-domain extractor used for planner-added sources that lack a domain field. */
  private extractDomainFromUrl(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  // =========================================================================
  // Re-research (unchanged public API — already fixed in prior task)
  // =========================================================================

  async reResearch(originalResearch: ResearchOutcome, instructions: string): Promise<ResearchOutcome> {
    this.logger.info('[ResearchAgent] Re-researching with instructions:', instructions);

    try {
      const keyword = this.extractKeyword(instructions, originalResearch.topic);
      const queryParams = new URLSearchParams({
        limit: '10',
        region: 'africa',
        ...(keyword ? { q: keyword } : {}),
      });

      const res = await fetchWithTimeout(`${this.apiBase}/api/news?${queryParams}`);
      if (!res.ok) {
        this.logger.warn(`[ResearchAgent] Re-research API returned ${res.status}, falling back to original`);
        return this.fallbackReResearch(originalResearch, instructions);
      }

      const json = (await res.json()) as { articles?: any[]; data?: any[] };
      const freshArticles = json.articles || json.data || [];

      if (freshArticles.length === 0) {
        this.logger.warn('[ResearchAgent] Re-research returned no articles, falling back to original');
        return this.fallbackReResearch(originalResearch, instructions);
      }

      const freshSources: Source[] = freshArticles.slice(0, 8).map((a: any) => ({
        url: a.url || a.link || `https://sygn.live/news/${a.id || 'item'}`,
        title: a.title || 'Untitled',
        published_at: new Date(a.publishedAt || a.published_at || Date.now()),
        credibility_score: Math.min(99, 70 + (a.sourceCredibility || 0) * 30),
        domain: (a.source || a.sourceName || 'coindaily').toString(),
      }));

      const mergedSources = this.deduplicateSources([...freshSources, ...originalResearch.sources]);

      const freshFacts = freshArticles.slice(0, 5).map(
        (a: any) => `${a.source || 'Source'}: ${(a.summary || a.title || '').slice(0, 200)}`,
      );
      const mergedFacts = this.deduplicateFacts([...freshFacts, ...originalResearch.facts]);

      const topFresh = freshArticles[0];
      const topic = topFresh.title || originalResearch.topic;
      const coreMessage =
        topFresh.summary || topFresh.description || originalResearch.core_message;

      return {
        id: `research_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        topic,
        sources: mergedSources,
        facts: mergedFacts,
        core_message: coreMessage,
        word_count: originalResearch.word_count,
        sentiment: originalResearch.sentiment,
        urgency: topFresh.urgency === 'breaking' ? 'breaking' : originalResearch.urgency,
        trending_score: Math.min(99, Math.max(originalResearch.trending_score, 60 + freshArticles.length * 4)),
        timestamp: new Date(),
        raw_data: {
          source: 'backend_news_api_reresearch',
          original_research_id: originalResearch.id,
          edit_instructions: instructions,
          fresh_article_count: freshArticles.length,
          merged_source_count: mergedSources.length,
        },
      };
    } catch (err: any) {
      this.logger.warn('[ResearchAgent] Re-research failed, falling back to original', { error: err.message });
      return this.fallbackReResearch(originalResearch, instructions);
    }
  }

  // =========================================================================
  // Health check — verifies backend API connectivity
  // =========================================================================

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const res = await fetchWithTimeout(
        `${this.apiBase}/api/news/stats`,
        HEALTH_CHECK_TIMEOUT_MS,
      );
      const latencyMs = Date.now() - start;
      if (res.ok) {
        return { healthy: true, backendApi: { reachable: true, latencyMs }, timestamp: new Date() };
      }
      return {
        healthy: false,
        backendApi: { reachable: false, latencyMs, error: `HTTP ${res.status}` },
        timestamp: new Date(),
      };
    } catch (err: any) {
      return {
        healthy: false,
        backendApi: { reachable: false, latencyMs: Date.now() - start, error: err.message },
        timestamp: new Date(),
      };
    }
  }

  // =========================================================================
  // Data source fetchers (all return RawArticle[])
  // =========================================================================

  private async fetchBackendNews(): Promise<RawArticle[]> {
    const res = await fetchWithTimeout(`${this.apiBase}/api/news?includeRss=true&includeApi=true&maxItems=30&sortBy=priority`);
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: any[]; articles?: any[] };
    return (json.data || json.articles || []) as RawArticle[];
  }

  private async fetchRegionalNews(): Promise<RawArticle[]> {
    const regions = ['NG', 'KE', 'ZA'];
    const results = await Promise.allSettled(
      regions.map(async (region) => {
        const res = await fetchWithTimeout(`${this.apiBase}/api/news/region/${region}?maxItems=10`);
        if (!res.ok) return [];
        const json = (await res.json()) as { data?: any[] };
        return (json.data || []) as RawArticle[];
      }),
    );
    const articles: RawArticle[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') articles.push(...r.value);
    }
    return articles;
  }

  private async fetchFinancialNews(): Promise<RawArticle[]> {
    const res = await fetchWithTimeout(`${this.apiBase}/api/news/financial`);
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: any[] };
    return (json.data || []) as RawArticle[];
  }

  private async fetchRssAggregation(): Promise<RawArticle[]> {
    try {
      const { NewsAggregationAgent } = await import('./NewsAggregationAgent.js');
      const aggregator = new NewsAggregationAgent();
      const task = await aggregator.execute(
        { taskType: 'aggregate', region: 'africa', limit: 12 },
        'normal',
      );
      const feed = (task as any)?.output?.feed;
      if (feed?.articles && Array.isArray(feed.articles)) {
        return feed.articles as RawArticle[];
      }
    } catch (err: any) {
      this.logger.warn('[ResearchAgent] RSS aggregation agent failed', { error: err.message });
    }
    return [];
  }

  private async fetchTrendAnalysis(): Promise<RawArticle[]> {
    try {
      const { TrendAnalysisAgent } = await import('../analysis/TrendAnalysisAgent.js');
      const trendAgent = new TrendAnalysisAgent();
      const task = await trendAgent.execute(
        { analysisType: 'trend_identification', data: { market: 'crypto', focus: 'africa' }, timeframe: '24h' },
        'normal',
      );
      const trends = (task as any)?.output?.trends;
      if (Array.isArray(trends)) {
        return trends.map((t: any) => ({
          title: t.name || t.trend || 'Trending topic',
          summary: t.description || t.summary || `${t.direction || ''} trend (strength: ${t.strength || 'unknown'})`,
          source: 'TrendAnalysis',
          publishedAt: new Date().toISOString(),
          category: 'trend',
          africanRelevance: t.africanRelevance ?? 0.5,
          sentiment: t.direction === 'bullish' ? 'positive' : t.direction === 'bearish' ? 'negative' : 'neutral',
        }));
      }
    } catch (err: any) {
      this.logger.warn('[ResearchAgent] Trend analysis agent failed', { error: err.message });
    }
    return [];
  }

  private async fetchAfricanRegulatoryData(): Promise<RawArticle[]> {
    const results = await Promise.allSettled(
      AFRICAN_REGULATORY_SOURCES.map(async (src) => {
        try {
          const res = await fetchWithTimeout(src.url, 8_000);
          if (res.ok) {
            return {
              title: `${src.name} — regulatory update`,
              summary: `Latest regulatory information from ${src.name} (${src.country})`,
              url: src.url,
              source: src.name,
              sourceName: src.name,
              publishedAt: new Date().toISOString(),
              sourceCredibility: 0.9,
              region: src.country,
              category: 'regulatory',
              africanRelevance: 1.0,
            } as RawArticle;
          }
        } catch {
          // Regulatory sites often block automated requests — this is expected
        }
        return null;
      }),
    );

    return results
      .filter((r): r is PromiseFulfilledResult<RawArticle | null> => r.status === 'fulfilled')
      .map((r) => r.value)
      .filter((a): a is RawArticle => a !== null);
  }

  // =========================================================================
  // Fallback: NewsAggregationAgent standalone
  // =========================================================================

  private async fallbackToNewsAggregationAgent(): Promise<ResearchOutcome> {
    const { NewsAggregationAgent } = await import('./NewsAggregationAgent.js');
    const aggregator = new NewsAggregationAgent();
    const aggTask = await aggregator.execute(
      { taskType: 'aggregate', region: 'africa', limit: 8 },
      'normal',
    );

    const feedArticles = (aggTask as any)?.output?.feed?.articles || [];
    const topic = feedArticles[0]?.title || 'African crypto market developments';
    const sources: Source[] = feedArticles.slice(0, 5).map((a: any) => ({
      url: a.url || '#',
      title: a.title,
      published_at: new Date(a.publishedAt || Date.now()),
      credibility_score: Math.round((a.sourceCredibility || 0.8) * 100),
      domain: a.source || 'aggregated',
    }));

    return {
      id: `research_${Date.now()}`,
      topic,
      sources,
      facts: feedArticles.slice(0, 4).map((a: any) => a.summary || a.title),
      core_message: feedArticles[0]?.summary || topic,
      word_count: 1200,
      sentiment: 'neutral',
      urgency: 'medium',
      trending_score: 75,
      timestamp: new Date(),
      raw_data: { source: 'news_aggregation_agent_fallback' },
    };
  }

  // =========================================================================
  // Scoring & ranking
  // =========================================================================

  private scoreAndRankArticles(articles: RawArticle[]): RawArticle[] {
    const now = Date.now();

    const scored = articles.map((a) => {
      let score = 0;

      // Recency: articles from the last 6 hours get the highest boost
      const pubTime = new Date(a.publishedAt || a.published_at || a.pubDate || 0).getTime();
      const ageHours = Math.max(0, (now - pubTime) / 3_600_000);
      if (ageHours < 6) score += 30;
      else if (ageHours < 24) score += 20;
      else if (ageHours < 72) score += 10;

      // African relevance boost
      const isAfricanRegion = a.region && AFRICAN_REGIONS.includes(a.region.toUpperCase());
      if (isAfricanRegion) score += 25;
      if (typeof a.africanRelevance === 'number') score += a.africanRelevance * 20;

      // Source credibility
      const cred = a.sourceCredibility ?? a.credibility_score ?? 0;
      score += (typeof cred === 'number' && cred <= 1 ? cred * 100 : cred) * 0.15;

      // Priority from backend
      if (typeof a.priority === 'number') score += a.priority * 0.1;

      // Relevance score from backend
      if (typeof a.relevanceScore === 'number') score += a.relevanceScore * 15;

      // Crypto/regulatory category boost
      const cat = (a.category || '').toLowerCase();
      if (cat.includes('crypto') || cat.includes('regulation') || cat.includes('regulatory')) score += 10;

      // Breaking urgency
      if (a.urgency === 'breaking') score += 20;

      return { ...a, _score: score };
    });

    scored.sort((a, b) => (b as any)._score - (a as any)._score);

    return scored;
  }

  private computeCredibilityScore(a: RawArticle): number {
    const raw = a.sourceCredibility ?? a.credibility_score ?? 0;
    const normalized = typeof raw === 'number' && raw <= 1 ? raw * 100 : raw;
    return Math.min(99, Math.max(10, Math.round(normalized || 70)));
  }

  // =========================================================================
  // Sentiment & urgency aggregation
  // =========================================================================

  private aggregateSentiment(articles: RawArticle[]): 'positive' | 'negative' | 'neutral' {
    let pos = 0;
    let neg = 0;
    for (const a of articles.slice(0, 10)) {
      const s = (a.sentiment || '').toLowerCase();
      if (s === 'positive' || s === 'bullish') pos++;
      else if (s === 'negative' || s === 'bearish') neg++;
    }
    if (pos > neg * 2) return 'positive';
    if (neg > pos * 2) return 'negative';
    return 'neutral';
  }

  private aggregateUrgency(articles: RawArticle[]): 'low' | 'medium' | 'high' | 'breaking' {
    if (articles.some((a) => a.urgency === 'breaking')) return 'breaking';
    if (articles.length >= 15) return 'high';
    if (articles.length >= 5) return 'medium';
    return 'low';
  }

  // =========================================================================
  // Deduplication helpers
  // =========================================================================

  private deduplicateArticles(articles: RawArticle[]): RawArticle[] {
    const seen = new Map<string, RawArticle>();
    for (const a of articles) {
      const urlKey = this.normalizeUrl(a).toLowerCase().replace(/\/+$/, '');
      const titleKey = (a.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const key = urlKey || titleKey;
      if (!key) continue;
      if (!seen.has(key)) {
        seen.set(key, a);
      }
    }
    return Array.from(seen.values());
  }

  private deduplicateSources(sources: Source[]): Source[] {
    const seen = new Map<string, Source>();
    for (const src of sources) {
      const key = src.url.replace(/\/+$/, '').toLowerCase();
      const existing = seen.get(key);
      if (!existing || src.credibility_score > existing.credibility_score) {
        seen.set(key, src);
      }
    }
    return Array.from(seen.values());
  }

  private deduplicateFacts(facts: string[]): string[] {
    const unique: string[] = [];
    const normalized = new Set<string>();
    for (const fact of facts) {
      const key = fact.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!normalized.has(key)) {
        normalized.add(key);
        unique.push(fact);
      }
    }
    return unique;
  }

  // =========================================================================
  // Utility helpers
  // =========================================================================

  private normalizeUrl(a: RawArticle): string {
    return a.url || a.link || `https://sygn.live/news/${a.id || 'item'}`;
  }

  private extractDomain(a: RawArticle): string {
    const raw = a.source || a.sourceName || '';
    if (raw) return raw.toString();
    try {
      return new URL(this.normalizeUrl(a)).hostname;
    } catch {
      return 'coindaily';
    }
  }

  private fallbackReResearch(originalResearch: ResearchOutcome, instructions: string): ResearchOutcome {
    return {
      ...originalResearch,
      id: `research_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: new Date(),
      raw_data: {
        ...originalResearch.raw_data,
        edit_requested: true,
        edit_instructions: instructions,
        fallback: true,
      },
    };
  }

  private extractKeyword(instructions: string, fallbackTopic: string): string {
    const lower = instructions.toLowerCase();
    const focusMatch = lower.match(/focus(?:\s+(?:on|more on))?\s+["']?([^"'.,:;!?]+)/);
    if (focusMatch) return focusMatch[1].trim();
    const aboutMatch = lower.match(/about\s+["']?([^"'.,:;!?]+)/);
    if (aboutMatch) return aboutMatch[1].trim();
    const topicWords = fallbackTopic.split(/\s+/).filter((w) => w.length > 3).slice(0, 3);
    return topicWords.join(' ');
  }
}

export default ResearchAgent;

/**
 * Government Announcement Monitor — standalone polling worker.
 *
 * Polls every regulator / central-bank / agency / govt-announcement source
 * from REGIONAL_SOURCES on a fixed interval (default 15min). Tracks last-seen
 * URLs in Redis per source. New items are:
 *   - written to Redis stream `gov_alerts:stream` (consumed by the editorial
 *     pipeline / aiReviewAgent for high-priority triage)
 *   - written to Redis list `gov_alerts:recent` (capped at 200, for the
 *     admin dashboard "incoming wire" view)
 *
 * Run standalone via PM2 or directly:
 *   tsx ai-system/workers/govMonitorRunner.ts
 *
 * Env:
 *   GOV_MONITOR_INTERVAL_MS  poll interval (default 900_000 = 15min)
 *   GOV_MONITOR_MAX_PER_SOURCE  max new items emitted per source per poll (default 5)
 *   GOV_MONITOR_DISABLE  set to "true" to no-op the worker (useful in tests)
 *   REDIS_URL  defaults to redis://localhost:6379
 */

import Redis from 'ioredis';
import type { Logger } from 'winston';
import { REGIONAL_SOURCES, RegionalSource } from '../agents/research/regionalSources';
import { fetchAllRegionalSources, FetchedArticle } from '../agents/research/regionalFetcher';

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_MAX_PER_SOURCE = 5;

const SEEN_KEY = (domain: string) => `gov_monitor:seen:${domain}`;
const ALERTS_STREAM = 'gov_alerts:stream';
const ALERTS_RECENT = 'gov_alerts:recent';
const RECENT_CAP = 200;
const SEEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const GOV_CATEGORIES: ReadonlyArray<RegionalSource['category']> = [
  'regulator',
  'central_bank',
  'agency',
  'gov_announcement',
];

export interface GovAlert {
  url: string;
  title: string;
  summary?: string;
  publishedAt?: string;
  source: string;
  sourceName: string;
  region: RegionalSource['region'];
  country?: string;
  category: RegionalSource['category'];
  credibility_score: number;
  detectedAt: string;
}

export interface GovMonitorOptions {
  redis: Redis;
  logger: Logger;
  intervalMs?: number;
  maxPerSource?: number;
}

export class GovMonitor {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopRequested = false;

  constructor(private readonly opts: GovMonitorOptions) {}

  async start(): Promise<void> {
    if (process.env.GOV_MONITOR_DISABLE === 'true') {
      this.opts.logger.info('[GovMonitor] disabled via env, not starting');
      return;
    }
    this.opts.logger.info('[GovMonitor] starting; first poll immediately');
    await this.pollOnce();
    this.scheduleNext();
  }

  async stop(): Promise<void> {
    this.stopRequested = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.opts.logger.info('[GovMonitor] stopped');
  }

  private scheduleNext(): void {
    if (this.stopRequested) return;
    const interval = this.opts.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.timer = setTimeout(() => this.pollOnce().finally(() => this.scheduleNext()), interval);
  }

  async pollOnce(): Promise<{ checked: number; emitted: number }> {
    if (this.running) {
      this.opts.logger.warn('[GovMonitor] previous poll still running, skipping');
      return { checked: 0, emitted: 0 };
    }
    this.running = true;

    const { redis, logger, maxPerSource = DEFAULT_MAX_PER_SOURCE } = this.opts;
    const startedAt = Date.now();

    try {
      const all = await fetchAllRegionalSources(logger as any);
      const govOnly = all.filter(a => GOV_CATEGORIES.includes(a.category));
      logger.info(`[GovMonitor] poll: ${all.length} total, ${govOnly.length} gov-only`);

      // Group by domain so we can apply per-source last-seen tracking.
      const bySource = new Map<string, FetchedArticle[]>();
      for (const a of govOnly) {
        if (!bySource.has(a.source)) bySource.set(a.source, []);
        bySource.get(a.source)!.push(a);
      }

      let emitted = 0;
      const pipeline = redis.pipeline();

      for (const [domain, articles] of bySource) {
        const seenRaw = (await redis.smembers(SEEN_KEY(domain))) || [];
        const seen = new Set(seenRaw);

        // Sort newest first by publishedAt if present, then take new ones.
        articles.sort((a, b) => {
          const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
          const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
          return tb - ta;
        });

        let newForSource = 0;
        for (const a of articles) {
          if (seen.has(a.url) || !a.url) continue;
          if (newForSource >= maxPerSource) break;

          const alert: GovAlert = {
            url: a.url,
            title: a.title,
            summary: a.summary,
            publishedAt: a.publishedAt,
            source: a.source,
            sourceName: a.sourceName,
            region: a.region,
            country: a.country,
            category: a.category,
            credibility_score: a.credibility_score,
            detectedAt: new Date().toISOString(),
          };

          pipeline.xadd(ALERTS_STREAM, '*', 'alert', JSON.stringify(alert));
          pipeline.lpush(ALERTS_RECENT, JSON.stringify(alert));
          pipeline.sadd(SEEN_KEY(domain), a.url);

          newForSource++;
          emitted++;
        }

        // Refresh TTL so seen sets don't grow forever
        pipeline.expire(SEEN_KEY(domain), SEEN_TTL_SECONDS);
      }

      pipeline.ltrim(ALERTS_RECENT, 0, RECENT_CAP - 1);
      await pipeline.exec();

      const durationMs = Date.now() - startedAt;
      logger.info(`[GovMonitor] poll done: ${emitted} new alerts in ${durationMs}ms`);
      return { checked: govOnly.length, emitted };
    } catch (err: any) {
      logger.warn('[GovMonitor] poll failed:', err.message);
      return { checked: 0, emitted: 0 };
    } finally {
      this.running = false;
    }
  }
}

/** Helper for one-shot manual runs (e.g. CLI / cron job). */
export async function runGovMonitorOnce(opts: GovMonitorOptions): Promise<void> {
  const m = new GovMonitor(opts);
  await m.pollOnce();
}

/**
 * Gov Alert Stream Consumer (P3.5 Task B).
 *
 * Subscribes to the Redis stream `gov_alerts:stream` written by the GovMonitor
 * worker. For each new alert whose credibility passes the threshold (and which
 * matches one of the topics we care about), enqueues a high-priority job that
 * kicks off a PipelineRun seeded with the alert as research outcome.
 *
 * Also drains the `gov_alerts:promoted` list (admin manual triggers from the
 * /admin/gov-alerts page) on the same cadence.
 *
 * Currently the "enqueue" step writes to Redis list `pipeline_runs:queue` —
 * a future worker (or a direct orchestrator call) processes it. Phase 3.5
 * keeps the indirection so we can swap to BullMQ later without touching
 * this consumer.
 *
 * Env knobs:
 *   GOV_ALERT_AUTO_CREATE        true|false (default true)
 *   GOV_ALERT_MIN_CREDIBILITY    integer 0-100 (default 90)
 *   GOV_ALERT_POLL_MS            stream block timeout in ms (default 10_000)
 */

import type Redis from 'ioredis';
import { logger } from '../utils/logger';

const STREAM_KEY = 'gov_alerts:stream';
const PROMOTED_LIST = 'gov_alerts:promoted';
const CONSUMER_LAST_ID_KEY = 'gov_alerts:consumer:last_id';
const ENQUEUE_LIST = 'pipeline_runs:queue';

const AUTO_CREATE = process.env.GOV_ALERT_AUTO_CREATE !== 'false';
const MIN_CREDIBILITY = parseInt(process.env.GOV_ALERT_MIN_CREDIBILITY || '90', 10);
const POLL_MS = parseInt(process.env.GOV_ALERT_POLL_MS || '10000', 10);

let running = false;
let stopRequested = false;

export interface GovAlert {
  url: string;
  title: string;
  summary?: string;
  publishedAt?: string;
  source: string;
  sourceName: string;
  region: string;
  country?: string;
  category: string;
  credibility_score: number;
  detectedAt: string;
}

export interface PipelineSeed {
  source: 'gov_alert_auto' | 'gov_alert_promote';
  topic: string;
  core_message?: string;
  sources: Array<{
    url: string;
    title: string;
    domain: string;
    credibility_score: number;
    published_at: string;
  }>;
  region?: string;
  category?: string;
  detected_at: string;
}

/**
 * Start the consumer. Single instance per backend process; safe no-op if already running.
 */
export function startGovAlertConsumer(redis: Redis): void {
  if (running) return;
  if (!AUTO_CREATE && process.env.GOV_ALERT_PROCESS_PROMOTIONS === 'false') {
    logger.info('[govAlertConsumer] disabled via env');
    return;
  }
  if (process.env.REDIS_ENABLED === 'false' || !process.env.REDIS_URL) {
    logger.info('[govAlertConsumer] skipped — Redis not configured (set REDIS_ENABLED=true + REDIS_URL to enable)');
    return;
  }
  running = true;
  stopRequested = false;
  logger.info(`[govAlertConsumer] starting; auto=${AUTO_CREATE} minCredibility=${MIN_CREDIBILITY}`);
  loop(redis).catch(err => {
    logger.error('[govAlertConsumer] fatal loop error', { err: err.message });
    running = false;
  });
}

export async function stopGovAlertConsumer(): Promise<void> {
  stopRequested = true;
  running = false;
}

async function loop(redis: Redis): Promise<void> {
  // Seed last-id on first run: start from "$" (new messages only) so we don't
  // re-process the whole backlog on a fresh boot. Persist after each batch.
  let lastId = (await redis.get(CONSUMER_LAST_ID_KEY)) || '$';

  while (!stopRequested) {
    try {
      // 1) Stream auto-alerts (XREAD blocks up to POLL_MS waiting for new messages)
      if (AUTO_CREATE) {
        try {
          const reply = (await redis.xread('BLOCK', POLL_MS, 'STREAMS', STREAM_KEY, lastId)) as any[] | null;
          if (reply && reply.length) {
            for (const [, entries] of reply) {
              for (const [id, fields] of entries as Array<[string, string[]]>) {
                lastId = id;
                const alert = parseStreamEntry(fields);
                if (!alert) continue;
                if (alert.credibility_score < MIN_CREDIBILITY) continue;
                await enqueueSeed(redis, toSeed(alert, 'gov_alert_auto'));
              }
            }
            await redis.set(CONSUMER_LAST_ID_KEY, lastId);
          }
        } catch (err: any) {
          // Stream might not exist yet (no alerts ever emitted) — XREAD will error.
          // Sleep and retry; don't spam logs.
          if (!err.message?.includes('no such key')) {
            logger.warn('[govAlertConsumer] xread failed', { err: err.message });
          }
          await sleep(POLL_MS);
        }
      } else {
        // Auto disabled — just poll the promoted list at the same cadence
        await sleep(POLL_MS);
      }

      // 2) Drain admin "promote" list (LPOP). Always processed regardless of AUTO_CREATE.
      await drainPromoted(redis);
    } catch (err: any) {
      logger.warn('[govAlertConsumer] iteration error', { err: err.message });
      await sleep(POLL_MS);
    }
  }
}

async function drainPromoted(redis: Redis): Promise<void> {
  // Pull up to 20 promotions per cycle so the worker stays responsive.
  for (let i = 0; i < 20; i++) {
    const raw = await redis.rpop(PROMOTED_LIST);
    if (!raw) return;
    try {
      const { url, at } = JSON.parse(raw) as { url: string; at: string };
      // Promoted entries don't carry the full alert; we look it up from recent.
      const recent = await redis.lrange('gov_alerts:recent', 0, -1);
      const alertRaw = recent.find(r => {
        try {
          return JSON.parse(r).url === url;
        } catch {
          return false;
        }
      });
      if (!alertRaw) {
        logger.warn(`[govAlertConsumer] promoted url ${url} not in recent list, skipping`);
        continue;
      }
      const alert = JSON.parse(alertRaw) as GovAlert;
      await enqueueSeed(redis, { ...toSeed(alert, 'gov_alert_promote'), detected_at: at });
    } catch (err: any) {
      logger.warn('[govAlertConsumer] promote parse failed', { err: err.message });
    }
  }
}

function parseStreamEntry(fields: string[]): GovAlert | null {
  // XADD wrote fields as ['alert', JSON]; flatten to a Record
  const map: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) map[fields[i]] = fields[i + 1];
  const raw = map.alert;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GovAlert;
  } catch {
    return null;
  }
}

function toSeed(alert: GovAlert, source: PipelineSeed['source']): PipelineSeed {
  return {
    source,
    topic: alert.title,
    core_message: alert.summary || `${alert.sourceName}: ${alert.title}`,
    sources: [
      {
        url: alert.url,
        title: alert.title,
        domain: alert.source,
        credibility_score: alert.credibility_score,
        published_at: alert.publishedAt || alert.detectedAt,
      },
    ],
    region: alert.region,
    category: alert.category,
    detected_at: alert.detectedAt,
  };
}

async function enqueueSeed(redis: Redis, seed: PipelineSeed): Promise<void> {
  await redis.lpush(ENQUEUE_LIST, JSON.stringify(seed));
  await redis.ltrim(ENQUEUE_LIST, 0, 499);
  logger.info(`[govAlertConsumer] enqueued seed (${seed.source}): ${seed.topic.slice(0, 80)}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

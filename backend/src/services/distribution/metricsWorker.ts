/**
 * Metrics polling worker (P8.4).
 *
 * Every METRICS_POLL_MIN minutes (default 30), pulls non-FAILED
 * DistributionPost rows that have been published within the last 7 days,
 * calls the platform adapter's fetchMetrics(), and writes back to the row.
 *
 * Adapters that don't implement metrics (e.g. WhatsApp) just return null
 * and the row is left unchanged — no error.
 */

import prisma from '../../lib/prisma';
import { logger } from '../../utils/logger';
import { initAdapters } from './registry';
import { getAdapter, type DistributionPlatform } from './socialAdapter';

const POLL_MIN = parseInt(process.env.METRICS_POLL_MIN || '30', 10);
const POLL_MS = POLL_MIN * 60_000;
const LOOKBACK_DAYS = parseInt(process.env.METRICS_LOOKBACK_DAYS || '7', 10);
const PAGE_SIZE = 100;

let timer: NodeJS.Timeout | null = null;
let stopRequested = false;

export function startMetricsWorker(): void {
  if (timer) return;
  if (process.env.METRICS_DISABLE === 'true') {
    logger.info('[metrics] disabled via env');
    return;
  }
  initAdapters();
  stopRequested = false;
  logger.info(`[metrics] starting; pollMin=${POLL_MIN} lookbackDays=${LOOKBACK_DAYS}`);
  // Initial run after a short delay so backend boot completes first
  timer = setTimeout(tick, 30_000);
}

export function stopMetricsWorker(): void {
  stopRequested = true;
  if (timer) { clearTimeout(timer); timer = null; }
}

async function tick(): Promise<void> {
  if (stopRequested) return;
  const startedAt = Date.now();
  let processed = 0;
  let updated = 0;

  try {
    const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const posts = await prisma.distributionPost.findMany({
      where: {
        status: { in: ['POSTED'] },
        externalId: { not: null },
        postedAt: { gte: cutoff },
      },
      orderBy: { lastMetricsAt: { sort: 'asc', nulls: 'first' } },
      take: PAGE_SIZE,
      include: {
        target: { select: { platform: true, metadata: true } },
      },
    });

    for (const post of posts) {
      processed++;
      const adapter = getAdapter(post.target.platform as DistributionPlatform);
      if (!adapter) continue;
      try {
        const metrics = await adapter.fetchMetrics(post.externalId!, (post.target.metadata as any) || undefined);
        if (metrics) {
          await prisma.distributionPost.update({
            where: { id: post.id },
            data: { metrics: metrics as any, lastMetricsAt: new Date() },
          });
          updated++;
        } else {
          // Still touch lastMetricsAt so we don't hammer the same null forever
          await prisma.distributionPost.update({
            where: { id: post.id },
            data: { lastMetricsAt: new Date() },
          });
        }
      } catch (err: any) {
        logger.warn(`[metrics] fetch failed for ${post.id} (${post.target.platform}): ${err.message}`);
      }
    }

    const ms = Date.now() - startedAt;
    logger.info(`[metrics] tick complete: processed=${processed} updated=${updated} in ${ms}ms`);
  } catch (err: any) {
    logger.error('[metrics] tick fatal', { err: err.message });
  } finally {
    if (!stopRequested) {
      timer = setTimeout(tick, POLL_MS);
    }
  }
}

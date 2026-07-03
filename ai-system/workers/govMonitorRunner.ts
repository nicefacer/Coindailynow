/**
 * Standalone entry point for the GovMonitor worker.
 *
 * PM2:
 *   pm2 start --name coindaily-govmonitor "tsx ai-system/workers/govMonitorRunner.ts"
 *
 * One-shot (cron):
 *   tsx ai-system/workers/govMonitorRunner.ts --once
 */

import Redis from 'ioredis';
import winston from 'winston';
import { GovMonitor, runGovMonitorOnce } from './govMonitor';

async function main() {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level}: ${message}`),
        ),
      }),
    ],
  });

  const once = process.argv.includes('--once');

  if (once) {
    await runGovMonitorOnce({ redis, logger });
    await redis.quit();
    process.exit(0);
  }

  const monitor = new GovMonitor({
    redis,
    logger,
    intervalMs: Number(process.env.GOV_MONITOR_INTERVAL_MS) || undefined,
    maxPerSource: Number(process.env.GOV_MONITOR_MAX_PER_SOURCE) || undefined,
  });

  const shutdown = async () => {
    logger.info('[govMonitorRunner] received shutdown signal');
    await monitor.stop();
    await redis.quit();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await monitor.start();
}

main().catch(err => {
  console.error('[govMonitorRunner] fatal:', err);
  process.exit(1);
});

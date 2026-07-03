/**
 * Pipeline Settings Routes (P4.4).
 *
 * Reads/writes a single JSON blob in SystemConfiguration under the key
 * `pipeline.settings`. Agents read settings via getPipelineSettings() which
 * falls back to env vars when the row is absent.
 */

import { Router, Request, Response } from 'express';
import { authMiddleware, requireCapability } from '../../middleware/auth';
import prisma from '../../lib/prisma';
import { logger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
router.use(authMiddleware as any);
router.use(requireCapability('ARTICLE_APPROVE') as any);

const KEY = 'pipeline.settings';

export interface PipelineSettings {
  enablePlannerLoop: boolean;
  requireFactCheck: boolean;
  factCheckSoftFailOnOutage: boolean;
  govAlertAutoCreate: boolean;
  govAlertMinCredibility: number;
  plannerMaxSteps: number;
  plannerCacheEnabled: boolean;
}

export const DEFAULT_SETTINGS: PipelineSettings = {
  enablePlannerLoop: process.env.ENABLE_PLANNER_LOOP === 'true',
  requireFactCheck: process.env.REQUIRE_FACT_CHECK !== 'false',
  factCheckSoftFailOnOutage: process.env.FACT_CHECK_SOFT_FAIL_ON_OUTAGE === 'true',
  govAlertAutoCreate: process.env.GOV_ALERT_AUTO_CREATE !== 'false',
  govAlertMinCredibility: parseInt(process.env.GOV_ALERT_MIN_CREDIBILITY || '90', 10),
  plannerMaxSteps: parseInt(process.env.PLANNER_MAX_STEPS || '8', 10),
  plannerCacheEnabled: process.env.PLANNER_CACHE_ENABLED !== 'false',
};

router.get('/', async (_req: Request, res: Response) => {
  try {
    const row = await prisma.systemConfiguration.findUnique({ where: { key: KEY } });
    if (!row?.value) {
      return res.json({ settings: DEFAULT_SETTINGS, source: 'env' });
    }
    try {
      const stored = JSON.parse(row.value) as Partial<PipelineSettings>;
      res.json({ settings: { ...DEFAULT_SETTINGS, ...stored }, source: 'db' });
    } catch {
      res.json({ settings: DEFAULT_SETTINGS, source: 'env' });
    }
  } catch (err: any) {
    logger.error('[pipelineSettings] get failed', { err: err.message });
    res.status(500).json({ error: 'Failed to read settings' });
  }
});

router.put('/', async (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<PipelineSettings>;
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'body required' });

    // Strict validation: only accept known keys with right types
    const next: PipelineSettings = { ...DEFAULT_SETTINGS };
    if (typeof body.enablePlannerLoop === 'boolean') next.enablePlannerLoop = body.enablePlannerLoop;
    if (typeof body.requireFactCheck === 'boolean') next.requireFactCheck = body.requireFactCheck;
    if (typeof body.factCheckSoftFailOnOutage === 'boolean') next.factCheckSoftFailOnOutage = body.factCheckSoftFailOnOutage;
    if (typeof body.govAlertAutoCreate === 'boolean') next.govAlertAutoCreate = body.govAlertAutoCreate;
    if (typeof body.govAlertMinCredibility === 'number' && body.govAlertMinCredibility >= 0 && body.govAlertMinCredibility <= 100) {
      next.govAlertMinCredibility = Math.round(body.govAlertMinCredibility);
    }
    if (typeof body.plannerMaxSteps === 'number' && body.plannerMaxSteps >= 1 && body.plannerMaxSteps <= 20) {
      next.plannerMaxSteps = Math.round(body.plannerMaxSteps);
    }
    if (typeof body.plannerCacheEnabled === 'boolean') next.plannerCacheEnabled = body.plannerCacheEnabled;

    await prisma.systemConfiguration.upsert({
      where: { key: KEY },
      create: { id: uuidv4(), key: KEY, value: JSON.stringify(next), updatedAt: new Date() },
      update: { value: JSON.stringify(next), updatedAt: new Date() },
    });
    res.json({ ok: true, settings: next });
  } catch (err: any) {
    logger.error('[pipelineSettings] put failed', { err: err.message });
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

/** Helper for agents/services to read the current effective settings. */
export async function getPipelineSettings(): Promise<PipelineSettings> {
  try {
    const row = await prisma.systemConfiguration.findUnique({ where: { key: KEY } });
    if (!row?.value) return DEFAULT_SETTINGS;
    const stored = JSON.parse(row.value) as Partial<PipelineSettings>;
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default router;

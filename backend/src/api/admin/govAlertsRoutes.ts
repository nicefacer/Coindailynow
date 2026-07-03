/**
 * Government Alerts Routes — exposes the GovMonitor's recent alerts list
 * to the admin UI. Read-only; the worker is the only writer.
 *
 * Mounted at /api/admin/gov-alerts in backend/src/index.ts.
 */

import { Router, Request, Response } from 'express';
import { authMiddleware, requireCapability } from '../../middleware/auth';
import { getRedis } from '../../lib/redis';
import { logger } from '../../utils/logger';

const router = Router();
const redis = getRedis();

router.use(authMiddleware as any);
router.use(requireCapability('ARTICLE_APPROVE') as any);

// GET /api/admin/gov-alerts/recent?limit=50
router.get('/recent', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
    const raw = await redis.lrange('gov_alerts:recent', 0, limit - 1);
    const alerts = raw
      .map(s => {
        try {
          return JSON.parse(s);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    res.json({ alerts, count: alerts.length });
  } catch (err: any) {
    logger.error('[govAlertsRoutes] recent failed', { err: err.message });
    res.status(500).json({ error: 'Failed to fetch gov alerts' });
  }
});

// POST /api/admin/gov-alerts/promote
// Mark a specific alert as the trigger for a new editorial pipeline run.
// (Phase 3.8 — body just persists the choice; orchestrator hookup is Phase 4.)
router.post('/promote', async (req: Request, res: Response) => {
  try {
    const { url } = req.body ?? {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url required' });
    }
    await redis.lpush('gov_alerts:promoted', JSON.stringify({ url, at: new Date().toISOString() }));
    await redis.ltrim('gov_alerts:promoted', 0, 99);
    res.json({ ok: true });
  } catch (err: any) {
    logger.error('[govAlertsRoutes] promote failed', { err: err.message });
    res.status(500).json({ error: 'Failed to promote alert' });
  }
});

export default router;

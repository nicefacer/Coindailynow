/**
 * Distribution admin routes (P7.3).
 *
 * GET  /api/admin/distribution/targets         list configured platform targets
 * POST /api/admin/distribution/targets         create/update a target
 * GET  /api/admin/distribution/posts           list recent posts (with metrics)
 * POST /api/admin/distribution/posts/republish republish an item to one or more platforms
 * GET  /api/admin/distribution/platforms       which adapters are configured (env-ready)
 */

import { Router, Request, Response } from 'express';
import { authMiddleware, requireCapability } from '../../middleware/auth';
import prisma from '../../lib/prisma';
import { getRedis } from '../../lib/redis';
import { logger } from '../../utils/logger';
import { initAdapters } from '../../services/distribution/registry';
import { listAdapters } from '../../services/distribution/socialAdapter';

const router = Router();
router.use(authMiddleware as any);
router.use(requireCapability('ARTICLE_APPROVE') as any);

router.get('/platforms', async (_req: Request, res: Response) => {
  initAdapters();
  res.json({
    platforms: listAdapters().map(a => ({
      platform: a.platform,
      configured: a.isConfigured(),
    })),
  });
});

router.get('/targets', async (_req: Request, res: Response) => {
  const targets = await prisma.distributionTarget.findMany({
    orderBy: [{ platform: 'asc' }, { handle: 'asc' }],
    select: { id: true, platform: true, handle: true, enabled: true, authMode: true, createdAt: true, updatedAt: true, metadata: true },
  });
  res.json({ targets });
});

router.post('/targets', async (req: Request, res: Response) => {
  try {
    const { platform, handle, enabled = true, authState, metadata } = req.body || {};
    if (!platform || !handle) return res.status(400).json({ error: 'platform + handle required' });

    const target = await prisma.distributionTarget.upsert({
      where: { platform_handle: { platform, handle } },
      create: { platform, handle, enabled, authState, metadata },
      update: { enabled, authState, metadata, updatedAt: new Date() },
    });
    res.json({ ok: true, target });
  } catch (err: any) {
    logger.error('[distribution] upsert target failed', { err: err.message });
    res.status(500).json({ error: 'Upsert failed', detail: err.message });
  }
});

router.get('/posts', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt((req.query.limit as string) || '100', 10), 500);
  const status = req.query.status as string | undefined;
  const itemType = req.query.itemType as string | undefined;

  const posts = await prisma.distributionPost.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(itemType ? { itemType } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      target: { select: { platform: true, handle: true } },
    },
  });
  res.json({ posts, count: posts.length });
});

router.post('/posts/republish', async (req: Request, res: Response) => {
  const { itemType, itemId, platforms } = req.body || {};
  if (!itemType || !itemId) return res.status(400).json({ error: 'itemType + itemId required' });

  const redis = getRedis();
  const jobType = itemType === 'video' ? 'video_run' : itemType;
  await (redis as any).lpush('distribution:queue', JSON.stringify({
    type: jobType, id: itemId, at: new Date().toISOString(), forcePlatforms: platforms,
  }));
  res.json({ ok: true, queued: true });
});

export default router;

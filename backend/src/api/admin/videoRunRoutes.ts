/**
 * Video Run Routes (P6.7) — admin surface for the video pipeline.
 *
 * GET  /api/admin/video-runs?status=READY_FOR_REVIEW   list runs
 * GET  /api/admin/video-runs/:runId                    full run + steps + assets
 * POST /api/admin/video-runs/:runId/approve            flip to APPROVED, enqueue distribution
 * POST /api/admin/video-runs/:runId/reject             flip to REJECTED
 * POST /api/admin/video-runs/:runId/steps/:stepName/rerun  re-execute one step
 */

import { Router, Request, Response } from 'express';
import { authMiddleware, requireCapability } from '../../middleware/auth';
import prisma from '../../lib/prisma';
import { logger } from '../../utils/logger';

const router = Router();
router.use(authMiddleware as any);
router.use(requireCapability('ARTICLE_APPROVE') as any);

router.get('/', async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || 'READY_FOR_REVIEW';
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
    const runs = await prisma.videoRun.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, articleId: true, status: true,
        totalDurationMs: true, totalCostUsd: true,
        createdAt: true, updatedAt: true,
        assets: { select: { format: true, url: true, provider: true } },
      },
    });
    res.json({ runs, count: runs.length });
  } catch (err: any) {
    logger.error('[videoRunRoutes] list failed', { err: err.message });
    res.status(500).json({ error: 'Failed to list video runs' });
  }
});

router.get('/:runId', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const run = await prisma.videoRun.findUnique({
      where: { id: runId },
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
        assets: true,
      },
    });
    if (!run) return res.status(404).json({ error: 'Video run not found' });

    // Pull the parent article for context
    const article = await prisma.article.findUnique({
      where: { id: run.articleId },
      select: {
        id: true, title: true, slug: true, excerpt: true, language: true,
        featuredImageUrl: true, publishedAt: true,
      },
    });

    res.json({ run, article });
  } catch (err: any) {
    logger.error('[videoRunRoutes] get failed', { err: err.message });
    res.status(500).json({ error: 'Failed to fetch video run' });
  }
});

router.post('/:runId/approve', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const run = await prisma.videoRun.findUnique({
      where: { id: runId },
      include: { assets: true },
    });
    if (!run) return res.status(404).json({ error: 'Video run not found' });
    if (run.status === 'APPROVED') return res.status(409).json({ error: 'already approved' });
    if (!run.assets.length) {
      return res.status(400).json({ error: 'no video assets — cannot approve' });
    }

    await prisma.videoRun.update({
      where: { id: runId },
      data: { status: 'APPROVED' },
    });

    // Phase 7 — enqueue distribution. Done as a fire-and-forget for now;
    // distribution worker picks it up from a Redis list.
    enqueueForDistribution(runId).catch(err =>
      logger.warn(`[video-approve] distribution enqueue failed: ${err.message}`),
    );

    res.json({ ok: true });
  } catch (err: any) {
    logger.error('[videoRunRoutes] approve failed', { err: err.message });
    res.status(500).json({ error: 'Approve failed', detail: err.message });
  }
});

router.post('/:runId/reject', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const { reason } = req.body ?? {};
    await prisma.videoRun.update({
      where: { id: runId },
      data: { status: 'REJECTED', errorMessage: reason || null },
    });
    res.json({ ok: true });
  } catch (err: any) {
    logger.error('[videoRunRoutes] reject failed', { err: err.message });
    res.status(500).json({ error: 'Reject failed', detail: err.message });
  }
});

router.post('/:runId/steps/:stepName/rerun', async (req: Request, res: Response) => {
  try {
    const { runId, stepName } = req.params;
    const { instructions } = req.body ?? {};
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    if (instructions && typeof instructions !== 'string') return res.status(400).json({ error: 'instructions must be a string' });
    if (instructions && instructions.length > 4000) return res.status(400).json({ error: 'instructions too long (max 4000)' });

    const { runVideoStepRerun } = await import('../../../../ai-system/orchestrator/videoStepExecutor');
    const result = await runVideoStepRerun(prisma, logger as any, { runId, stepName, instructions, userId });
    if (result.status === 'FAILED') {
      return res.status(500).json({ ok: false, stepName: result.stepName, errorMessage: result.errorMessage });
    }
    res.json({ ok: true, stepName: result.stepName, output: result.output, staleSteps: result.staleSteps });
  } catch (err: any) {
    logger.error('[videoRunRoutes] step rerun failed', { err: err.message });
    res.status(500).json({ error: 'Step rerun failed', detail: err.message });
  }
});

async function enqueueForDistribution(videoRunId: string): Promise<void> {
  const { getRedis } = await import('../../lib/redis');
  const redis = getRedis();
  await (redis as any).lpush('distribution:queue', JSON.stringify({
    type: 'video_run', id: videoRunId, at: new Date().toISOString(),
  }));
}

export default router;

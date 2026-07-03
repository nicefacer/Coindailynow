/**
 * Pipeline Run Routes
 *
 * REST surface for the new doc-based editorial review. The admin /admin/review/[runId]
 * page hits these to list runs, fetch a run's full state (including step I/O),
 * mint a short-lived collab token for the Hocuspocus WS, save a doc snapshot
 * outside the realtime channel, and approve a run into a published Article.
 *
 * Mounted at /api/admin/pipeline-runs in backend/src/index.ts.
 */

import { Router, Request, Response } from 'express';
import { authMiddleware, requireCapability } from '../../middleware/auth';
import prisma from '../../lib/prisma';
import { getRedis } from '../../lib/redis';
import { logger } from '../../utils/logger';
import { mintCollabToken } from '../../services/collabTokenService';
import { runStepRerun } from '../../../../ai-system/orchestrator/stepExecutor';
import { checkTranslationFaithfulness } from '../../../../ai-system/agents/translation/translationFactCheck';
import { tiptapToMarkdown } from '../../lib/tiptapToMarkdown';
import {
  indexArticleInLanguage,
  indexTranslation,
  IndexableArticle,
  IndexableTranslation,
} from '../../services/languageIndexService';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const redis = getRedis();

router.use(authMiddleware as any);
router.use(requireCapability('ARTICLE_APPROVE') as any);

// ============================================================================
// GET /api/admin/pipeline-runs?status=READY_FOR_REVIEW&limit=50
// ============================================================================

router.get('/', async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || 'READY_FOR_REVIEW';
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);

    const runs = await prisma.pipelineRun.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        topic: true,
        status: true,
        isMockMode: true,
        articleId: true,
        createdAt: true,
        updatedAt: true,
        // P4.5 — surface rolled-up cost/duration for the list page
        totalDurationMs: true,
        totalTokens: true,
        totalCostUsd: true,
        // P4.1 — show seed provenance
        seedSource: true,
        // P4.6 — workflow stamps
        submittedForReviewAt: true,
        approvedAt: true,
      },
    });

    res.json({ runs, count: runs.length });
  } catch (err: any) {
    logger.error('[pipelineRunRoutes] list failed', { err: err.message });
    res.status(500).json({ error: 'Failed to list pipeline runs' });
  }
});

// ============================================================================
// GET /api/admin/pipeline-runs/:runId — full run + steps + docJson
// ============================================================================

router.get('/:runId', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;

    const run = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
      },
    });

    if (!run) {
      return res.status(404).json({ error: 'Pipeline run not found' });
    }

    // docState (binary) is large + opaque — strip from REST payload.
    const { docState, ...safeRun } = run as any;
    res.json({ run: safeRun, hasDocState: Boolean(docState) });
  } catch (err: any) {
    logger.error('[pipelineRunRoutes] get failed', { err: err.message });
    res.status(500).json({ error: 'Failed to fetch pipeline run' });
  }
});

// ============================================================================
// POST /api/admin/pipeline-runs/:runId/collab-token
// Mints a short-lived token the frontend uses to authenticate the WS connection.
// ============================================================================

router.post('/:runId/collab-token', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const run = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      select: { id: true, status: true },
    });
    if (!run) {
      return res.status(404).json({ error: 'Pipeline run not found' });
    }
    if (run.status === 'APPROVED' || run.status === 'REJECTED') {
      return res.status(409).json({ error: `Run is ${run.status}, no longer editable` });
    }

    const { token, expiresIn } = mintCollabToken({
      runId,
      userId,
      role: 'editor',
    });
    res.json({ token, expiresIn });
  } catch (err: any) {
    logger.error('[pipelineRunRoutes] mint token failed', { err: err.message });
    res.status(500).json({ error: 'Failed to mint collab token' });
  }
});

// ============================================================================
// PUT /api/admin/pipeline-runs/:runId/doc
// Manual save fallback (non-realtime). Hocuspocus persists on every change,
// but this lets the client force-save a JSON snapshot during e.g. approval.
// ============================================================================

router.put('/:runId/doc', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const { docJson } = req.body;
    if (!docJson || typeof docJson !== 'object') {
      return res.status(400).json({ error: 'docJson (object) required' });
    }

    await prisma.pipelineRun.update({
      where: { id: runId },
      data: { docJson },
    });
    res.json({ ok: true });
  } catch (err: any) {
    logger.error('[pipelineRunRoutes] save doc failed', { err: err.message });
    res.status(500).json({ error: 'Failed to save doc' });
  }
});

// ============================================================================
// POST /api/admin/pipeline-runs/:runId/approve
// Converts the edited doc + run metadata into a published Article row.
// ============================================================================

router.post('/:runId/approve', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const { publishMode, scheduledAt } = req.body ?? {};
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // P4.2 — validate publishMode: "now" (default) | "scheduled"
    const mode: 'now' | 'scheduled' = publishMode === 'scheduled' ? 'scheduled' : 'now';
    let scheduledPublishAt: Date | null = null;
    if (mode === 'scheduled') {
      if (!scheduledAt) return res.status(400).json({ error: 'scheduledAt required when publishMode=scheduled' });
      const d = new Date(scheduledAt);
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'invalid scheduledAt' });
      if (d.getTime() <= Date.now()) return res.status(400).json({ error: 'scheduledAt must be in the future' });
      scheduledPublishAt = d;
    }

    const run = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!run) {
      return res.status(404).json({ error: 'Pipeline run not found' });
    }
    if (run.status === 'APPROVED') {
      return res.status(409).json({ error: 'Run already approved', articleId: run.articleId });
    }

    // P4.6 — role gate: only EDITOR+ can approve. SUBMITTED_FOR_REVIEW state is a soft requirement.
    const userRole = (req.user as any)?.role || 'CONTRIBUTOR';
    const APPROVER_ROLES = new Set(['EDITOR', 'CEO', 'CONTENT_ADMIN', 'ADMIN', 'SUPER_ADMIN']);
    if (!APPROVER_ROLES.has(userRole)) {
      return res.status(403).json({
        error: 'Approve requires EDITOR role or higher',
        userRole,
        hint: 'Use POST /:runId/submit-for-review if you are a contributor',
      });
    }

    // Pull the writer step output for title/excerpt and the embedImage step for content
    const writerStep = run.steps.find(s => s.stepName === 'writer');
    const embedStep = run.steps.find(s => s.stepName === 'embedImage');
    const imageStep = run.steps.find(s => s.stepName === 'image');

    if (!writerStep?.output) {
      return res.status(400).json({ error: 'Writer step output missing — run cannot be approved' });
    }

    const writerOutput = writerStep.output as any;
    const embedOutput = (embedStep?.output ?? writerOutput) as any;
    const imageOutput = imageStep?.output as any;

    // The editor's Y.Doc snapshot (run.docJson) is the source of truth — it
    // includes any human edits made after step generation. Serialize back to
    // markdown for storage on Article.content. Fall back to the AI's embed
    // output if the doc was never opened in the editor.
    const fromDoc = run.docJson ? tiptapToMarkdown(run.docJson as any) : '';
    const content = fromDoc.trim() || embedOutput.content || writerOutput.content;

    // P4.2 — publish-now sets PUBLISHED + publishedAt immediately;
    // scheduled writes SCHEDULED + publishScheduledAt for a future job to flip.
    const articleStatus = mode === 'now' ? 'PUBLISHED' : 'SCHEDULED';
    const article = await prisma.article.create({
      data: {
        id: uuidv4(),
        title: writerOutput.title,
        slug: slugify(writerOutput.title),
        excerpt: (writerOutput.content || '').slice(0, 280),
        content,
        featuredImageUrl: imageOutput?.url,
        authorId: userId,
        categoryId: writerOutput.categoryId || (writerOutput as any).category || 'general',
        status: articleStatus,
        readingTimeMinutes: Math.max(1, Math.round((writerOutput.word_count ?? 500) / 200)),
        aiGenerated: true,
        language: 'en',
        publishedAt: mode === 'now' ? new Date() : null,
        publishScheduledAt: scheduledPublishAt,
        updatedAt: new Date(),
      },
    });

    // P3.10 — persist per-language translations.
    // Preference order per language:
    //   1. PipelineTranslationDoc.docJson (human edited in the per-lang editor)
    //   2. translate step output[lang].content (AI auto-translation)
    const translateStep = run.steps.find(s => s.stepName === 'translate');
    const aiTranslations: any[] = Array.isArray(translateStep?.output) ? (translateStep!.output as any[]) : [];
    const editedDocs = await prisma.pipelineTranslationDoc.findMany({ where: { runId } });
    const editedByLang = new Map(editedDocs.map(d => [d.langCode, d]));

    let persistedTranslations = 0;
    for (const tr of aiTranslations) {
      const langCode = tr.language_code || tr.language;
      if (!langCode) continue;
      const edited = editedByLang.get(langCode);
      const fromEditor = edited?.docJson ? tiptapToMarkdown(edited.docJson as any).trim() : '';
      const content = fromEditor || tr.content || '';
      if (!content) continue;

      await prisma.articleTranslation.create({
        data: {
          id: uuidv4(),
          articleId: article.id,
          languageCode: langCode,
          title: tr.title || article.title,
          excerpt: content.slice(0, 280),
          content,
          translationStatus: edited ? 'HUMAN_REVIEWED' : 'AI_GENERATED',
          aiGenerated: true,
          humanReviewed: Boolean(edited),
          updatedAt: new Date(),
        },
      });
      persistedTranslations++;
    }

    await prisma.pipelineRun.update({
      where: { id: runId },
      data: {
        status: 'APPROVED',
        articleId: article.id,
        approvedAt: new Date(),
        approvedById: userId,
        scheduledPublishAt,
      },
    });

    await redis.lrem('admin_queue:pending', 0, runId);

    // P5.A3 — fire-and-forget per-language indexing into Elasticsearch.
    // Article goes into its primary-language index; each translation goes
    // into its language's index. Failures degrade silently so the approve
    // response isn't blocked by ES being slow/down.
    if (article.status === 'PUBLISHED') {
      indexPublishedArticleBundle(article, aiTranslations, editedByLang).catch(err =>
        logger.warn(`[approve] language indexing failed: ${err.message}`),
      );

      // P6.6 — fire-and-forget video pipeline. Produces SHORT + LONG
      // assets and queues them for human review at /admin/videos/<runId>.
      triggerVideoPipeline(article.id).catch(err =>
        logger.warn(`[approve] video pipeline failed: ${err.message}`),
      );
    }

    // P4.2 — fire-and-forget revalidate webhook so the public news site
    // re-renders the new article. Backend doesn't wait on the response.
    triggerFrontendRevalidate(article.slug).catch(err =>
      logger.warn(`[approve] revalidate ping failed: ${err.message}`),
    );

    res.json({
      ok: true,
      articleId: article.id,
      articleSlug: article.slug,
      articleStatus,
      publishedAt: article.publishedAt,
      scheduledPublishAt,
      translationsPersisted: persistedTranslations,
    });
  } catch (err: any) {
    logger.error('[pipelineRunRoutes] approve failed', { err: err.message });
    res.status(500).json({ error: 'Failed to approve pipeline run', detail: err.message });
  }
});

// ============================================================================
// POST /api/admin/pipeline-runs/:runId/steps/:stepName/rerun
// Re-execute a single step with optional human instructions. Marks downstream
// steps STALE. Returns the new step output so the client can decide whether
// to "Apply to doc".
// ============================================================================

router.post('/:runId/steps/:stepName/rerun', async (req: Request, res: Response) => {
  try {
    const { runId, stepName } = req.params;
    const { instructions, lang } = req.body ?? {};
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (instructions !== undefined && typeof instructions !== 'string') {
      return res.status(400).json({ error: 'instructions must be a string' });
    }
    if (instructions && instructions.length > 4000) {
      return res.status(400).json({ error: 'instructions too long (max 4000 chars)' });
    }
    if (lang !== undefined && (typeof lang !== 'string' || lang.length > 8)) {
      return res.status(400).json({ error: 'lang must be a short ISO code string' });
    }

    const result = await runStepRerun(prisma, redis, logger as any, {
      runId,
      stepName,
      instructions,
      lang,
      userId,
    });

    if (result.status === 'FAILED') {
      return res.status(500).json({
        ok: false,
        stepName: result.stepName,
        errorMessage: result.errorMessage,
      });
    }

    res.json({
      ok: true,
      stepName: result.stepName,
      output: result.output,
      staleSteps: result.staleSteps,
    });
  } catch (err: any) {
    logger.error('[pipelineRunRoutes] rerun failed', { err: err.message });
    res.status(500).json({ error: 'Step rerun failed', detail: err.message });
  }
});

// ============================================================================
// POST /api/admin/pipeline-runs/:runId/submit-for-review
// P4.6 — Contributors/journalists submit a draft for an EDITOR+ to approve.
// Transitions READY_FOR_REVIEW → SUBMITTED_FOR_REVIEW; stamps submittedBy+at.
// ============================================================================

router.post('/:runId/submit-for-review', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const run = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      select: { id: true, status: true },
    });
    if (!run) return res.status(404).json({ error: 'Pipeline run not found' });
    if (run.status === 'APPROVED' || run.status === 'REJECTED') {
      return res.status(409).json({ error: `Run is ${run.status}` });
    }

    const updated = await prisma.pipelineRun.update({
      where: { id: runId },
      data: {
        status: 'SUBMITTED_FOR_REVIEW',
        submittedForReviewAt: new Date(),
        submittedById: userId,
      },
      select: { id: true, status: true, submittedForReviewAt: true },
    });

    res.json({ ok: true, ...updated });
  } catch (err: any) {
    logger.error('[pipelineRunRoutes] submit failed', { err: err.message });
    res.status(500).json({ error: 'Submit failed', detail: err.message });
  }
});

// ============================================================================
// GET /api/admin/pipeline-runs/:runId/translation-edits
// Returns the language codes that have a human-edited Y.Doc (for the approve
// preview modal to badge HUMAN vs AI). Cheap — only reads the `langCode`
// column, not the heavy doc state.
// ============================================================================

router.get('/:runId/translation-edits', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const docs = await prisma.pipelineTranslationDoc.findMany({
      where: { runId, docJson: { not: undefined } },
      select: { langCode: true },
    });
    res.json({ edited: docs.map(d => d.langCode) });
  } catch (err: any) {
    logger.error('[pipelineRunRoutes] translation-edits failed', { err: err.message });
    res.status(500).json({ error: 'Failed to fetch translation edits' });
  }
});

// ============================================================================
// POST /api/admin/pipeline-runs/:runId/translations/:lang/factcheck
// P3.5 F — verify a translation conveys the same factual claims as the
// English original. Returns per-claim drift report; does NOT modify the
// translation. Editor decides whether to re-translate based on the result.
// ============================================================================

router.post('/:runId/translations/:lang/factcheck', async (req: Request, res: Response) => {
  try {
    const { runId, lang } = req.params;

    const run = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!run) return res.status(404).json({ error: 'Pipeline run not found' });

    const researchStep = run.steps.find(s => s.stepName === 'research');
    const translateStep = run.steps.find(s => s.stepName === 'translate');
    if (!researchStep?.output || !translateStep?.output) {
      return res.status(400).json({ error: 'research or translate step missing' });
    }

    const englishFacts: string[] = (researchStep.output as any).facts || [];
    const translations: any[] = Array.isArray(translateStep.output) ? (translateStep.output as any[]) : [];
    let target = translations.find(t => t.language_code === lang || t.language === lang);

    // Prefer the editor's live edits if any
    const edited = await prisma.pipelineTranslationDoc.findUnique({
      where: { runId_langCode: { runId, langCode: lang } },
    });
    const translationContent: string = edited?.docJson
      ? tiptapToMarkdown(edited.docJson as any)
      : target?.content || '';

    if (!translationContent.trim()) {
      return res.status(400).json({ error: `no translation content for lang=${lang}` });
    }

    const result = await checkTranslationFaithfulness(
      { englishFacts, translationContent, languageCode: lang },
      logger as any,
    );
    res.json({ ok: true, result });
  } catch (err: any) {
    logger.error('[pipelineRunRoutes] translation factcheck failed', { err: err.message });
    res.status(500).json({ error: 'Translation fact-check failed', detail: err.message });
  }
});

/**
 * P6.6 — kick off the video pipeline for a freshly-published article.
 * Lazy-loaded so backend boot doesn't pay the ai-system import cost.
 */
async function triggerVideoPipeline(articleId: string): Promise<void> {
  const { runVideoPipeline } = await import('../../../../ai-system/orchestrator/videoOrchestrator');
  await runVideoPipeline(prisma as any, redis as any, logger as any, articleId);
}

/**
 * P5.A3 — index the published Article + its translations into per-language ES.
 * Article writes to its primary-language index (isOriginal=true).
 * Each translation writes to its language's index (isOriginal=false) using
 * the editor-edited content when available (via pipelineTranslationDoc),
 * otherwise the AI auto-translation.
 */
async function indexPublishedArticleBundle(
  article: any,
  aiTranslations: any[],
  editedByLang: Map<string, any>,
): Promise<void> {
  const parent: IndexableArticle = {
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    content: article.content,
    language: article.language,
    categoryId: article.categoryId,
    tags: article.tags,
    featuredImageUrl: article.featuredImageUrl,
    territory: article.territory,
    authorId: article.authorId,
    status: article.status,
    publishedAt: article.publishedAt,
  };

  await indexArticleInLanguage(parent);

  for (const tr of aiTranslations) {
    const langCode = tr.language_code || tr.language;
    if (!langCode || langCode === parent.language) continue;
    const edited = editedByLang.get(langCode);
    const editedContent = edited?.docJson ? tiptapToMarkdown(edited.docJson as any).trim() : '';

    const translation: IndexableTranslation = {
      id: edited?.id || `${article.id}_${langCode}_pending`,
      articleId: article.id,
      languageCode: langCode,
      title: tr.title || article.title,
      excerpt: (editedContent || tr.content || '').slice(0, 280),
      content: editedContent || tr.content || '',
      translationStatus: edited ? 'HUMAN_REVIEWED' : 'AI_GENERATED',
    };
    await indexTranslation(translation, parent);
  }
}

/**
 * P4.2 — ping the public news site's revalidate endpoint so the new article
 * shows up without a deploy. Best-effort; logged on failure.
 *   Set FRONTEND_REVALIDATE_URL=https://sygn.live/api/revalidate
 *   Set FRONTEND_REVALIDATE_SECRET=<token>
 */
async function triggerFrontendRevalidate(slug: string): Promise<void> {
  const url = process.env.FRONTEND_REVALIDATE_URL;
  const secret = process.env.FRONTEND_REVALIDATE_SECRET;
  if (!url) return;
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({ slug, paths: [`/article/${slug}`, '/'] }),
    signal: AbortSignal.timeout(5000),
  });
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

export default router;

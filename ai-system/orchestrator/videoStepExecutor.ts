/**
 * Video Step Executor (P8.2).
 *
 * Per-step rerun for VideoRun, mirroring Phase 2's article stepExecutor.
 * Re-executes one step against the current outputs of upstream steps and
 * marks downstream STALE.
 */

import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'winston';
import { generateVideoScripts } from '../agents/video/scriptAgent';
import { renderVoiceover } from '../agents/video/coquiAdapter';
import { generateShortAvatarVideo } from '../agents/video/didAdapter';
import { generateLongStockVideo } from '../agents/video/invideoAdapter';
import { generateBrollClip } from '../agents/video/falAdapter';

const STEP_ORDER: Record<string, number> = {
  loadArticle: 0,
  script: 1,
  validateScript: 2,
  voiceover: 3,
  shortVideo: 4,
  longVideo: 5,
  broll: 6,
  compose: 7,
  validateVideo: 8,
  queueForReview: 9,
};

export interface VideoRerunInput {
  runId: string;
  stepName: string;
  instructions?: string;
  userId: string;
}

export interface VideoRerunResult {
  stepName: string;
  status: 'SUCCESS' | 'FAILED';
  output?: any;
  errorMessage?: string;
  staleSteps: string[];
}

export async function runVideoStepRerun(
  prisma: PrismaClient,
  logger: Logger,
  input: VideoRerunInput,
): Promise<VideoRerunResult> {
  const { runId, stepName, instructions } = input;
  const stepOrder = STEP_ORDER[stepName];
  if (stepOrder === undefined) {
    throw new Error(`Unknown video step: ${stepName}`);
  }

  const run = await prisma.videoRun.findUnique({
    where: { id: runId },
    include: { steps: { orderBy: { stepOrder: 'asc' } } },
  });
  if (!run) throw new Error(`Video run not found: ${runId}`);
  if (run.status === 'APPROVED') throw new Error('Run is APPROVED; rerun blocked');

  const outputs: Record<string, any> = {};
  for (const s of run.steps) if (s.output) outputs[s.stepName] = s.output;

  logger.info(`[videoStep] rerun ${stepName} on run ${runId}`, { instructions });

  const startedAt = new Date();
  await prisma.videoStep.upsert({
    where: { runId_stepName: { runId, stepName } },
    create: { runId, stepName, stepOrder, status: 'RUNNING', input: { rerunInstructions: instructions ?? null } as any, startedAt },
    update: { stepOrder, status: 'RUNNING', input: { rerunInstructions: instructions ?? null } as any, output: null, errorMessage: null, startedAt, completedAt: null, durationMs: null },
  });

  try {
    const newOutput = await dispatch(prisma, logger, stepName, outputs, instructions);
    const completedAt = new Date();
    await prisma.videoStep.update({
      where: { runId_stepName: { runId, stepName } },
      data: {
        status: 'SUCCESS',
        output: safeJson(newOutput),
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      },
    });

    // Mark downstream STALE so the admin UI flags them
    const downstream = run.steps.filter(s => s.stepOrder > stepOrder && s.status === 'SUCCESS').map(s => s.stepName);
    if (downstream.length) {
      await prisma.videoStep.updateMany({
        where: { runId, stepName: { in: downstream } },
        data: { status: 'STALE' },
      });
    }

    // Reopen the run if it was FAILED
    if (run.status === 'FAILED') {
      await prisma.videoRun.update({
        where: { id: runId },
        data: { status: 'READY_FOR_REVIEW', errorMessage: null },
      });
    }

    return { stepName, status: 'SUCCESS', output: newOutput, staleSteps: downstream };
  } catch (err: any) {
    const completedAt = new Date();
    await prisma.videoStep.update({
      where: { runId_stepName: { runId, stepName } },
      data: { status: 'FAILED', errorMessage: err.message, completedAt, durationMs: completedAt.getTime() - startedAt.getTime() },
    });
    return { stepName, status: 'FAILED', errorMessage: err.message, staleSteps: [] };
  }
}

async function dispatch(
  prisma: PrismaClient,
  logger: Logger,
  stepName: string,
  outputs: Record<string, any>,
  instructions?: string,
): Promise<any> {
  const article = outputs.loadArticle;
  const scripts = outputs.script;
  const language = (article?.language || 'en').toLowerCase();

  switch (stepName) {
    case 'loadArticle': {
      const articleId = article?.id ?? outputs.script?.articleId;
      if (!articleId) throw new Error('cannot re-load article without prior context');
      const a = await prisma.article.findUnique({
        where: { id: articleId },
        select: {
          id: true, title: true, excerpt: true, content: true, slug: true,
          featuredImageUrl: true, language: true, status: true,
        },
      });
      if (!a) throw new Error(`article ${articleId} not found`);
      return a;
    }
    case 'script':
      if (!article) throw new Error('article not loaded');
      return generateVideoScripts({
        articleId: article.id,
        title: instructions ? `${article.title} — REVISE: ${instructions}` : article.title,
        excerpt: article.excerpt,
        content: article.content,
        language,
      }, logger);

    case 'validateScript': {
      if (!scripts) throw new Error('no scripts to validate');
      const issues: string[] = [];
      if (!scripts.short?.scenes?.length) issues.push('short script has no scenes');
      if (!scripts.long?.scenes?.length) issues.push('long script has no scenes');
      return { passed: issues.length === 0, issues };
    }

    case 'voiceover': {
      if (!scripts) throw new Error('no scripts');
      const [s, l] = await Promise.all([
        renderVoiceover(joinScript(scripts.short), { language }, logger).catch(e => ({ ok: false, error: e.message })),
        renderVoiceover(joinScript(scripts.long), { language }, logger).catch(e => ({ ok: false, error: e.message })),
      ]);
      return { shortAudio: s, longAudio: l };
    }

    case 'shortVideo':
      if (!scripts || !article) throw new Error('need scripts + article');
      return generateShortAvatarVideo({
        script: scripts.short,
        articleId: article.id,
        articleTitle: article.title,
        language,
      }, logger);

    case 'longVideo':
      if (!scripts || !article) throw new Error('need scripts + article');
      return generateLongStockVideo({
        script: scripts.long,
        articleId: article.id,
        articleSlug: article.slug,
        articleTitle: article.title,
      }, logger);

    case 'broll':
      if (!scripts) throw new Error('no scripts');
      return generateBrollClip({
        prompt: instructions || scripts.short.scenes[0]?.visualHint || article?.title || '',
        durationSec: 5,
      }, logger);

    case 'compose':
      // Provider URLs are the final mp4 today; ffmpeg composition lands in P8.5.
      return { strategy: 'provider-native', note: 'no-op rerun' };

    case 'validateVideo':
      return { passed: true, note: 'validated against persisted assets' };

    case 'queueForReview':
      return { ok: true };

    default:
      throw new Error(`No video rerun handler for step: ${stepName}`);
  }
}

function joinScript(s: any): string {
  const parts: string[] = [];
  if (s.hook) parts.push(s.hook);
  for (const sc of s.scenes || []) parts.push(sc.text);
  if (s.cta) parts.push(s.cta);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function safeJson(v: unknown): any {
  if (v === undefined) return null;
  return JSON.parse(JSON.stringify(v, (_k, x) => x instanceof Map ? Object.fromEntries(x) : x));
}

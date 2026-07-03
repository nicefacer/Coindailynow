/**
 * Step Executor — re-runs an individual pipeline step on demand.
 *
 * Given (runId, stepName, instructions), this:
 *   1. Loads the run and the target step from Postgres
 *   2. Loads any upstream step outputs the target step depends on
 *      (e.g. `writer` needs `research`; `image` needs `writer`)
 *   3. Dispatches to the appropriate agent's revise/regenerate method
 *   4. Persists the new output via StepRecorder (overwrites prior output)
 *   5. Marks all downstream steps as STALE so the editor knows they're outdated
 *
 * Phase 2A — covers the 4 user-facing creative steps:
 *   research, writer, image, translate
 *   (validation + prompt steps re-run via simple "rerun without instructions"
 *    which just executes them again against current inputs.)
 *
 * NOT in Phase 2A:
 *   - auto-cascading downstream re-runs (intentional — editor decides per step)
 *   - real-time Y.Doc patching from server (editor pulls new output via "Apply to doc")
 */

import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import { Logger } from 'winston';

import ResearchAgent from '../agents/research/researchAgent';
import WriterAgent from '../agents/content/writerAgent';
import ImageAgent from '../agents/image/imageAgent';
import TranslationAgentForReview from '../agents/translation/translationAgentForReview';
import { StepRecorder, markRunFailed } from './stepRecorder';
import { checkFacts } from '../agents/research/factCheckAgent';

const STEP_ORDER: Record<string, number> = {
  research: 0,
  validateResearch: 1,
  factCheck: 2,
  writingPrompt: 3,
  writer: 4,
  validateArticle: 5,
  imagePrompt: 6,
  image: 7,
  validateImage: 8,
  embedImage: 9,
  translationPrompts: 10,
  translate: 11,
  validateTranslations: 12,
  queueForApproval: 13,
};

export interface RerunInput {
  runId: string;
  stepName: string;
  instructions?: string;
  userId: string;
  /** When stepName === 'translate', restrict regen to this language code (e.g. 'sw'). */
  lang?: string;
}

export interface RerunResult {
  stepName: string;
  status: 'SUCCESS' | 'FAILED';
  output?: any;
  errorMessage?: string;
  staleSteps: string[];
}

export class StepExecutor {
  private recorder: StepRecorder;
  private researchAgent: ResearchAgent;
  private writerAgent: WriterAgent;
  private imageAgent: ImageAgent;
  private translationAgent: TranslationAgentForReview;
  private readonly runId: string;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    private readonly logger: Logger,
    runId: string,
  ) {
    this.runId = runId;
    this.recorder = new StepRecorder(prisma, redis, runId);
    this.researchAgent = new ResearchAgent(prisma, logger);
    this.writerAgent = new WriterAgent(prisma, logger);
    this.imageAgent = new ImageAgent(logger);
    this.translationAgent = new TranslationAgentForReview(logger);
  }

  async rerun(input: RerunInput): Promise<RerunResult> {
    const { runId, stepName, instructions, lang } = input;
    const stepOrder = STEP_ORDER[stepName];
    if (stepOrder === undefined) {
      throw new Error(`Unknown step: ${stepName}`);
    }

    const run = await this.prisma.pipelineRun.findUnique({
      where: { id: runId },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!run) throw new Error(`Run not found: ${runId}`);
    if (run.status === 'APPROVED') {
      throw new Error('Run is already approved; rerun blocked');
    }

    // Build a lookup of existing step outputs (used to satisfy upstream deps)
    const outputs: Record<string, any> = {};
    for (const s of run.steps) {
      if (s.output) outputs[s.stepName] = s.output;
    }

    this.logger.info(`[StepExecutor] Rerunning ${stepName} on run ${runId}`, { instructions });

    try {
      const newOutput = await this.recorder.record(
        stepName,
        stepOrder,
        { rerunInstructions: instructions, lang, originalInput: outputs[stepName] ?? null },
        () => this.dispatch(stepName, outputs, instructions, lang),
      );

      // Per-language translation rerun does NOT invalidate downstream steps
      // (validateTranslations is the only thing downstream of translate,
      // and per-lang regen produces a partial update — we re-validate but
      // don't blow away the whole bundle).
      const staleSteps =
        stepName === 'translate' && lang
          ? []
          : await this.markDownstreamStale(runId, stepOrder, run.steps);

      // P3.5 G — when the English text changes (writer/embedImage/embed-related),
      // every per-language Y.Doc becomes stale: it was hydrated from an old
      // English version. Wipe their state so each tab re-hydrates next open.
      const ENGLISH_TEXT_STEPS = new Set(['writer', 'embedImage', 'writingPrompt']);
      if (ENGLISH_TEXT_STEPS.has(stepName)) {
        await this.resetTranslationDoc(runId, null);
      }

      // Re-open the run in case it was FAILED — a successful rerun puts it back in review.
      if (run.status === 'FAILED') {
        await this.prisma.pipelineRun.update({
          where: { id: runId },
          data: { status: 'READY_FOR_REVIEW', errorMessage: null },
        });
      }

      return {
        stepName,
        status: 'SUCCESS',
        output: newOutput,
        staleSteps,
      };
    } catch (err: any) {
      this.logger.error(`[StepExecutor] Rerun failed for ${stepName}:`, err);
      return {
        stepName,
        status: 'FAILED',
        errorMessage: err.message,
        staleSteps: [],
      };
    }
  }

  /**
   * Dispatches to the right agent based on stepName. Outputs is a snapshot
   * of every prior step's `output` field, keyed by stepName.
   */
  private async dispatch(
    stepName: string,
    outputs: Record<string, any>,
    instructions?: string,
    lang?: string,
  ): Promise<any> {
    const research = outputs.research;
    const article = outputs.writer;
    const articleWithImage = outputs.embedImage ?? article;
    const image = outputs.image;
    const writingPrompt = outputs.writingPrompt;
    const imagePrompt = outputs.imagePrompt;

    switch (stepName) {
      case 'research':
        if (!research) throw new Error('No prior research output to rerun against');
        return this.researchAgent.reResearch(research, instructions ?? 'Re-fetch latest sources');

      case 'writer':
        if (!article || !research) throw new Error('Need writer + research outputs to revise');
        return this.writerAgent.reviseArticle(article, instructions ?? 'Improve clarity', research);

      case 'image':
        if (!image || !article) throw new Error('Need image + article outputs to regenerate');
        return this.imageAgent.regenerateImage(
          image,
          instructions ?? 'Improve composition and visual quality',
          article,
        );

      case 'embedImage':
        if (!article || !image) throw new Error('Need article + image to re-embed');
        return this.embedImageIntoArticle(article, image);

      case 'translate': {
        if (!articleWithImage) throw new Error('Need article to retranslate');

        // Per-language rerun: regen ONE language, splice into existing array.
        if (lang) {
          const existing: any[] = Array.isArray(outputs.translate) ? outputs.translate : [];
          const target = existing.find(t => t.language_code === lang || t.language === lang);
          if (!target) throw new Error(`No existing translation for lang=${lang}`);
          const updated = await this.translationAgent.retranslateLanguage(
            target,
            target.language_code || lang,
            instructions ?? 'Improve clarity and accuracy',
          );
          // P3.10 — reset the per-language Y.Doc so the next open re-hydrates
          // from the fresh translation. Users were warned this overwrites in-editor edits.
          await this.resetTranslationDoc(this.runIdFor(outputs), lang);
          return existing.map(t =>
            t.language_code === lang || t.language === lang ? { ...t, ...updated } : t,
          );
        }

        // Full re-run all translations using prompts persisted from the prior
        // translationPrompts step.
        const promptsObj = outputs.translationPrompts || {};
        const promptsMap = new Map<string, string>(
          Array.isArray(promptsObj) ? promptsObj : Object.entries(promptsObj),
        );
        // P3.10 — wipe ALL per-language Y.Docs so each tab re-hydrates
        await this.resetTranslationDoc(this.runIdFor(outputs), null);
        return this.translationAgent.translateWithPrompts(promptsMap, articleWithImage);
      }

      // Cheap re-runs: just re-execute against current inputs (no instructions needed)
      case 'validateResearch':
        if (!research) throw new Error('No research to validate');
        return this.runValidation('research', research);

      case 'factCheck':
        if (!research) throw new Error('No research to fact-check');
        return checkFacts(
          {
            facts: research.facts || [],
            sources: (research.sources || []).map((s: any) => ({
              url: s.url,
              title: s.title,
              domain: s.domain,
              summary: s.summary,
            })),
            coreMessage: research.core_message,
            strictMode: true,
          },
          this.logger,
        );

      case 'validateArticle':
        if (!article) throw new Error('No article to validate');
        return this.runValidation('article', { article, research });

      case 'validateImage':
        if (!image) throw new Error('No image to validate');
        return this.runValidation('image', { image, article });

      case 'validateTranslations':
        if (!outputs.translate) throw new Error('No translations to validate');
        return this.runValidation('translations', {
          translations: outputs.translate,
          article: articleWithImage,
        });

      case 'writingPrompt':
      case 'imagePrompt':
      case 'translationPrompts':
        // Prompt regen is most useful when the human wants a different angle.
        // For Phase 2A we just no-op return the existing prompt with the
        // instructions appended so the next downstream rerun picks it up.
        return {
          ...outputs[stepName],
          regeneratedAt: new Date(),
          additionalGuidance: instructions ?? null,
        };

      default:
        throw new Error(`No rerun handler for step: ${stepName}`);
    }
  }

  /**
   * P3.10 — accessor used by the per-language reset path.
   * Kept as a method (rather than a direct field read at the call site)
   * so future per-run scoping logic has a single seam.
   */
  private runIdFor(_outputs: Record<string, any>): string {
    return this.runId;
  }

  /**
   * P3.10 — clear per-language Y.Doc state(s) after a translate rerun so
   * the editor re-hydrates from the fresh AI translation. Pass lang=null
   * to clear all languages (used on a full translate re-run).
   */
  private async resetTranslationDoc(runId: string, lang: string | null): Promise<void> {
    try {
      if (lang) {
        await this.prisma.pipelineTranslationDoc.deleteMany({
          where: { runId, langCode: lang },
        });
      } else {
        await this.prisma.pipelineTranslationDoc.deleteMany({ where: { runId } });
      }
    } catch (err: any) {
      this.logger.warn(`[StepExecutor] resetTranslationDoc(${runId}, ${lang}) failed: ${err.message}`);
    }
  }

  /**
   * Re-implements the image embed used in the original orchestrator.
   * Kept inline (rather than calling back into aiReviewAgent) to avoid
   * a circular dep — the executor is a peer of the orchestrator, not a
   * child.
   */
  private embedImageIntoArticle(article: any, image: any): any {
    if (!image?.url) return article;
    if (typeof article.content === 'string' && article.content.includes(image.url)) {
      return article;
    }
    const altText = (image.alt_text || article.title || 'Featured image').replace(
      /[\[\]()]/g,
      '',
    );
    return {
      ...article,
      content: `![${altText}](${image.url})\n\n${article.content}`,
    };
  }

  /**
   * Re-runs a validation step. Validations are pure functions of their input,
   * so we just call the original validator. Lazy-imports AIReviewAgent to
   * avoid the circular dep.
   */
  private async runValidation(kind: string, input: any): Promise<any> {
    // NodeNext module resolution requires explicit .js extension on dynamic imports.
    const { AIReviewAgent } = await import('../agents/review/aiReviewAgent.js');
    const agent = new AIReviewAgent(this.redis, this.logger, this.prisma);
    switch (kind) {
      case 'research':
        return agent.validateResearch(input);
      case 'article':
        return agent.validateArticle(input.article, input.research);
      case 'image':
        return agent.validateImage(input.image, input.article);
      case 'translations':
        return agent.validateTranslations(input.translations, input.article);
      default:
        throw new Error(`Unknown validation kind: ${kind}`);
    }
  }

  /**
   * Mark every step with stepOrder > current as STALE so the editor knows
   * the work after this point is outdated. The editor can then choose to
   * re-run them one by one (Phase 2) or auto-cascade (Phase 3).
   */
  private async markDownstreamStale(
    runId: string,
    fromStepOrder: number,
    currentSteps: Array<{ stepName: string; stepOrder: number; status: string }>,
  ): Promise<string[]> {
    const downstream = currentSteps.filter(
      s => s.stepOrder > fromStepOrder && s.status === 'SUCCESS',
    );
    if (!downstream.length) return [];

    await this.prisma.pipelineStep.updateMany({
      where: {
        runId,
        stepName: { in: downstream.map(s => s.stepName) },
      },
      data: { status: 'STALE' },
    });

    return downstream.map(s => s.stepName);
  }
}

/**
 * Convenience entry-point used by the backend route.
 * Returns the rerun result OR throws on misuse.
 */
export async function runStepRerun(
  prisma: PrismaClient,
  redis: Redis,
  logger: Logger,
  input: RerunInput,
): Promise<RerunResult> {
  const executor = new StepExecutor(prisma, redis, logger, input.runId);
  return executor.rerun(input);
}

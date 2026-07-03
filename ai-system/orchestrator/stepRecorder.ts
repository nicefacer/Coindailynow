/**
 * Step Recorder — persists every step of the editorial pipeline.
 *
 * Dual-writes to Postgres (PipelineRun / PipelineStep, source of truth) and
 * Redis (hot cache for the admin queue UI). Postgres is the system of record;
 * Redis exists so the admin dashboard never blocks on a DB round-trip.
 *
 * The recorder is owned by a single `orchestrateArticleCreation` call:
 *   const { runId, recorder } = await createPipelineRun(prisma, redis, topic, isMockMode);
 *   const research = await recorder.record('research', 0, {}, async () => researchAgent.fetchTrendingTopics());
 *   ...
 *   await markRunReady(prisma, redis, runId);
 */

import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';

const RUN_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days, matches existing admin_queue TTL

/**
 * P4.3 — per-step metrics. The wrapped step fn mutates an instance of this
 * (passed as its single argument) to record token counts, tool calls, and
 * synthetic cost estimates. The recorder persists it to PipelineStep.metrics
 * and aggregates onto PipelineRun.totalTokens / totalCostUsd.
 */
export interface StepMetrics {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /** USD estimate (synthetic — Ollama is free but we still track for parity with cloud LLM users) */
  costUsd?: number;
  /** Provider tag (e.g. 'ollama', 'iengine', 'duckduckgo') */
  provider?: string;
  /** Tool calls made during the step (e.g. by the planner loop) */
  toolCalls?: number;
  /** Arbitrary extra fields */
  extra?: Record<string, any>;
}

export function makeMetrics(): StepMetrics {
  return {};
}

/**
 * Helper for agents that call Ollama: extracts token counts from the response
 * body and adds to the metrics collector.
 */
export function addOllamaUsage(metrics: StepMetrics, ollamaBody: any): void {
  const prompt = Number(ollamaBody?.prompt_eval_count) || 0;
  const completion = Number(ollamaBody?.eval_count) || 0;
  if (prompt || completion) {
    metrics.promptTokens = (metrics.promptTokens || 0) + prompt;
    metrics.completionTokens = (metrics.completionTokens || 0) + completion;
    metrics.totalTokens = (metrics.totalTokens || 0) + prompt + completion;
    metrics.provider = metrics.provider || 'ollama';
  }
}

/** Flatten Maps, Dates, class instances, etc. into JSON-safe structures. */
function safeJson(value: unknown): any {
  if (value === undefined) return null;
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (v instanceof Map) return Object.fromEntries(v);
      if (v instanceof Set) return Array.from(v);
      return v;
    }),
  );
}

function redisRunKey(runId: string): string {
  return `pipeline_run:${runId}`;
}

function redisStepKey(runId: string): string {
  return `pipeline_run:${runId}:steps`;
}

export interface CreateRunResult {
  runId: string;
  recorder: StepRecorder;
}

/**
 * Create a new PipelineRun row and return a StepRecorder bound to it.
 */
export async function createPipelineRun(
  prisma: PrismaClient,
  redis: Redis,
  topic: string,
  isMockMode: boolean,
): Promise<CreateRunResult> {
  const run = await prisma.pipelineRun.create({
    data: {
      topic,
      status: 'RUNNING',
      isMockMode,
    },
    select: { id: true, topic: true, status: true, createdAt: true, isMockMode: true },
  });

  await redis.setex(
    redisRunKey(run.id),
    RUN_CACHE_TTL_SECONDS,
    JSON.stringify(run),
  );

  return {
    runId: run.id,
    recorder: new StepRecorder(prisma, redis, run.id),
  };
}

/**
 * Mark a run ready for human review. Called after step 12 succeeds.
 */
export async function markRunReady(
  prisma: PrismaClient,
  redis: Redis,
  runId: string,
): Promise<void> {
  const run = await prisma.pipelineRun.update({
    where: { id: runId },
    data: { status: 'READY_FOR_REVIEW' },
    select: { id: true, topic: true, status: true, createdAt: true, isMockMode: true },
  });

  await redis.setex(
    redisRunKey(runId),
    RUN_CACHE_TTL_SECONDS,
    JSON.stringify(run),
  );

  // Also push onto the review queue list so the existing admin UI sees it.
  await redis.lpush('admin_queue:pending', runId);
}

/**
 * Mark a run failed. Called from the orchestrator catch block.
 */
export async function markRunFailed(
  prisma: PrismaClient,
  redis: Redis,
  runId: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const run = await prisma.pipelineRun.update({
    where: { id: runId },
    data: { status: 'FAILED', errorMessage: message },
    select: { id: true, topic: true, status: true, createdAt: true, isMockMode: true, errorMessage: true },
  });

  await redis.setex(
    redisRunKey(runId),
    RUN_CACHE_TTL_SECONDS,
    JSON.stringify(run),
  );
}

export class StepRecorder {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    private readonly runId: string,
  ) {}

  /**
   * Wrap a pipeline step. Persists input before fn runs and output after.
   * Re-throws on failure (orchestrator decides whether to abort the run).
   *
   * The wrapped fn may push to `metricsCollector` (mutates the passed-in object)
   * to record per-step telemetry that lands in PipelineStep.metrics and rolls
   * up onto PipelineRun.totalTokens / totalCostUsd / totalDurationMs.
   */
  async record<T>(
    stepName: string,
    stepOrder: number,
    input: unknown,
    fn: (metrics: StepMetrics) => Promise<T> | Promise<T>,
  ): Promise<T> {
    const startedAt = new Date();

    // Insert (or reset, if this step is being re-run by a future Phase 2 caller)
    const inputJson = safeJson(input);
    await this.prisma.pipelineStep.upsert({
      where: { runId_stepName: { runId: this.runId, stepName } },
      create: {
        runId: this.runId,
        stepName,
        stepOrder,
        status: 'RUNNING',
        input: inputJson,
        startedAt,
      },
      update: {
        stepOrder,
        status: 'RUNNING',
        input: inputJson,
        output: null,
        errorMessage: null,
        startedAt,
        completedAt: null,
        durationMs: null,
      },
    });

    await this.redis.hset(
      redisStepKey(this.runId),
      stepName,
      JSON.stringify({ stepName, stepOrder, status: 'RUNNING', startedAt }),
    );
    await this.redis.expire(redisStepKey(this.runId), RUN_CACHE_TTL_SECONDS);

    const metrics = makeMetrics();
    try {
      const output = await fn(metrics);
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();
      const outputJson = safeJson(output);

      await this.prisma.pipelineStep.update({
        where: { runId_stepName: { runId: this.runId, stepName } },
        data: {
          status: 'SUCCESS',
          output: outputJson,
          completedAt,
          durationMs,
          metrics: safeJson(metrics),
        },
      });

      // P4.3 — roll metrics up onto the run for cheap list-page sums.
      await this.aggregateRunTotals();

      await this.redis.hset(
        redisStepKey(this.runId),
        stepName,
        JSON.stringify({ stepName, stepOrder, status: 'SUCCESS', startedAt, completedAt, durationMs }),
      );

      return output;
    } catch (error) {
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();
      const message = error instanceof Error ? error.message : String(error);

      await this.prisma.pipelineStep.update({
        where: { runId_stepName: { runId: this.runId, stepName } },
        data: {
          status: 'FAILED',
          errorMessage: message,
          completedAt,
          durationMs,
        },
      });

      await this.redis.hset(
        redisStepKey(this.runId),
        stepName,
        JSON.stringify({ stepName, stepOrder, status: 'FAILED', startedAt, completedAt, durationMs, errorMessage: message }),
      );

      throw error;
    }
  }

  /**
   * Sum durationMs / totalTokens / costUsd across all steps and write to
   * PipelineRun.total* fields. Cheap query (one run's steps).
   */
  private async aggregateRunTotals(): Promise<void> {
    const steps = await this.prisma.pipelineStep.findMany({
      where: { runId: this.runId },
      select: { durationMs: true, metrics: true },
    });
    let totalDurationMs = 0;
    let totalTokens = 0;
    let totalCostUsd = 0;
    for (const s of steps) {
      if (typeof s.durationMs === 'number') totalDurationMs += s.durationMs;
      const m = (s.metrics ?? {}) as any;
      if (typeof m.totalTokens === 'number') totalTokens += m.totalTokens;
      if (typeof m.costUsd === 'number') totalCostUsd += m.costUsd;
    }
    await this.prisma.pipelineRun.update({
      where: { id: this.runId },
      data: {
        totalDurationMs,
        totalTokens,
        totalCostUsd: totalCostUsd > 0 ? totalCostUsd : null,
      },
    });
  }
}

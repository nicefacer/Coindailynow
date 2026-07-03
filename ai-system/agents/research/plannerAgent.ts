/**
 * Planner Agent (P3.11) — proactive research planner using the Vercel AI SDK
 * tool-use loop, talking to local Ollama via `ollama-ai-provider-v2`.
 *
 * Why this lives here (rather than us writing our own loop): the SDK gives
 * us a battle-tested step controller (`maxSteps`), structured tool calling,
 * and provider abstraction. We supply the tools and the system prompt; the
 * SDK handles the search → fetch → reason cycle.
 *
 * Entrypoint:
 *   planResearch({ topic, regions, existingSources }) → enriched plan
 *
 * Returns:
 *   {
 *     additionalSources: [{url, title, snippet, region?}]
 *     keyClaims: string[]    // candidate facts the planner uncovered
 *     suggestedAngles: { positive, negative }
 *     reasoning: string      // short trail of what the planner did
 *   }
 *
 * Wired into researchAgent.ts behind ENABLE_PLANNER_LOOP=true so a misbehaving
 * Ollama install can't block the existing static-source pipeline.
 */

import { generateText } from 'ai';
import { createOllama } from 'ollama-ai-provider';
import type { Logger } from 'winston';
import Redis from 'ioredis';
import { createHash } from 'crypto';
import { plannerTools } from './plannerTools';

const OLLAMA_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const LLAMA_MODEL = process.env.LLAMA_MODEL || 'llama3.1:8b';
const PLANNER_MAX_STEPS = parseInt(process.env.PLANNER_MAX_STEPS || '8', 10);
const PLANNER_TIMEOUT_MS = parseInt(process.env.PLANNER_TIMEOUT_MS || '90000', 10);
const PLANNER_CACHE_TTL_SECONDS = parseInt(process.env.PLANNER_CACHE_TTL_SECONDS || `${60 * 60 * 24}`, 10);
const PLANNER_CACHE_ENABLED = process.env.PLANNER_CACHE_ENABLED !== 'false';

// Lazy-init shared Redis client. Returns null when REDIS_URL isn't set so
// callers can skip cache lookups gracefully.
let _redis: Redis | null | undefined;
function getRedisOrNull(): Redis | null {
  if (_redis !== undefined) return _redis;
  if (!process.env.REDIS_URL || process.env.REDIS_ENABLED === 'false') {
    _redis = null;
    return null;
  }
  try {
    _redis = new Redis(process.env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 1 });
    return _redis;
  } catch {
    _redis = null;
    return null;
  }
}

/**
 * P4.4 — best-effort dynamic settings load. Avoids importing the backend
 * directly (would create a cycle); reads SystemConfiguration row via Prisma.
 * Returns null on any error so callers always have an env fallback.
 */
async function tryLoadDbSettings(): Promise<any | null> {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const row = await prisma.systemConfiguration.findUnique({ where: { key: 'pipeline.settings' } });
    await prisma.$disconnect();
    if (!row?.value) return null;
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

function cacheKey(input: { topic: string; regions?: string[] }): string {
  const norm = JSON.stringify({
    t: input.topic.trim().toLowerCase(),
    r: [...(input.regions || [])].sort(),
  });
  return `planner:cache:${createHash('sha256').update(norm).digest('hex').slice(0, 24)}`;
}

export interface PlannerInput {
  topic: string;
  coreMessage?: string;
  /** Region tags we already care about (e.g. ['Africa','LATAM']). Drives search queries. */
  regions?: string[];
  /** Existing URLs the planner should NOT re-fetch. */
  existingUrls?: string[];
}

export interface PlannerResult {
  additionalSources: Array<{ url: string; title: string; snippet?: string; region?: string }>;
  keyClaims: string[];
  suggestedAngles: { positive: string; negative: string };
  reasoning: string;
  toolCallCount: number;
}

const SYSTEM_PROMPT = `You are CoinDaily's proactive research planner. Your job: given a topic, broaden the source pool by searching the web for primary, authoritative sources the static source list missed — government / regulator filings, central-bank notices, research papers, primary press releases. Then surface concrete claims (with numbers, dates, named entities) and a balanced positive / negative editorial framing.

Rules:
- Prefer .gov / central-bank / regulator / arxiv.org / bis.org / imf.org domains over generic news aggregators.
- Use webSearch first; pick the 2-4 most promising results; fetchUrl them; summarize if the body is long; then synthesize.
- Do NOT re-fetch URLs in existingUrls — they're already covered.
- Cite EVERY claim by its source URL. Vague "experts say" claims are forbidden.
- Be region-aware: weight sources from the regions listed in the input.
- Budget: at most ${PLANNER_MAX_STEPS} tool calls total. Stop early when you have enough.

Output your final answer as a JSON object with this shape (no prose around it):
{
  "additionalSources": [{ "url": "...", "title": "...", "snippet": "...", "region": "..." }],
  "keyClaims": ["concrete claim with number/date/entity", ...],
  "suggestedAngles": { "positive": "...", "negative": "..." },
  "reasoning": "one-paragraph trail of what you searched and why"
}`;

export async function planResearch(
  input: PlannerInput,
  logger: Logger,
): Promise<PlannerResult | null> {
  // P4.4 — check DB settings first; fall back to env. Lazy import to avoid
  // circular load from ai-system → backend.
  let enabled = process.env.ENABLE_PLANNER_LOOP === 'true';
  let maxStepsOverride: number | undefined;
  let cacheOverride: boolean | undefined;
  try {
    const settings = await tryLoadDbSettings();
    if (settings) {
      enabled = settings.enablePlannerLoop;
      maxStepsOverride = settings.plannerMaxSteps;
      cacheOverride = settings.plannerCacheEnabled;
    }
  } catch {
    /* fall through to env */
  }

  if (!enabled) {
    logger.info('[PlannerAgent] disabled (toggle in /admin/settings/pipeline or set ENABLE_PLANNER_LOOP=true)');
    return null;
  }

  // P3.5 I — Redis cache. Repeated runs on the same (topic, regions) skip the
  // tool-use loop entirely. TTL defaults to 24h; toggle via /admin/settings/pipeline.
  const cacheEnabled = cacheOverride ?? PLANNER_CACHE_ENABLED;
  const effectiveMaxSteps = maxStepsOverride ?? PLANNER_MAX_STEPS;
  const redis = cacheEnabled ? getRedisOrNull() : null;
  const key = cacheKey(input);
  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached) {
        logger.info('[PlannerAgent] cache HIT');
        return JSON.parse(cached);
      }
    } catch (err: any) {
      logger.warn(`[PlannerAgent] cache read failed: ${err.message}`);
    }
  }

  const ollama = createOllama({ baseURL: `${OLLAMA_URL}/api` });

  const userPrompt = buildUserPrompt(input);

  try {
    logger.info(`[PlannerAgent] starting tool-use loop (maxSteps=${effectiveMaxSteps})`);
    const t0 = Date.now();

    const { text, steps } = await generateText({
      model: ollama(LLAMA_MODEL),
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      tools: plannerTools,
      maxSteps: effectiveMaxSteps,
      abortSignal: AbortSignal.timeout(PLANNER_TIMEOUT_MS),
    });

    const elapsed = Date.now() - t0;
    const toolCalls = steps.reduce((n, s) => n + (s.toolCalls?.length ?? 0), 0);
    logger.info(`[PlannerAgent] done in ${elapsed}ms (${steps.length} steps, ${toolCalls} tool calls)`);

    const parsed = parsePlannerOutput(text);
    if (!parsed) {
      logger.warn('[PlannerAgent] could not parse final JSON; returning null');
      return null;
    }

    const result: PlannerResult = { ...parsed, toolCallCount: toolCalls };

    // Cache write — best-effort.
    if (redis) {
      try {
        await redis.setex(key, PLANNER_CACHE_TTL_SECONDS, JSON.stringify(result));
      } catch (err: any) {
        logger.warn(`[PlannerAgent] cache write failed: ${err.message}`);
      }
    }

    return result;
  } catch (err: any) {
    logger.warn(`[PlannerAgent] failed: ${err.message}`);
    return null;
  }
}

function buildUserPrompt(input: PlannerInput): string {
  const lines = [
    `TOPIC: ${input.topic}`,
  ];
  if (input.coreMessage) lines.push(`CORE MESSAGE: ${input.coreMessage}`);
  if (input.regions?.length) lines.push(`PRIORITY REGIONS: ${input.regions.join(', ')}`);
  if (input.existingUrls?.length) {
    const sample = input.existingUrls.slice(0, 12).join('\n  ');
    lines.push(`URLS ALREADY COVERED (do not re-fetch):\n  ${sample}`);
  }
  lines.push('Now go research. Aim for 3-6 new authoritative sources and 4-8 concrete claims.');
  return lines.join('\n\n');
}

function parsePlannerOutput(text: string): Omit<PlannerResult, 'toolCallCount'> | null {
  // Models often wrap JSON in code fences or include prose. Pull the largest
  // {...} block and try parsing.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]);
    return {
      additionalSources: Array.isArray(obj.additionalSources)
        ? obj.additionalSources
            .filter((s: any) => s && typeof s.url === 'string' && s.url.startsWith('http'))
            .slice(0, 12)
            .map((s: any) => ({
              url: String(s.url),
              title: String(s.title || ''),
              snippet: typeof s.snippet === 'string' ? s.snippet.slice(0, 400) : undefined,
              region: typeof s.region === 'string' ? s.region : undefined,
            }))
        : [],
      keyClaims: Array.isArray(obj.keyClaims)
        ? obj.keyClaims.filter((c: any) => typeof c === 'string').slice(0, 12)
        : [],
      suggestedAngles: {
        positive: String(obj.suggestedAngles?.positive || ''),
        negative: String(obj.suggestedAngles?.negative || ''),
      },
      reasoning: String(obj.reasoning || '').slice(0, 1000),
    };
  } catch {
    return null;
  }
}

/**
 * Fact-Check Agent (P3.9) — verifies the research agent's extracted
 * `facts[]` against the cited `sources[]` BEFORE the writer touches them.
 *
 * Stops the pipeline from producing a polished article around unverifiable
 * claims. Each fact gets:
 *   - supported: did at least one source corroborate it?
 *   - confidence: 0-100
 *   - supportingSources: indexes into research.sources for the editor to audit
 *
 * Uses Ollama (llama3.1:8b) with structured JSON output. Falls back to a
 * conservative "all unverified" report if Ollama is unreachable — the
 * orchestrator can choose whether to block or proceed (configurable via
 * editorialPolicy.requireFactCheck).
 *
 * Phase 3.9 — does NOT do live web verification (no fresh fetches).
 * Verification is bounded to the source summaries the research agent
 * already pulled. Live verification would require another tool-use loop,
 * which is part of the planner-loop work captured in P3.11.
 */

import type { Logger } from 'winston';
import { StepMetrics, addOllamaUsage } from '../../orchestrator/stepRecorder';

const OLLAMA_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const LLAMA_MODEL = process.env.LLAMA_MODEL || 'llama3.1:8b';
const TIMEOUT_MS = 45_000;

export interface FactCheckSource {
  url: string;
  title: string;
  domain: string;
  summary?: string;
}

export interface FactCheckClaim {
  /** Original claim text from research.facts[]. */
  claim: string;
  supported: boolean;
  confidence: number;
  /** 1-indexed positions into the sources array passed in. */
  supportingSources: number[];
  /** Short why-not when unsupported, helps the editor decide what to do. */
  reason?: string;
}

export interface FactCheckResult {
  passed: boolean;
  /** 0-100 — share of high-confidence supported claims. */
  score: number;
  totalClaims: number;
  supportedClaims: number;
  unsupportedClaims: number;
  claims: FactCheckClaim[];
  /** Set when Ollama was unreachable; caller may treat as soft-pass per policy. */
  fallback?: boolean;
}

export interface FactCheckInput {
  facts: string[];
  sources: FactCheckSource[];
  coreMessage?: string;
  /** A claim is "high-stakes" if it includes numbers, dates, or named entities. */
  strictMode?: boolean;
}

const HIGH_STAKES_RE = /\b(\d{1,3}(,\d{3})*(\.\d+)?%?|\$\d|\d{4}|Q[1-4]\s?20\d{2})\b/;
const MIN_CONFIDENCE_FOR_PASS = 60;

export async function checkFacts(
  input: FactCheckInput,
  logger: Logger,
  metrics?: StepMetrics,
): Promise<FactCheckResult> {
  const facts = (input.facts || []).filter(f => typeof f === 'string' && f.trim().length > 10);
  if (!facts.length) {
    return {
      passed: true,
      score: 100,
      totalClaims: 0,
      supportedClaims: 0,
      unsupportedClaims: 0,
      claims: [],
    };
  }

  const prompt = buildPrompt(facts, input.sources, input.coreMessage);

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLAMA_MODEL,
        prompt,
        format: 'json',
        stream: false,
        options: { temperature: 0.1, num_predict: 2000 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.warn(`[FactCheck] Ollama returned ${response.status}, returning conservative fallback`);
      return conservativeFallback(facts);
    }

    const data = (await response.json()) as { response?: string; prompt_eval_count?: number; eval_count?: number };
    if (metrics) addOllamaUsage(metrics, data);
    if (!data.response) return conservativeFallback(facts);

    return parseResponse(data.response, facts, input.strictMode ?? true);
  } catch (err: any) {
    logger.warn(`[FactCheck] verification failed (${err.message}), returning conservative fallback`);
    return conservativeFallback(facts);
  }
}

function buildPrompt(facts: string[], sources: FactCheckSource[], coreMessage?: string): string {
  const sourceList = sources
    .slice(0, 12)
    .map((s, i) => `[${i + 1}] ${s.title} — ${s.domain}\n    ${(s.summary || '').slice(0, 300)}`)
    .join('\n');

  const factList = facts.map((f, i) => `${i + 1}. ${f}`).join('\n');

  return `You are a fact-checker for a financial / crypto / AI news platform. Your only job is to verify whether each claim is supported by the provided sources. Be strict — assume claims are UNSUPPORTED unless a source clearly corroborates them.

${coreMessage ? `TOPIC CONTEXT:\n${coreMessage}\n\n` : ''}SOURCES:
${sourceList}

CLAIMS TO VERIFY:
${factList}

For EACH claim, return:
- supported: true ONLY if at least one source's title or summary directly supports the claim
- confidence: 0-100 — how sure are you the supporting source actually says what the claim says
- supportingSources: array of source numbers (e.g. [1, 3]) that corroborate it; [] if none
- reason: short note when unsupported (e.g. "no source mentions this percentage", "source talks about Q1 not Q3")

Output ONLY valid JSON in this exact shape (no prose):
{
  "claims": [
    { "claim": "<original claim text>", "supported": true|false, "confidence": <0-100>, "supportingSources": [<int>, ...], "reason": "<short, optional>" }
  ]
}

Rules:
- Numbers, dates, currency amounts must match the source — "rose 40%" is NOT supported by "rose significantly".
- A source's title alone is enough IF it directly states the claim.
- Do not invent supporting sources. If unsure → supported: false, confidence < 50.
- Include every claim from the list, in order.`;
}

function parseResponse(raw: string, originalFacts: string[], strict: boolean): FactCheckResult {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return conservativeFallback(originalFacts);
  }

  const claimsRaw: any[] = Array.isArray(parsed.claims) ? parsed.claims : [];
  if (!claimsRaw.length) return conservativeFallback(originalFacts);

  const claims: FactCheckClaim[] = originalFacts.map((claim, i) => {
    const result = claimsRaw[i];
    if (!result) {
      return { claim, supported: false, confidence: 0, supportingSources: [], reason: 'no verification result' };
    }
    return {
      claim,
      supported: Boolean(result.supported),
      confidence: clampConfidence(result.confidence),
      supportingSources: Array.isArray(result.supportingSources)
        ? result.supportingSources.filter((n: any) => Number.isInteger(n) && n > 0).slice(0, 5)
        : [],
      reason: typeof result.reason === 'string' ? result.reason.slice(0, 200) : undefined,
    };
  });

  const supportedClaims = claims.filter(
    c => c.supported && c.confidence >= MIN_CONFIDENCE_FOR_PASS,
  ).length;
  const unsupportedClaims = claims.length - supportedClaims;
  const score = Math.round((supportedClaims / claims.length) * 100);

  // In strict mode, ANY high-stakes claim (number/date/dollar) that is
  // unsupported with confidence ≥ 60 fails the step.
  let passed = score >= 70;
  if (strict) {
    const highStakesFails = claims.filter(
      c => HIGH_STAKES_RE.test(c.claim) && !c.supported && c.confidence >= 60,
    );
    if (highStakesFails.length) passed = false;
  }

  return {
    passed,
    score,
    totalClaims: claims.length,
    supportedClaims,
    unsupportedClaims,
    claims,
  };
}

function clampConfidence(n: any): number {
  const num = Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function conservativeFallback(facts: string[]): FactCheckResult {
  return {
    passed: false,
    score: 0,
    totalClaims: facts.length,
    supportedClaims: 0,
    unsupportedClaims: facts.length,
    claims: facts.map(claim => ({
      claim,
      supported: false,
      confidence: 0,
      supportingSources: [],
      reason: 'fact-check service unavailable',
    })),
    fallback: true,
  };
}

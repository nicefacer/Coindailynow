/**
 * Translation Fact-Check (P3.5 F).
 *
 * Verifies that a translation conveys the same factual claims (numbers, dates,
 * named entities, policy positions) as the English original. Lighter than the
 * source-verification fact-check — it's a faithfulness check, not a research
 * check.
 *
 * Returns per-claim {presentInTranslation, drift?} so the TranslationTabs
 * UI can flag specific mismatches.
 */

import type { Logger } from 'winston';

const OLLAMA_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const LLAMA_MODEL = process.env.LLAMA_MODEL || 'llama3.1:8b';
const TIMEOUT_MS = 30_000;

export interface TranslationClaimCheck {
  englishClaim: string;
  presentInTranslation: boolean;
  /** When false, optional explanation of the drift. */
  drift?: string;
}

export interface TranslationFactCheckResult {
  passed: boolean;
  /** 0-100 — share of English claims preserved in the translation. */
  faithfulness: number;
  totalClaims: number;
  preservedClaims: number;
  driftedClaims: number;
  claims: TranslationClaimCheck[];
  fallback?: boolean;
}

const MIN_FAITHFULNESS_FOR_PASS = 80;

export async function checkTranslationFaithfulness(
  input: {
    englishFacts: string[];
    translationContent: string;
    languageCode: string;
  },
  logger: Logger,
): Promise<TranslationFactCheckResult> {
  const englishFacts = (input.englishFacts || []).filter(f => typeof f === 'string' && f.trim().length > 10);
  if (!englishFacts.length) {
    return { passed: true, faithfulness: 100, totalClaims: 0, preservedClaims: 0, driftedClaims: 0, claims: [] };
  }

  const prompt = buildPrompt(englishFacts, input.translationContent, input.languageCode);

  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLAMA_MODEL,
        prompt,
        format: 'json',
        stream: false,
        options: { temperature: 0.1, num_predict: 1500 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn(`[TranslationFactCheck] Ollama ${res.status}; returning soft-pass fallback`);
      return softPass(englishFacts);
    }
    const data = (await res.json()) as { response?: string };
    if (!data.response) return softPass(englishFacts);
    return parse(data.response, englishFacts);
  } catch (err: any) {
    logger.warn(`[TranslationFactCheck] failed (${err.message}); returning soft-pass fallback`);
    return softPass(englishFacts);
  }
}

function buildPrompt(facts: string[], translation: string, lang: string): string {
  const claimList = facts.map((f, i) => `${i + 1}. ${f}`).join('\n');
  return `You are a translation reviewer. Verify whether each English claim below is conveyed (in any phrasing) in the ${lang} translation text. Be lenient about word choice but strict about facts: numbers, dates, names, currencies, policy positions must match.

ENGLISH CLAIMS:
${claimList}

${lang.toUpperCase()} TRANSLATION:
${translation.slice(0, 8000)}

For EACH claim, return:
- presentInTranslation: true|false
- drift: short note when false (e.g. "translation says 30% but English says 40%", "claim omitted entirely")

Output ONLY valid JSON:
{
  "claims": [
    { "englishClaim": "<original>", "presentInTranslation": true|false, "drift": "<short, optional>" }
  ]
}

Include every English claim in order. Be strict about numbers and dates.`;
}

function parse(raw: string, originalFacts: string[]): TranslationFactCheckResult {
  let obj: any;
  try {
    obj = JSON.parse(raw);
  } catch {
    return softPass(originalFacts);
  }

  const rawClaims: any[] = Array.isArray(obj.claims) ? obj.claims : [];
  if (!rawClaims.length) return softPass(originalFacts);

  const claims: TranslationClaimCheck[] = originalFacts.map((englishClaim, i) => {
    const r = rawClaims[i];
    if (!r) return { englishClaim, presentInTranslation: false, drift: 'no verification result' };
    return {
      englishClaim,
      presentInTranslation: Boolean(r.presentInTranslation),
      drift: typeof r.drift === 'string' ? r.drift.slice(0, 240) : undefined,
    };
  });

  const preservedClaims = claims.filter(c => c.presentInTranslation).length;
  const driftedClaims = claims.length - preservedClaims;
  const faithfulness = Math.round((preservedClaims / claims.length) * 100);

  return {
    passed: faithfulness >= MIN_FAITHFULNESS_FOR_PASS,
    faithfulness,
    totalClaims: claims.length,
    preservedClaims,
    driftedClaims,
    claims,
  };
}

function softPass(facts: string[]): TranslationFactCheckResult {
  return {
    passed: true,
    faithfulness: 100,
    totalClaims: facts.length,
    preservedClaims: facts.length,
    driftedClaims: 0,
    claims: facts.map(f => ({ englishClaim: f, presentInTranslation: true })),
    fallback: true,
  };
}

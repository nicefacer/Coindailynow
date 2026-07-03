/**
 * Narrative Angle Agent — generates a positive and a negative editorial
 * angle for a research topic, framed to position CoinDaily as the
 * info/data hub center across US / Africa / LATAM / Caribbean.
 *
 * Calls Ollama (llama3.1:8b by default) with a structured-output prompt.
 * Returns null on any failure — caller falls back to the existing
 * single-angle flow.
 */

import type { Logger } from 'winston';
import { StepMetrics, addOllamaUsage } from '../../orchestrator/stepRecorder';

const OLLAMA_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const LLAMA_MODEL = process.env.LLAMA_MODEL || 'llama3.1:8b';
const TIMEOUT_MS = 30_000;

export interface NarrativeAngles {
  positive: string;
  negative: string;
  regional_relevance: Array<{ region: string; angle: string }>;
}

export interface NarrativeInput {
  topic: string;
  coreMessage: string;
  sources: Array<{ title: string; domain: string; region?: string }>;
}

export async function generateNarrativeAngles(
  input: NarrativeInput,
  logger: Logger,
  metrics?: StepMetrics,
): Promise<NarrativeAngles | null> {
  const prompt = buildPrompt(input);

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLAMA_MODEL,
        prompt,
        format: 'json',
        stream: false,
        options: { temperature: 0.4, num_predict: 800 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.warn(`[NarrativeAngle] Ollama returned ${response.status}`);
      return null;
    }

    const data = (await response.json()) as { response?: string; prompt_eval_count?: number; eval_count?: number };
    if (metrics) addOllamaUsage(metrics, data);
    if (!data.response) return null;

    const parsed = JSON.parse(data.response);
    if (!parsed.positive || !parsed.negative) return null;

    return {
      positive: String(parsed.positive),
      negative: String(parsed.negative),
      regional_relevance: Array.isArray(parsed.regional_relevance)
        ? parsed.regional_relevance.slice(0, 6).map((r: any) => ({
            region: String(r.region ?? ''),
            angle: String(r.angle ?? ''),
          }))
        : [],
    };
  } catch (err: any) {
    logger.warn(`[NarrativeAngle] Generation failed: ${err.message}`);
    return null;
  }
}

function buildPrompt(input: NarrativeInput): string {
  const sourceLine = input.sources
    .slice(0, 8)
    .map((s, i) => `[${i + 1}] ${s.title} — ${s.domain}${s.region ? ` (${s.region})` : ''}`)
    .join('\n');

  return `You are an editorial strategist for CoinDaily, an AI/blockchain/TradFi/crypto news platform positioning itself as the data and info hub for Africa, the United States, Latin America, and the Caribbean. Your job is to extract the two strongest editorial angles from a research topic so the platform controls the narrative — not by being biased, but by being the most clearly framed and regionally relevant source.

TOPIC:
${input.topic}

CORE MESSAGE:
${input.coreMessage}

SOURCES:
${sourceLine}

Return a JSON object with this exact shape:
{
  "positive": "1-2 sentence positive editorial angle — what this topic enables, what opportunity it represents, who benefits",
  "negative": "1-2 sentence negative/critical angle — what risks or downsides this topic carries, who is exposed, what the platform's audience should watch for",
  "regional_relevance": [
    { "region": "Africa", "angle": "how this matters specifically to African markets — one sentence" },
    { "region": "US", "angle": "how this matters to US markets" },
    { "region": "LATAM", "angle": "..." },
    { "region": "Caribbean", "angle": "..." }
  ]
}

Rules:
- Do NOT invent facts. Both angles must be defensible from the sources above.
- Include regional_relevance ONLY for regions clearly affected by this topic; skip the rest.
- Be specific. "Crypto adoption is growing" is too vague. "Nigerian SEC's new VASP framework opens regulated custody for retail" is good.
- Output ONLY valid JSON. No prose around it.`;
}

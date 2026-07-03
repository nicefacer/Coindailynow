/**
 * Video Script Agent (P6.2).
 *
 * Generates two scripts from an approved Article:
 *   - SHORT (60 seconds, vertical) for TikTok/Reels/Shorts
 *   - LONG (3-5 minutes, landscape) for YouTube
 *
 * Calls Ollama (llama3.1:8b by default). Returns structured JSON so
 * downstream voiceover/composition steps don't have to re-parse prose.
 *
 * Falls back to a deterministic excerpt-based script if Ollama is down,
 * so the video pipeline never hard-blocks on LLM availability.
 */

import type { Logger } from 'winston';
import { StepMetrics, addOllamaUsage } from '../../orchestrator/stepRecorder';

const OLLAMA_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const LLAMA_MODEL = process.env.LLAMA_MODEL || 'llama3.1:8b';
const TIMEOUT_MS = 45_000;

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', sw: 'Kiswahili', fr: 'Français', pt: 'Português', ar: 'العربية',
  ha: 'Hausa', ig: 'Igbo', yo: 'Yorùbá', zu: 'isiZulu', af: 'Afrikaans',
  am: 'አማርኛ', so: 'Soomaali', rw: 'Kinyarwanda', es: 'Español', ht: 'Kreyòl',
  pcm: 'Nigerian Pidgin',
};

export interface ScriptScene {
  text: string;          // line for the voiceover
  visualHint: string;    // what the picture should show (used by visuals/B-roll step)
  durationSec: number;
}

export interface VideoScript {
  format: 'SHORT' | 'LONG';
  title: string;
  hook: string;                  // first 1-2 sentences — must grab attention
  scenes: ScriptScene[];
  cta: string;                   // closing call-to-action
  totalDurationSec: number;
}

export interface ScriptInput {
  articleId: string;
  title: string;
  excerpt: string;
  content: string;
  category?: string;
  tags?: string[];
  /** ISO language code — drives prompt instruction + downstream TTS/avatar voice. */
  language?: string;
}

export async function generateVideoScripts(
  input: ScriptInput,
  logger: Logger,
  metrics?: StepMetrics,
): Promise<{ short: VideoScript; long: VideoScript }> {
  // Try LLM first; fall back to deterministic on any error.
  try {
    const llmResult = await callOllamaForScripts(input, metrics);
    if (llmResult) return llmResult;
  } catch (err: any) {
    logger.warn(`[scriptAgent] LLM script generation failed: ${err.message}`);
  }
  logger.info('[scriptAgent] using deterministic fallback');
  return deterministicScripts(input);
}

async function callOllamaForScripts(
  input: ScriptInput,
  metrics?: StepMetrics,
): Promise<{ short: VideoScript; long: VideoScript } | null> {
  const prompt = buildPrompt(input);
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LLAMA_MODEL,
      prompt,
      format: 'json',
      stream: false,
      options: { temperature: 0.4, num_predict: 2500 },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { response?: string; prompt_eval_count?: number; eval_count?: number };
  if (metrics) addOllamaUsage(metrics, data);
  if (!data.response) return null;

  let parsed: any;
  try { parsed = JSON.parse(data.response); } catch { return null; }
  if (!parsed?.short || !parsed?.long) return null;

  return {
    short: normalizeScript(parsed.short, 'SHORT', input.title),
    long: normalizeScript(parsed.long, 'LONG', input.title),
  };
}

function normalizeScript(raw: any, format: 'SHORT' | 'LONG', defaultTitle: string): VideoScript {
  const targetDur = format === 'SHORT' ? 60 : 180;
  const scenes: ScriptScene[] = Array.isArray(raw.scenes)
    ? raw.scenes.slice(0, format === 'SHORT' ? 5 : 12).map((s: any) => ({
        text: String(s.text || '').slice(0, 600),
        visualHint: String(s.visualHint || s.visual || '').slice(0, 200),
        durationSec: Math.max(2, Math.min(60, Number(s.durationSec) || 8)),
      }))
    : [];
  const total = scenes.reduce((a, b) => a + b.durationSec, 0) || targetDur;
  return {
    format,
    title: String(raw.title || defaultTitle).slice(0, 140),
    hook: String(raw.hook || '').slice(0, 300),
    scenes,
    cta: String(raw.cta || 'Read the full article on CoinDaily.').slice(0, 200),
    totalDurationSec: total,
  };
}

function buildPrompt(input: ScriptInput): string {
  const body = input.content.slice(0, 6000);
  const lang = (input.language || 'en').toLowerCase();
  const langName = LANGUAGE_NAMES[lang] || 'English';
  const langLine = lang === 'en'
    ? ''
    : `\nIMPORTANT: Write BOTH scripts entirely in ${langName} (${lang}). Use ${langName} idioms; do not mix English unless quoting a proper noun.\n`;
  return `You are CoinDaily's video scriptwriter. Produce TWO scripts from the article below — a SHORT (60-second vertical for TikTok/Reels) and a LONG (3-minute landscape for YouTube). Both must be defensible from the article's actual content; no invented facts.${langLine}

ARTICLE TITLE: ${input.title}
EXCERPT: ${input.excerpt}
BODY:
${body}

Return ONLY valid JSON in this exact shape:
{
  "short": {
    "title": "punchy 60-character video title for social",
    "hook": "first 1-2 sentences that grab attention in <8 seconds",
    "scenes": [
      { "text": "voiceover line", "visualHint": "what the picture/B-roll should show", "durationSec": 8 }
    ],
    "cta": "closing line (10-15 words)"
  },
  "long": { "title": "...", "hook": "...", "scenes": [ ... ], "cta": "..." }
}

Rules:
- SHORT total duration: 50-70 seconds. 4-6 scenes max.
- LONG total duration: 150-240 seconds. 6-12 scenes.
- Each scene's text must be readable aloud in its durationSec (rule of thumb: ~2.5 words/sec).
- visualHint should be specific, e.g. "Nigerian SEC headquarters exterior, Lagos skyline" not "office building".
- Open the SHORT with a question or surprising stat — no slow build.
- Output JSON only, no surrounding prose.`;
}

/**
 * Deterministic fallback — splits the article body into sentence chunks
 * sized for ~8s narration each. Better than nothing when Ollama is down.
 */
function deterministicScripts(input: ScriptInput): { short: VideoScript; long: VideoScript } {
  const sentences = input.content
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.length > 20);

  const buildFrom = (count: number, format: 'SHORT' | 'LONG'): VideoScript => {
    const chosen = sentences.slice(0, count);
    const scenes: ScriptScene[] = chosen.map(s => ({
      text: s.slice(0, 200),
      visualHint: `Stock footage related to: ${input.title}`,
      durationSec: Math.max(6, Math.min(12, Math.ceil(s.split(' ').length / 2.5))),
    }));
    const total = scenes.reduce((a, b) => a + b.durationSec, 0) || (format === 'SHORT' ? 60 : 180);
    return {
      format,
      title: input.title.slice(0, 80),
      hook: input.excerpt.slice(0, 200),
      scenes,
      cta: 'Read the full article on CoinDaily.',
      totalDurationSec: total,
    };
  };

  return {
    short: buildFrom(4, 'SHORT'),
    long: buildFrom(10, 'LONG'),
  };
}

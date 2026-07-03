/**
 * D-ID adapter (P6.4) — short avatar video for TikTok/Reels/Shorts.
 *
 * D-ID's /talks endpoint: POST script + voice + presenter image → returns
 * a job ID. We poll /talks/:id until result_url is ready (usually 10-60s
 * for 30-60s content). Returns the final mp4 URL.
 *
 * Env:
 *   DID_API_KEY              (required — get from studio.d-id.com)
 *   DID_PRESENTER_IMAGE_URL  CDN URL of the CoinDaily news anchor avatar
 *                            (default: D-ID's "amy-Aq6OmGZnMt" generic anchor)
 *   DID_DEFAULT_VOICE        ElevenLabs/Microsoft voice id D-ID supports
 *
 * Cost: ~$0.20 per 60s clip on entry plan. Set DID_API_KEY=disabled to
 * stub out (returns ok:false instead of throwing).
 */

import type { Logger } from 'winston';
import type { VideoScript } from './scriptAgent';

const DID_BASE = 'https://api.d-id.com';
const DID_API_KEY = process.env.DID_API_KEY || '';
const DID_PRESENTER = process.env.DID_PRESENTER_IMAGE_URL ||
  'https://create-images-results.d-id.com/DefaultPresenters/Amy_f/image.jpeg';
const DID_VOICE = process.env.DID_DEFAULT_VOICE || 'en-US-JennyNeural';
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 300_000; // 5 minutes max wait

/**
 * Maps our ISO language codes to Microsoft Neural voice IDs supported by D-ID.
 * Pick reasonable defaults — admin can override per-run via input.voiceId.
 */
const LANG_TO_VOICE: Record<string, string> = {
  en: 'en-US-JennyNeural',
  sw: 'sw-KE-ZuriNeural',
  fr: 'fr-FR-DeniseNeural',
  pt: 'pt-BR-FranciscaNeural',
  ar: 'ar-EG-SalmaNeural',
  ha: 'en-NG-EzinneNeural',   // no native Hausa neural — fall back to Nigerian English
  ig: 'en-NG-EzinneNeural',
  yo: 'en-NG-EzinneNeural',
  zu: 'zu-ZA-ThandoNeural',
  af: 'af-ZA-AdriNeural',
  am: 'am-ET-MekdesNeural',
  so: 'so-SO-UbaxNeural',
  es: 'es-MX-DaliaNeural',
  ht: 'fr-FR-DeniseNeural',   // closest neural
  rw: 'en-US-JennyNeural',    // no native — fall back
  pcm: 'en-NG-EzinneNeural',
};

export interface ShortVideoInput {
  script: VideoScript;
  articleId: string;
  articleTitle: string;
  language?: string;
  voiceId?: string;
}

export interface ShortVideoResult {
  ok: boolean;
  url?: string;
  thumbnailUrl?: string;
  durationSec?: number;
  provider: 'd-id';
  externalId?: string;
  error?: string;
}

export async function generateShortAvatarVideo(
  input: ShortVideoInput,
  logger: Logger,
): Promise<ShortVideoResult> {
  if (!DID_API_KEY || DID_API_KEY === 'disabled') {
    logger.warn('[d-id] DID_API_KEY not set — short video stubbed out');
    return { ok: false, provider: 'd-id', error: 'DID_API_KEY not configured' };
  }

  const scriptText = joinScriptForTTS(input.script);
  if (!scriptText.trim()) {
    return { ok: false, provider: 'd-id', error: 'empty script' };
  }

  // P8.1 — pick voice from input language (or explicit override)
  const lang = (input.language || 'en').toLowerCase();
  const voiceId = input.voiceId || LANG_TO_VOICE[lang] || DID_VOICE;

  try {
    // 1. Submit talk job
    const createRes = await fetch(`${DID_BASE}/talks`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${DID_API_KEY}`,  // D-ID uses Basic with base64(api_key:)
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source_url: DID_PRESENTER,
        script: {
          type: 'text',
          input: scriptText.slice(0, 4000),
          provider: { type: 'microsoft', voice_id: voiceId },
        },
        config: { stitch: true, result_format: 'mp4' },
        name: `coindaily_short_${input.articleId}_${lang}`,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!createRes.ok) {
      const detail = await createRes.text().catch(() => '');
      logger.warn(`[d-id] create failed ${createRes.status}: ${detail.slice(0, 200)}`);
      return { ok: false, provider: 'd-id', error: `create HTTP ${createRes.status}` };
    }

    const created = (await createRes.json()) as { id: string };
    const talkId = created.id;
    logger.info(`[d-id] talk job created: ${talkId}`);

    // 2. Poll until done
    const startedAt = Date.now();
    while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);
      const statusRes = await fetch(`${DID_BASE}/talks/${talkId}`, {
        headers: { Authorization: `Basic ${DID_API_KEY}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!statusRes.ok) continue;
      const status = (await statusRes.json()) as {
        status: 'created' | 'started' | 'done' | 'error' | 'rejected';
        result_url?: string;
        thumbnail_url?: string;
        duration?: number;
        error?: { description?: string };
      };
      if (status.status === 'done' && status.result_url) {
        return {
          ok: true,
          url: status.result_url,
          thumbnailUrl: status.thumbnail_url,
          durationSec: status.duration,
          provider: 'd-id',
          externalId: talkId,
        };
      }
      if (status.status === 'error' || status.status === 'rejected') {
        return {
          ok: false,
          provider: 'd-id',
          externalId: talkId,
          error: status.error?.description || status.status,
        };
      }
    }

    return { ok: false, provider: 'd-id', externalId: talkId, error: 'poll timeout' };
  } catch (err: any) {
    logger.warn(`[d-id] short video failed: ${err.message}`);
    return { ok: false, provider: 'd-id', error: err.message };
  }
}

function joinScriptForTTS(s: VideoScript): string {
  const parts: string[] = [];
  if (s.hook) parts.push(s.hook);
  for (const scene of s.scenes) parts.push(scene.text);
  if (s.cta) parts.push(s.cta);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

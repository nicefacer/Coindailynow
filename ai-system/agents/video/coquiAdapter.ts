/**
 * Coqui XTTS adapter (P6.3) — voiceover via self-hosted Coqui XTTS server.
 *
 * Coqui XTTS v2 ships a small FastAPI server we run on the Contabo box
 * (same shape as the existing NLLB translation container). This adapter
 * just POSTs the script and gets back an MP3 URL we can hand to the
 * downstream video providers (D-ID, InVideo) or to ffmpeg for stitching.
 *
 * Env:
 *   COQUI_TTS_URL          base URL (default http://localhost:5002)
 *   COQUI_DEFAULT_SPEAKER  reference voice ID (default 'narrator_en_1')
 *
 * Degrades gracefully: if Coqui isn't reachable, returns { ok: false } so
 * the orchestrator can fall back to provider-bundled TTS (D-ID's voices,
 * InVideo's voices) instead of hard-failing.
 */

import type { Logger } from 'winston';

const COQUI_URL = process.env.COQUI_TTS_URL || 'http://localhost:5002';
const DEFAULT_SPEAKER = process.env.COQUI_DEFAULT_SPEAKER || 'narrator_en_1';
const TIMEOUT_MS = 120_000; // long-form narration can take 30-60s to render

export interface VoiceoverInput {
  language?: string;       // ISO code; XTTS supports en/es/fr/pt/ar + more
  speakerId?: string;      // reference voice (cloned at server startup)
  cdnPrefix?: string;      // if Coqui server uploads to CDN, the prefix to prepend
}

export interface VoiceoverResult {
  ok: boolean;
  url?: string;
  durationSec?: number;
  format?: 'mp3' | 'wav';
  provider: 'coqui';
  error?: string;
}

export async function renderVoiceover(
  text: string,
  opts: VoiceoverInput,
  logger: Logger,
): Promise<VoiceoverResult> {
  if (!text?.trim()) {
    return { ok: false, provider: 'coqui', error: 'empty text' };
  }

  const language = (opts.language || 'en').toLowerCase().split('-')[0];
  const speakerId = opts.speakerId || DEFAULT_SPEAKER;

  try {
    const res = await fetch(`${COQUI_URL}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text.slice(0, 5000),  // XTTS hard cap per call
        language,
        speaker_id: speakerId,
        format: 'mp3',
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      logger.warn(`[coqui] TTS HTTP ${res.status}`);
      return { ok: false, provider: 'coqui', error: `HTTP ${res.status}` };
    }

    const data = (await res.json()) as {
      url?: string;
      duration?: number;
      audio_url?: string;
      duration_sec?: number;
    };
    const url = data.url || data.audio_url;
    if (!url) {
      return { ok: false, provider: 'coqui', error: 'no audio_url in response' };
    }
    const fullUrl = url.startsWith('http') ? url : `${opts.cdnPrefix || COQUI_URL}${url}`;
    return {
      ok: true,
      url: fullUrl,
      durationSec: data.duration_sec || data.duration,
      format: 'mp3',
      provider: 'coqui',
    };
  } catch (err: any) {
    logger.warn(`[coqui] TTS failed: ${err.message}`);
    return { ok: false, provider: 'coqui', error: err.message };
  }
}

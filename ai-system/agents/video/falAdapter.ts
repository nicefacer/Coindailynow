/**
 * fal.ai adapter (P6.5) — cinematic B-roll clip for intro/outro.
 *
 * Uses fal.ai's hosted open video models — HunyuanVideo (default),
 * LTX-Video (fastest), Wan2.1 (best motion). ~$0.10-0.30 per 5s clip.
 *
 * Env:
 *   FAL_API_KEY    (required — get from fal.ai dashboard)
 *   FAL_MODEL      fal model id (default 'fal-ai/ltx-video' — fastest, ~$0.05/clip)
 *
 * Set FAL_API_KEY=disabled to stub.
 */

import type { Logger } from 'winston';

const FAL_BASE = 'https://fal.run';
const FAL_API_KEY = process.env.FAL_API_KEY || '';
const FAL_MODEL = process.env.FAL_MODEL || 'fal-ai/ltx-video';
const TIMEOUT_MS = 180_000;

export interface BrollInput {
  prompt: string;
  durationSec?: number;
  aspectRatio?: '9:16' | '16:9' | '1:1';
}

export interface BrollResult {
  ok: boolean;
  url?: string;
  durationSec?: number;
  provider: 'fal';
  externalId?: string;
  error?: string;
}

export async function generateBrollClip(
  input: BrollInput,
  logger: Logger,
): Promise<BrollResult> {
  if (!FAL_API_KEY || FAL_API_KEY === 'disabled') {
    logger.info('[fal] FAL_API_KEY not set — B-roll skipped');
    return { ok: false, provider: 'fal', error: 'FAL_API_KEY not configured' };
  }
  if (!input.prompt?.trim()) {
    return { ok: false, provider: 'fal', error: 'empty prompt' };
  }

  try {
    const res = await fetch(`${FAL_BASE}/${FAL_MODEL}`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: input.prompt.slice(0, 400),
        num_frames: Math.min(150, (input.durationSec || 5) * 24),
        aspect_ratio: input.aspectRatio || '16:9',
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logger.warn(`[fal] HTTP ${res.status}: ${detail.slice(0, 200)}`);
      return { ok: false, provider: 'fal', error: `HTTP ${res.status}` };
    }

    const data = (await res.json()) as {
      video?: { url?: string };
      video_url?: string;
      request_id?: string;
      duration?: number;
    };
    const url = data.video?.url || data.video_url;
    if (!url) {
      return { ok: false, provider: 'fal', error: 'no video url in response', externalId: data.request_id };
    }

    return {
      ok: true,
      url,
      durationSec: data.duration || input.durationSec,
      provider: 'fal',
      externalId: data.request_id,
    };
  } catch (err: any) {
    logger.warn(`[fal] broll failed: ${err.message}`);
    return { ok: false, provider: 'fal', error: err.message };
  }
}

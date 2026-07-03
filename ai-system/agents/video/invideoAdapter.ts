/**
 * InVideo AI adapter (P6.5) — long-form YouTube explainer from article.
 *
 * InVideo AI's API is currently invite-only enterprise. Until your account is
 * approved, this adapter operates in TWO modes:
 *
 *  1. STUB (default): returns { ok: false } so the video pipeline still
 *     produces a SHORT (D-ID) and the run goes READY_FOR_REVIEW without a
 *     LONG asset. Admin can manually upload one in the review page.
 *
 *  2. LIVE: when INVIDEO_API_KEY is set + INVIDEO_API_BASE points at the
 *     real endpoint, calls /v1/videos with the article URL and script.
 *
 * Env:
 *   INVIDEO_API_KEY      (required for live mode)
 *   INVIDEO_API_BASE     defaults to https://api.invideo.io/v1
 *   INVIDEO_TEMPLATE_ID  optional template (defaults to InVideo's news template)
 *   INVIDEO_VOICE        voice id (defaults to a neutral US English voice)
 *
 * Cost: $20/mo for 60 min/month at entry tier.
 *
 * Notes:
 *   - The InVideo API surface has shifted across betas; if their REST shape
 *     changes, only this file needs updating — the orchestrator + admin
 *     review page are decoupled via the ShortVideoResult-compatible return.
 */

import type { Logger } from 'winston';
import type { VideoScript } from './scriptAgent';

const API_KEY = process.env.INVIDEO_API_KEY || '';
const API_BASE = process.env.INVIDEO_API_BASE || 'https://api.invideo.io/v1';
const TEMPLATE_ID = process.env.INVIDEO_TEMPLATE_ID || 'news-default';
const VOICE = process.env.INVIDEO_VOICE || 'en-US-Wavenet-D';
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 600_000; // 10 minutes — long videos take time

export interface LongVideoInput {
  script: VideoScript;
  articleId: string;
  articleSlug: string;
  articleTitle: string;
}

export interface LongVideoResult {
  ok: boolean;
  url?: string;
  thumbnailUrl?: string;
  durationSec?: number;
  provider: 'invideo';
  externalId?: string;
  error?: string;
}

export async function generateLongStockVideo(
  input: LongVideoInput,
  logger: Logger,
): Promise<LongVideoResult> {
  if (!API_KEY || API_KEY === 'disabled') {
    logger.info('[invideo] INVIDEO_API_KEY not set — long video stubbed');
    return { ok: false, provider: 'invideo', error: 'INVIDEO_API_KEY not configured (manual upload available in admin)' };
  }

  const siteUrl = process.env.FRONTEND_PUBLIC_URL || 'https://sygn.live';
  const articleUrl = `${siteUrl}/en/news/${input.articleSlug}`;

  try {
    // 1. Submit job. The exact field names follow InVideo's published REST docs;
    //    adjust if their schema diverges (everything is centralised here).
    const createRes = await fetch(`${API_BASE}/videos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        template_id: TEMPLATE_ID,
        source_url: articleUrl,                // InVideo can scrape the article directly
        title: input.script.title,
        script: scenesToInVideoScenes(input.script),
        voice: VOICE,
        aspect_ratio: '16:9',
        duration_target_sec: input.script.totalDurationSec,
        watermark: false,
        webhook_url: process.env.INVIDEO_WEBHOOK_URL,  // optional — falls back to polling
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!createRes.ok) {
      const detail = await createRes.text().catch(() => '');
      logger.warn(`[invideo] create HTTP ${createRes.status}: ${detail.slice(0, 300)}`);
      return { ok: false, provider: 'invideo', error: `create HTTP ${createRes.status}` };
    }

    const created = (await createRes.json()) as { id: string };
    const jobId = created.id;
    logger.info(`[invideo] job created: ${jobId}`);

    // 2. Poll until done
    const startedAt = Date.now();
    while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);
      const statusRes = await fetch(`${API_BASE}/videos/${jobId}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!statusRes.ok) continue;
      const status = (await statusRes.json()) as {
        status: 'processing' | 'done' | 'completed' | 'failed';
        video_url?: string;
        download_url?: string;
        thumbnail_url?: string;
        duration_sec?: number;
        error?: string;
      };
      const isDone = status.status === 'done' || status.status === 'completed';
      const url = status.video_url || status.download_url;
      if (isDone && url) {
        return {
          ok: true,
          url,
          thumbnailUrl: status.thumbnail_url,
          durationSec: status.duration_sec,
          provider: 'invideo',
          externalId: jobId,
        };
      }
      if (status.status === 'failed') {
        return { ok: false, provider: 'invideo', externalId: jobId, error: status.error || 'failed' };
      }
    }

    return { ok: false, provider: 'invideo', externalId: jobId, error: 'poll timeout' };
  } catch (err: any) {
    logger.warn(`[invideo] long video failed: ${err.message}`);
    return { ok: false, provider: 'invideo', error: err.message };
  }
}

function scenesToInVideoScenes(s: VideoScript): any[] {
  return s.scenes.map(scene => ({
    text: scene.text,
    visual_query: scene.visualHint, // InVideo searches stock libraries by this string
    duration_sec: scene.durationSec,
  }));
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/**
 * ffmpeg Composer (P8.5).
 *
 * Stitches branded intro / outro / B-roll splice onto provider-generated
 * mp4s. Optional — when nothing to stitch, returns the input URL unchanged.
 *
 * Uses ffmpeg-static so no system ffmpeg install needed. Output goes to
 * Backblaze B2 via the existing CDN uploader, so distribution adapters
 * can ingest the composed URL directly.
 *
 * Inputs:
 *   - baseVideoUrl (required) — the D-ID / InVideo mp4 we're enhancing
 *   - introUrl     (optional) — brand intro mp4 (CDN URL or local)
 *   - outroUrl     (optional) — brand outro mp4
 *   - brollUrl     (optional) — fal.ai B-roll to splice at the very front
 *   - articleId    (for output naming)
 *   - format       — 'SHORT' (1080x1920, 9:16) or 'LONG' (1920x1080, 16:9)
 *
 * Env:
 *   BRAND_INTRO_URL   default intro for all videos (CDN URL)
 *   BRAND_OUTRO_URL   default outro
 *   COMPOSER_DISABLE  set true to skip composition entirely (return base URL)
 */

import type { Logger } from 'winston';
import ffmpegStatic from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';

// Point fluent-ffmpeg at the bundled binary
if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

export interface ComposeInput {
  baseVideoUrl: string;
  introUrl?: string;
  outroUrl?: string;
  brollUrl?: string;
  articleId: string;
  format: 'SHORT' | 'LONG';
}

export interface ComposeResult {
  ok: boolean;
  url?: string;
  durationSec?: number;
  strategy: 'concat' | 'noop' | 'failed';
  error?: string;
}

export async function composeVideo(input: ComposeInput, logger: Logger): Promise<ComposeResult> {
  if (process.env.COMPOSER_DISABLE === 'true') {
    return { ok: true, url: input.baseVideoUrl, strategy: 'noop' };
  }

  const intro = input.introUrl || process.env.BRAND_INTRO_URL;
  const outro = input.outroUrl || process.env.BRAND_OUTRO_URL;
  const broll = input.brollUrl;

  // If there's nothing to stitch, return the base URL unchanged.
  if (!intro && !outro && !broll) {
    return { ok: true, url: input.baseVideoUrl, strategy: 'noop' };
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'compose-'));
  const cleanup = async () => {
    try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch { /* swallow */ }
  };

  try {
    // 1. Download every input into the temp dir
    const baseFile = await downloadToTmp(input.baseVideoUrl, tmpDir, 'base.mp4');
    const introFile = intro ? await downloadToTmp(intro, tmpDir, 'intro.mp4') : null;
    const outroFile = outro ? await downloadToTmp(outro, tmpDir, 'outro.mp4') : null;
    const brollFile = broll ? await downloadToTmp(broll, tmpDir, 'broll.mp4') : null;

    // 2. Normalize each clip to the same resolution + codec (concat demuxer is
    //    picky if inputs differ). Standard targets: SHORT=1080x1920, LONG=1920x1080.
    const targetW = input.format === 'SHORT' ? 1080 : 1920;
    const targetH = input.format === 'SHORT' ? 1920 : 1080;
    const normalizedFiles: string[] = [];
    for (const [name, file] of [['intro', introFile], ['broll', brollFile], ['base', baseFile], ['outro', outroFile]] as const) {
      if (!file) continue;
      const out = path.join(tmpDir, `${name}-norm.mp4`);
      await normalize(file, out, targetW, targetH);
      normalizedFiles.push(out);
    }

    // 3. concat via demuxer
    const listFile = path.join(tmpDir, 'concat.txt');
    await fs.writeFile(listFile, normalizedFiles.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
    const outFile = path.join(tmpDir, 'composed.mp4');
    await concat(listFile, outFile);

    // 4. Upload result to CDN
    const buffer = await fs.readFile(outFile);
    const url = await uploadComposed(buffer, input.articleId, input.format, logger);

    // Best-effort duration probe
    const durationSec = await probeDuration(outFile).catch(() => undefined);
    return { ok: true, url, durationSec, strategy: 'concat' };
  } catch (err: any) {
    logger.warn(`[composer] failed: ${err.message}; falling back to base URL`);
    return { ok: false, url: input.baseVideoUrl, strategy: 'failed', error: err.message };
  } finally {
    await cleanup();
  }
}

// ─── ffmpeg primitives ────────────────────────────────────────────────────

function normalize(inputFile: string, outputFile: string, w: number, h: number): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputFile)
      .outputOptions([
        '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`,
        '-r', '30',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-ac', '2',
        '-y',
      ])
      .save(outputFile)
      .on('end', () => resolve())
      .on('error', (err) => reject(err));
  });
}

function concat(listFile: string, outputFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listFile)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c', 'copy', '-y'])
      .save(outputFile)
      .on('end', () => resolve())
      .on('error', (err) => reject(err));
  });
}

function probeDuration(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(file, (err, data) => {
      if (err) return reject(err);
      resolve(Math.round(data.format.duration || 0));
    });
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────

async function downloadToTmp(url: string, dir: string, name: string): Promise<string> {
  const dest = path.join(dir, name);
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`download ${url} HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
  return dest;
}

/**
 * Upload composed mp4 to CDN. Reuses ai-system/config/cdn-upload (same path
 * the image agent uses) so we get one consistent storage layer.
 */
async function uploadComposed(buf: Buffer, articleId: string, format: string, logger: Logger): Promise<string> {
  try {
    const { uploadToCDN } = await import('../../config/cdn-upload.js');
    const filename = `video-${format.toLowerCase()}-${articleId}-${randomUUID().slice(0, 8)}.mp4`;
    const dataUri = `data:video/mp4;base64,${buf.toString('base64')}`;
    return await uploadToCDN(dataUri, filename, 'video/mp4');
  } catch (err: any) {
    logger.warn(`[composer] CDN upload failed: ${err.message}; returning data URL`);
    // Fallback: data URL (large; only useful for local dev)
    return `data:video/mp4;base64,${buf.toString('base64').slice(0, 100)}...`;
  }
}

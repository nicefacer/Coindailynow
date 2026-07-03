/**
 * Facebook Page adapter (P7.2) — Graph API.
 *
 * Setup:
 *   1. Create a Facebook Page for CoinDaily.
 *   2. Create a Meta app at developers.facebook.com → Add "Facebook Login for Business" product.
 *   3. Generate a never-expiring Page Access Token (long-lived user token → exchange for page token).
 *   4. Save the page id + token on DistributionTarget.metadata + .authState.
 *
 * Supports: article (link post), video, image.
 */

import type { ISocialAdapter, DistributionPayload, DistributionPostResult, DistributionMetrics } from '../socialAdapter';
import { NotConfiguredError } from '../socialAdapter';

const GRAPH_VERSION = process.env.FB_GRAPH_VERSION || 'v19.0';
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export class FacebookAdapter implements ISocialAdapter {
  platform = 'facebook' as const;

  isConfigured(): boolean {
    // Targets carry their own auth; treat as configured if the env hint is set
    // (final auth check happens per-target in post()).
    return Boolean(process.env.FACEBOOK_DEFAULT_PAGE_ID && process.env.FACEBOOK_DEFAULT_PAGE_TOKEN);
  }

  async post(payload: DistributionPayload): Promise<DistributionPostResult> {
    const pageId = payload.targetMetadata?.pageId || process.env.FACEBOOK_DEFAULT_PAGE_ID;
    const accessToken =
      payload.targetMetadata?.accessToken ||
      payload.targetMetadata?.pageToken ||
      process.env.FACEBOOK_DEFAULT_PAGE_TOKEN;

    if (!pageId || !accessToken) {
      throw new NotConfiguredError('facebook', ['FACEBOOK_DEFAULT_PAGE_ID', 'FACEBOOK_DEFAULT_PAGE_TOKEN']);
    }

    const message = formatMessage(payload);

    if (payload.itemType === 'video' && payload.mediaUrl) {
      const res = await fetch(`${BASE}/${pageId}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_url: payload.mediaUrl,
          description: message,
          title: payload.title,
          access_token: accessToken,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      return parsePostResult(res, pageId);
    }

    if (payload.itemType === 'image' && payload.mediaUrl) {
      const res = await fetch(`${BASE}/${pageId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: payload.mediaUrl,
          caption: message,
          access_token: accessToken,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      return parsePostResult(res, pageId);
    }

    // Default: link post
    const res = await fetch(`${BASE}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        link: payload.articleUrl,
        access_token: accessToken,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    return parsePostResult(res, pageId);
  }

  async fetchMetrics(externalId: string, targetMetadata?: Record<string, any>): Promise<DistributionMetrics | null> {
    const accessToken = targetMetadata?.accessToken || process.env.FACEBOOK_DEFAULT_PAGE_TOKEN;
    if (!accessToken) return null;
    try {
      const res = await fetch(
        `${BASE}/${externalId}?fields=reactions.summary(true),comments.summary(true),shares&access_token=${accessToken}`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (!res.ok) return null;
      const data = (await res.json()) as any;
      return {
        likes: data?.reactions?.summary?.total_count,
        comments: data?.comments?.summary?.total_count,
        shares: data?.shares?.count,
        raw: data,
      };
    } catch {
      return null;
    }
  }
}

function formatMessage(payload: DistributionPayload): string {
  const tags = (payload.tags || []).map(t => `#${t.replace(/\s+/g, '')}`).join(' ');
  return `${payload.title}\n\n${payload.description || ''}\n\n${tags}`.slice(0, 5000);
}

async function parsePostResult(res: Response, pageId: string): Promise<DistributionPostResult> {
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    throw new Error(`facebook HTTP ${res.status}: ${data?.error?.message || ''}`.slice(0, 300));
  }
  const externalId = data.id || data.post_id;
  if (!externalId) throw new Error('facebook returned no post id');
  // Facebook returns ids in {pageId}_{postId} form; the public URL works either way
  const cleanId = String(externalId).includes('_') ? String(externalId).split('_')[1] : externalId;
  return {
    externalId: String(externalId),
    externalUrl: `https://facebook.com/${pageId}/posts/${cleanId}`,
  };
}

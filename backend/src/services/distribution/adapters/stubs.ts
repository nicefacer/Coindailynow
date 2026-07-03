/**
 * Live adapters: YouTube, TikTok, Instagram, X, LinkedIn, WhatsApp (P8.3).
 *
 * Each post() body makes the real API calls and returns the platform's post
 * id + URL. Each succeeds when its env vars (and target metadata where
 * needed) are present; throws NotConfiguredError otherwise so the
 * dispatcher records a clean FAILED row.
 *
 * NOTE: each requires offline setup (see /admin/settings/setup-checklist):
 *   - app/business registration with the platform
 *   - OAuth flow against your CoinDaily account
 *   - business verification (Meta family, TikTok for Business, X paid tier)
 */

import type {
  ISocialAdapter,
  DistributionPayload,
  DistributionPostResult,
  DistributionMetrics,
  DistributionPlatform,
} from '../socialAdapter';
import { NotConfiguredError } from '../socialAdapter';
import crypto from 'crypto';

abstract class BaseAdapter implements ISocialAdapter {
  abstract platform: DistributionPlatform;
  abstract requiredEnv: string[];

  isConfigured(): boolean {
    return this.requiredEnv.every(k => Boolean(process.env[k]));
  }

  abstract post(payload: DistributionPayload): Promise<DistributionPostResult>;

  async fetchMetrics(_externalId: string): Promise<DistributionMetrics | null> {
    return null;
  }

  protected requireEnv(): void {
    if (!this.isConfigured()) {
      throw new NotConfiguredError(this.platform, this.requiredEnv);
    }
  }
}

// ─── YouTube — Data API v3 ────────────────────────────────────────────────
//
// videos.insert — multipart upload of an mp4 with snippet + status.
// We grab a fresh access token via OAuth2 refresh, stream the remote mp4 in
// memory (videos < ~50MB which is realistic for sub-5min content), then POST
// to the resumable upload endpoint.
//
export class YouTubeAdapter extends BaseAdapter {
  platform = 'youtube' as const;
  requiredEnv = ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN'];

  async post(payload: DistributionPayload): Promise<DistributionPostResult> {
    this.requireEnv();
    if (payload.itemType !== 'video' || !payload.mediaUrl) {
      throw new Error('youtube: video posts require a mediaUrl mp4');
    }

    const accessToken = await this.refreshAccessToken();
    const videoBuf = await fetchMedia(payload.mediaUrl);

    // 1. Initiate resumable upload
    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': 'video/*',
          'X-Upload-Content-Length': String(videoBuf.byteLength),
        },
        body: JSON.stringify({
          snippet: {
            title: payload.title.slice(0, 100),
            description: this.buildDescription(payload),
            tags: payload.tags?.slice(0, 30),
            categoryId: '25', // News & Politics
          },
          status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!initRes.ok) throw new Error(`youtube init HTTP ${initRes.status}: ${(await initRes.text()).slice(0, 300)}`);
    const uploadUrl = initRes.headers.get('Location');
    if (!uploadUrl) throw new Error('youtube: no upload Location header');

    // 2. PUT the bytes (cast: TS DOM lib doesn't accept Buffer as BodyInit, runtime is fine)
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(videoBuf.byteLength) },
      body: videoBuf as any,
      signal: AbortSignal.timeout(300_000),
    });
    if (!uploadRes.ok) throw new Error(`youtube upload HTTP ${uploadRes.status}: ${(await uploadRes.text()).slice(0, 300)}`);
    const result = await uploadRes.json() as { id: string };
    return {
      externalId: result.id,
      externalUrl: `https://youtube.com/watch?v=${result.id}`,
    };
  }

  async fetchMetrics(externalId: string): Promise<DistributionMetrics | null> {
    if (!this.isConfigured()) return null;
    try {
      const accessToken = await this.refreshAccessToken();
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${externalId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) return null;
      const data = await res.json() as { items?: Array<{ statistics?: any }> };
      const s = data.items?.[0]?.statistics;
      if (!s) return null;
      return {
        views: Number(s.viewCount) || 0,
        likes: Number(s.likeCount) || 0,
        comments: Number(s.commentCount) || 0,
        raw: s,
      };
    } catch { return null; }
  }

  private async refreshAccessToken(): Promise<string> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.YOUTUBE_CLIENT_ID!,
        client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
        refresh_token: process.env.YOUTUBE_REFRESH_TOKEN!,
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`youtube token refresh HTTP ${res.status}`);
    const data = await res.json() as { access_token: string };
    return data.access_token;
  }

  private buildDescription(p: DistributionPayload): string {
    const parts: string[] = [];
    if (p.description) parts.push(p.description);
    parts.push(`\nRead the full article: ${p.articleUrl}`);
    if (p.tags?.length) parts.push(p.tags.map(t => `#${t.replace(/\s+/g, '')}`).join(' '));
    return parts.join('\n').slice(0, 5000);
  }
}

// ─── TikTok — Content Posting API ──────────────────────────────────────────
//
// Two-step: PUSH BY URL (init) → poll publish status.
//
export class TikTokAdapter extends BaseAdapter {
  platform = 'tiktok' as const;
  requiredEnv = ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REFRESH_TOKEN'];

  async post(payload: DistributionPayload): Promise<DistributionPostResult> {
    this.requireEnv();
    if (payload.itemType !== 'video' || !payload.mediaUrl) {
      throw new Error('tiktok: video posts require a mediaUrl mp4');
    }

    const accessToken = await this.refreshAccessToken();

    const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: payload.title.slice(0, 150),
          description: this.buildDescription(payload),
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: payload.mediaUrl,
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!initRes.ok) throw new Error(`tiktok init HTTP ${initRes.status}: ${(await initRes.text()).slice(0, 300)}`);
    const init = await initRes.json() as { data: { publish_id: string }; error?: { code: string; message: string } };
    if (init.error?.code && init.error.code !== 'ok') throw new Error(`tiktok error: ${init.error.message}`);
    const publishId = init.data.publish_id;

    // Best-effort: TikTok publish is async; return immediately with publish_id.
    // Metrics polling later reconciles to the final TikTok video id.
    return {
      externalId: publishId,
      externalUrl: `https://www.tiktok.com/@${payload.targetMetadata?.username || 'coindaily'}`,
      metadata: { publishId, asyncPublish: true },
    };
  }

  private async refreshAccessToken(): Promise<string> {
    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY!,
        client_secret: process.env.TIKTOK_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: process.env.TIKTOK_REFRESH_TOKEN!,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`tiktok token refresh HTTP ${res.status}`);
    const data = await res.json() as { access_token: string };
    return data.access_token;
  }

  private buildDescription(p: DistributionPayload): string {
    const tags = (p.tags || []).map(t => `#${t.replace(/\s+/g, '')}`).join(' ');
    return `${p.title}\n\n${p.description || ''}\n\nFull article: ${p.articleUrl}\n${tags}`.slice(0, 2200);
  }
}

// ─── Instagram (Reels + Feed) — Meta Graph API ─────────────────────────────
//
// Two-step: create container → publish container.
//
export class InstagramAdapter extends BaseAdapter {
  platform = 'instagram' as const;
  requiredEnv = ['INSTAGRAM_BUSINESS_ACCOUNT_ID', 'INSTAGRAM_ACCESS_TOKEN'];

  async post(payload: DistributionPayload): Promise<DistributionPostResult> {
    this.requireEnv();
    const igUserId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID!;
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN!;
    const v = process.env.FB_GRAPH_VERSION || 'v19.0';

    let createBody: Record<string, any> = {
      caption: this.buildCaption(payload),
      access_token: accessToken,
    };
    if (payload.itemType === 'video' && payload.mediaUrl) {
      createBody.media_type = 'REELS';
      createBody.video_url = payload.mediaUrl;
      if (payload.thumbnailUrl) createBody.cover_url = payload.thumbnailUrl;
    } else if (payload.itemType === 'image' && payload.mediaUrl) {
      createBody.image_url = payload.mediaUrl;
    } else {
      throw new Error('instagram: requires either video or image mediaUrl');
    }

    const createRes = await fetch(`https://graph.facebook.com/${v}/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createBody),
      signal: AbortSignal.timeout(30_000),
    });
    if (!createRes.ok) throw new Error(`instagram create HTTP ${createRes.status}: ${(await createRes.text()).slice(0, 300)}`);
    const created = await createRes.json() as { id: string };

    // Poll container status until FINISHED before publishing
    if (payload.itemType === 'video') {
      const finished = await this.waitForContainerReady(created.id, accessToken);
      if (!finished) throw new Error('instagram: video container processing timeout');
    }

    const publishRes = await fetch(`https://graph.facebook.com/${v}/${igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: created.id, access_token: accessToken }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!publishRes.ok) throw new Error(`instagram publish HTTP ${publishRes.status}: ${(await publishRes.text()).slice(0, 300)}`);
    const published = await publishRes.json() as { id: string };
    return {
      externalId: published.id,
      externalUrl: `https://www.instagram.com/p/${published.id}/`,
      metadata: { containerId: created.id },
    };
  }

  async fetchMetrics(externalId: string): Promise<DistributionMetrics | null> {
    if (!this.isConfigured()) return null;
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN!;
    const v = process.env.FB_GRAPH_VERSION || 'v19.0';
    try {
      const res = await fetch(
        `https://graph.facebook.com/${v}/${externalId}?fields=like_count,comments_count&access_token=${accessToken}`,
      );
      if (!res.ok) return null;
      const data = await res.json() as any;
      return { likes: data.like_count, comments: data.comments_count, raw: data };
    } catch { return null; }
  }

  private async waitForContainerReady(containerId: string, accessToken: string): Promise<boolean> {
    const v = process.env.FB_GRAPH_VERSION || 'v19.0';
    for (let i = 0; i < 30; i++) {
      const res = await fetch(`https://graph.facebook.com/${v}/${containerId}?fields=status_code&access_token=${accessToken}`);
      if (res.ok) {
        const data = await res.json() as { status_code?: string };
        if (data.status_code === 'FINISHED') return true;
        if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED') return false;
      }
      await sleep(2000);
    }
    return false;
  }

  private buildCaption(p: DistributionPayload): string {
    const tags = (p.tags || []).map(t => `#${t.replace(/\s+/g, '')}`).join(' ');
    return `${p.title}\n\n${p.description || ''}\n\n${p.articleUrl}\n\n${tags}`.slice(0, 2200);
  }
}

// ─── X (Twitter) — API v2 (paid Basic tier required for media) ────────────
//
// OAuth 1.0a Authorization header for media upload (v1.1) + tweet (v2).
//
export class XAdapter extends BaseAdapter {
  platform = 'x' as const;
  requiredEnv = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'];

  async post(payload: DistributionPayload): Promise<DistributionPostResult> {
    this.requireEnv();

    let mediaIds: string[] = [];
    if (payload.itemType === 'video' && payload.mediaUrl) {
      const id = await this.uploadVideo(payload.mediaUrl);
      mediaIds = [id];
    } else if (payload.itemType === 'image' && payload.mediaUrl) {
      const id = await this.uploadImage(payload.mediaUrl);
      mediaIds = [id];
    }

    const text = this.buildTweet(payload);
    const url = 'https://api.x.com/2/tweets';
    const body: Record<string, any> = { text };
    if (mediaIds.length) body.media = { media_ids: mediaIds };

    const auth = this.oauth1Header('POST', url, {});
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`x tweet HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json() as { data: { id: string } };
    return {
      externalId: data.data.id,
      externalUrl: `https://x.com/i/web/status/${data.data.id}`,
      metadata: { mediaIds },
    };
  }

  async fetchMetrics(externalId: string): Promise<DistributionMetrics | null> {
    if (!this.isConfigured()) return null;
    const url = `https://api.x.com/2/tweets/${externalId}?tweet.fields=public_metrics`;
    try {
      const auth = this.oauth1Header('GET', url, {});
      const res = await fetch(url, { headers: { Authorization: auth } });
      if (!res.ok) return null;
      const data = await res.json() as { data: { public_metrics?: any } };
      const m = data.data?.public_metrics;
      if (!m) return null;
      return {
        views: m.impression_count,
        likes: m.like_count,
        shares: m.retweet_count + (m.quote_count || 0),
        comments: m.reply_count,
        raw: m,
      };
    } catch { return null; }
  }

  private async uploadImage(url: string): Promise<string> {
    const buf = await fetchMedia(url);
    const endpoint = 'https://upload.x.com/1.1/media/upload.json';
    const auth = this.oauth1Header('POST', endpoint, {});
    const form = new FormData();
    form.append('media', new Blob([buf as any]));
    const res = await fetch(endpoint, { method: 'POST', headers: { Authorization: auth }, body: form });
    if (!res.ok) throw new Error(`x image upload HTTP ${res.status}`);
    const data = await res.json() as { media_id_string: string };
    return data.media_id_string;
  }

  private async uploadVideo(url: string): Promise<string> {
    // Chunked upload: INIT → APPEND (one chunk) → FINALIZE
    const buf = await fetchMedia(url);
    const endpoint = 'https://upload.x.com/1.1/media/upload.json';

    // INIT
    let auth = this.oauth1Header('POST', endpoint, { command: 'INIT', total_bytes: String(buf.byteLength), media_type: 'video/mp4', media_category: 'tweet_video' });
    const initParams = new URLSearchParams({ command: 'INIT', total_bytes: String(buf.byteLength), media_type: 'video/mp4', media_category: 'tweet_video' });
    let res = await fetch(`${endpoint}?${initParams}`, { method: 'POST', headers: { Authorization: auth } });
    if (!res.ok) throw new Error(`x video INIT HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const init = await res.json() as { media_id_string: string };
    const mediaId = init.media_id_string;

    // APPEND
    auth = this.oauth1Header('POST', endpoint, {});
    const form = new FormData();
    form.append('command', 'APPEND');
    form.append('media_id', mediaId);
    form.append('media', new Blob([buf as any]));
    form.append('segment_index', '0');
    res = await fetch(endpoint, { method: 'POST', headers: { Authorization: auth }, body: form });
    if (!res.ok) throw new Error(`x video APPEND HTTP ${res.status}`);

    // FINALIZE
    auth = this.oauth1Header('POST', endpoint, { command: 'FINALIZE', media_id: mediaId });
    const finalParams = new URLSearchParams({ command: 'FINALIZE', media_id: mediaId });
    res = await fetch(`${endpoint}?${finalParams}`, { method: 'POST', headers: { Authorization: auth } });
    if (!res.ok) throw new Error(`x video FINALIZE HTTP ${res.status}`);
    return mediaId;
  }

  /** Minimal OAuth 1.0a header generator for X — HMAC-SHA1, no body params. */
  private oauth1Header(method: string, url: string, extraParams: Record<string, string>): string {
    const consumerKey = process.env.X_API_KEY!;
    const consumerSecret = process.env.X_API_SECRET!;
    const accessToken = process.env.X_ACCESS_TOKEN!;
    const accessSecret = process.env.X_ACCESS_SECRET!;

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: consumerKey,
      oauth_nonce: crypto.randomBytes(16).toString('hex'),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_token: accessToken,
      oauth_version: '1.0',
    };

    const allParams = { ...oauthParams, ...extraParams };
    const sortedParams = Object.keys(allParams).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`).join('&');
    const baseString = [method.toUpperCase(), encodeURIComponent(url.split('?')[0]), encodeURIComponent(sortedParams)].join('&');
    const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(accessSecret)}`;
    const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

    oauthParams.oauth_signature = signature;
    return 'OAuth ' + Object.keys(oauthParams).sort().map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`).join(', ');
  }

  private buildTweet(p: DistributionPayload): string {
    const tags = (p.tags || []).slice(0, 4).map(t => `#${t.replace(/\s+/g, '')}`).join(' ');
    // X allows 280 chars; URLs count as 23
    const max = 280 - 23 - tags.length - 4; // budget for url + tags + spaces
    const head = p.title.slice(0, Math.max(50, max));
    return `${head}\n\n${p.articleUrl}\n${tags}`.trim();
  }
}

// ─── LinkedIn — Marketing/Posts API ───────────────────────────────────────
//
// Posts API v2 — single POST to /rest/posts with org URN.
//
export class LinkedInAdapter extends BaseAdapter {
  platform = 'linkedin' as const;
  requiredEnv = ['LINKEDIN_ORG_ID', 'LINKEDIN_ACCESS_TOKEN'];

  async post(payload: DistributionPayload): Promise<DistributionPostResult> {
    this.requireEnv();
    const orgId = process.env.LINKEDIN_ORG_ID!;
    const accessToken = process.env.LINKEDIN_ACCESS_TOKEN!;
    const author = `urn:li:organization:${orgId}`;

    const body: Record<string, any> = {
      author,
      commentary: this.buildText(payload),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };

    // Article share — provide the URL; LinkedIn renders the preview
    if (payload.itemType === 'article') {
      body.content = { article: { source: payload.articleUrl, title: payload.title, description: payload.description } };
    }

    // For video/image, LinkedIn requires asset registration + upload first.
    // We provide the article link with the media URL for now (works as a
    // rich link preview); full asset upload is a separate flow.

    const res = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': '202405',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`linkedin HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const postUrn = res.headers.get('x-restli-id') || (await res.json() as any).id;
    const id = String(postUrn).replace(/^urn:li:share:/, '').replace(/^urn:li:ugcPost:/, '');
    return {
      externalId: postUrn,
      externalUrl: `https://www.linkedin.com/feed/update/${postUrn}/`,
    };
  }

  async fetchMetrics(externalId: string): Promise<DistributionMetrics | null> {
    // LinkedIn social actions endpoint requires share URN; rate-limited.
    if (!this.isConfigured()) return null;
    try {
      const accessToken = process.env.LINKEDIN_ACCESS_TOKEN!;
      const url = `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(externalId)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, 'LinkedIn-Version': '202405' },
      });
      if (!res.ok) return null;
      const data = await res.json() as any;
      return {
        likes: data?.likesSummary?.totalLikes,
        comments: data?.commentsSummary?.totalFirstLevelComments,
        raw: data,
      };
    } catch { return null; }
  }

  private buildText(p: DistributionPayload): string {
    const tags = (p.tags || []).map(t => `#${t.replace(/\s+/g, '')}`).join(' ');
    return `${p.title}\n\n${p.description || ''}\n\n${p.articleUrl}\n\n${tags}`.slice(0, 3000);
  }
}

// ─── WhatsApp Cloud API ───────────────────────────────────────────────────
//
// Two surfaces:
//   1. Direct messages to subscribers (requires opt-in + 24h window)
//   2. Broadcast Channels — currently invite-only beta API
//
// This implementation posts a TEXT message to a single number (the target's
// "handle" is the recipient phone number in international format). Useful
// for an internal alert flow; for true broadcast you'll wire the Channels
// API once Meta approves you.
//
export class WhatsAppAdapter extends BaseAdapter {
  platform = 'whatsapp' as const;
  requiredEnv = ['WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN'];

  async post(payload: DistributionPayload): Promise<DistributionPostResult> {
    this.requireEnv();
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN!;
    const recipient = payload.targetMetadata?.recipient || process.env.WHATSAPP_DEFAULT_RECIPIENT;
    if (!recipient) {
      throw new NotConfiguredError('whatsapp', ['target.metadata.recipient or WHATSAPP_DEFAULT_RECIPIENT']);
    }

    const v = process.env.FB_GRAPH_VERSION || 'v19.0';
    const url = `https://graph.facebook.com/${v}/${phoneNumberId}/messages`;

    let body: Record<string, any>;
    if (payload.itemType === 'video' && payload.mediaUrl) {
      body = {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'video',
        video: { link: payload.mediaUrl, caption: this.buildCaption(payload) },
      };
    } else if (payload.itemType === 'image' && payload.mediaUrl) {
      body = {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'image',
        image: { link: payload.mediaUrl, caption: this.buildCaption(payload) },
      };
    } else {
      body = {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'text',
        text: { body: this.buildCaption(payload), preview_url: true },
      };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`whatsapp HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json() as { messages?: Array<{ id: string }> };
    const messageId = data.messages?.[0]?.id;
    if (!messageId) throw new Error('whatsapp: no message id returned');
    return {
      externalId: messageId,
      externalUrl: `https://wa.me/${recipient.replace(/[^0-9]/g, '')}`,
      metadata: { recipient },
    };
  }

  // Cloud API delivers webhooks for read receipts; pull metrics are limited.
  async fetchMetrics(): Promise<DistributionMetrics | null> {
    return null;
  }

  private buildCaption(p: DistributionPayload): string {
    return `*${p.title}*\n\n${p.description || ''}\n\n${p.articleUrl}`.slice(0, 4096);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function fetchMedia(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`fetch media HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

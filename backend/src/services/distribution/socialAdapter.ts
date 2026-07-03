/**
 * Social Adapter base + registry (P7.1).
 *
 * Each platform (YouTube, TikTok, Instagram, X, Facebook, LinkedIn,
 * Telegram, WhatsApp) implements ISocialAdapter. The orchestrator looks
 * the right adapter up by platform name, calls post() with a unified
 * payload, and stores the returned external id on DistributionPost so
 * the metrics worker can poll.
 *
 * Adapters that aren't yet configured (env keys missing) throw
 * NOT_CONFIGURED so the dispatcher records FAILED with a clear reason
 * rather than crashing the whole distribution job.
 */

export type DistributionPlatform =
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'x'
  | 'facebook'
  | 'linkedin'
  | 'telegram'
  | 'whatsapp';

export type DistributionItemType = 'article' | 'video' | 'image';

export interface DistributionPayload {
  itemType: DistributionItemType;
  itemId: string;
  /** Display title — used as caption / video title / tweet body */
  title: string;
  /** Long-form caption / description — used where the platform allows it */
  description?: string;
  /** Public URL of the article on sygn.live (always provided so platforms can link back) */
  articleUrl: string;
  /** For videos: direct mp4 url. For images: png/jpg url. Optional for article-only posts. */
  mediaUrl?: string;
  /** For videos: optional thumbnail url */
  thumbnailUrl?: string;
  /** Hashtags / tags to attach where the platform supports them */
  tags?: string[];
  /** Target metadata from DistributionTarget (channel id, page id, ...) */
  targetMetadata?: Record<string, any>;
}

export interface DistributionPostResult {
  externalId: string;
  externalUrl: string;
  metadata?: Record<string, any>;
}

export interface DistributionMetrics {
  views?: number;
  likes?: number;
  shares?: number;
  comments?: number;
  saves?: number;
  /** Raw provider response for debugging */
  raw?: Record<string, any>;
}

export class NotConfiguredError extends Error {
  code = 'NOT_CONFIGURED';
  constructor(public platform: DistributionPlatform, public missingEnv: string[]) {
    super(`${platform}: missing env ${missingEnv.join(', ')}`);
  }
}

export interface ISocialAdapter {
  platform: DistributionPlatform;
  /** Lightweight readiness check — does this adapter have its env / auth state? */
  isConfigured(): boolean;
  /** Publish the item to the target. Throws NotConfiguredError if not ready. */
  post(payload: DistributionPayload): Promise<DistributionPostResult>;
  /** Fetch latest metrics for a published post. Returns null if not supported. */
  fetchMetrics(externalId: string, targetMetadata?: Record<string, any>): Promise<DistributionMetrics | null>;
}

// ─── Registry ────────────────────────────────────────────────────────────────

const adapters: Map<DistributionPlatform, ISocialAdapter> = new Map();

export function registerAdapter(adapter: ISocialAdapter): void {
  adapters.set(adapter.platform, adapter);
}

export function getAdapter(platform: DistributionPlatform): ISocialAdapter | undefined {
  return adapters.get(platform);
}

export function listAdapters(): ISocialAdapter[] {
  return [...adapters.values()];
}

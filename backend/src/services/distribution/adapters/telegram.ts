/**
 * Telegram adapter (P7.2) — Bot API, simplest auth (single bot token).
 *
 * Setup:
 *   1. Talk to @BotFather, /newbot → get token, save as TELEGRAM_BOT_TOKEN
 *   2. Add bot to your CoinDaily channel as an admin
 *   3. Channel id goes into DistributionTarget.metadata.channelId (e.g. @coindailyafrica)
 *
 * Supports: article + video + image posts. Metrics via getChatMessage view count.
 */

import type { ISocialAdapter, DistributionPayload, DistributionPostResult, DistributionMetrics } from '../socialAdapter';
import { NotConfiguredError } from '../socialAdapter';

const BASE = 'https://api.telegram.org';

export class TelegramAdapter implements ISocialAdapter {
  platform = 'telegram' as const;

  isConfigured(): boolean {
    return Boolean(process.env.TELEGRAM_BOT_TOKEN);
  }

  async post(payload: DistributionPayload): Promise<DistributionPostResult> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new NotConfiguredError('telegram', ['TELEGRAM_BOT_TOKEN']);

    const channelId = payload.targetMetadata?.channelId || process.env.TELEGRAM_DEFAULT_CHANNEL;
    if (!channelId) throw new NotConfiguredError('telegram', ['target.metadata.channelId']);

    const caption = formatCaption(payload);

    // Prefer richest format: video > photo > article-link
    let method = 'sendMessage';
    let body: Record<string, any> = {
      chat_id: channelId,
      text: caption,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    };

    if (payload.itemType === 'video' && payload.mediaUrl) {
      method = 'sendVideo';
      body = {
        chat_id: channelId,
        video: payload.mediaUrl,
        caption,
        parse_mode: 'HTML',
      };
    } else if (payload.itemType === 'image' && payload.mediaUrl) {
      method = 'sendPhoto';
      body = {
        chat_id: channelId,
        photo: payload.mediaUrl,
        caption,
        parse_mode: 'HTML',
      };
    }

    const res = await fetch(`${BASE}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`telegram ${method} HTTP ${res.status}: ${detail.slice(0, 200)}`);
    }
    const data = (await res.json()) as { ok: boolean; result?: any; description?: string };
    if (!data.ok || !data.result?.message_id) {
      throw new Error(`telegram returned not-ok: ${data.description || 'unknown'}`);
    }
    const externalId = String(data.result.message_id);
    const channelHandle = String(channelId).replace(/^@/, '');
    return {
      externalId,
      externalUrl: `https://t.me/${channelHandle}/${externalId}`,
      metadata: { chatId: channelId },
    };
  }

  async fetchMetrics(externalId: string, targetMetadata?: Record<string, any>): Promise<DistributionMetrics | null> {
    // Bot API doesn't expose view counts on channel posts unless we're an
    // admin AND using getMessages (only chat admins). Best-effort: leave
    // metrics null for now; manual tracking via Telegram's native analytics.
    return null;
  }
}

function formatCaption(payload: DistributionPayload): string {
  const tags = (payload.tags || []).map(t => `#${t.replace(/\s+/g, '')}`).join(' ');
  const parts: string[] = [
    `<b>${escapeHtml(payload.title)}</b>`,
    '',
    payload.description ? escapeHtml(payload.description) : '',
    '',
    `<a href="${escapeAttr(payload.articleUrl)}">Read on CoinDaily →</a>`,
    tags ? `\n${tags}` : '',
  ];
  return parts.filter(Boolean).join('\n').slice(0, 1024); // Telegram caption limit
}

function escapeHtml(s: string): string {
  return s.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, '%22');
}

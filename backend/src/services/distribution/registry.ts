/**
 * Distribution adapter registry init (P7.2).
 * Imported once at backend boot to register every adapter.
 */

import { registerAdapter } from './socialAdapter';
import { TelegramAdapter } from './adapters/telegram';
import { FacebookAdapter } from './adapters/facebook';
import {
  YouTubeAdapter,
  TikTokAdapter,
  InstagramAdapter,
  XAdapter,
  LinkedInAdapter,
  WhatsAppAdapter,
} from './adapters/stubs';

let registered = false;

export function initAdapters(): void {
  if (registered) return;
  registered = true;
  registerAdapter(new TelegramAdapter());
  registerAdapter(new FacebookAdapter());
  registerAdapter(new YouTubeAdapter());
  registerAdapter(new TikTokAdapter());
  registerAdapter(new InstagramAdapter());
  registerAdapter(new XAdapter());
  registerAdapter(new LinkedInAdapter());
  registerAdapter(new WhatsAppAdapter());
}

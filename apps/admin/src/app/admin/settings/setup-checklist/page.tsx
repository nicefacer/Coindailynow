'use client';

/**
 * /admin/settings/setup-checklist (P8.0)
 *
 * Living TODO of every manual, offline setup task: API key sign-ups,
 * OAuth app registrations, business verifications, env vars to set.
 * Status pulls live from /api/admin/distribution/platforms (for adapters)
 * + simple env-presence checks (for keys we can't introspect from here).
 *
 * Editor toggles items as DONE locally (persisted in localStorage). The
 * cleanest signal is the actual configured/not-configured state from the
 * backend, so DONE checkmarks are advisory only.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, Circle, ExternalLink, Copy, Clock, AlertCircle,
  Loader2, Settings2, KeyRound, ShieldCheck, Coins, Plug,
} from 'lucide-react';
import { getAccessToken } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const LS_KEY = 'admin_setup_checklist_done';

interface ChecklistItem {
  id: string;
  group: 'video' | 'social' | 'voice' | 'cdn' | 'observability';
  title: string;
  why: string;
  steps: string[];
  envVars: string[];
  cost: string;
  externalUrl?: string;
  /** Platform name we can ask the backend about (matches DistributionPlatform). */
  platformPing?: string;
  required: boolean;
}

const CHECKLIST: ChecklistItem[] = [
  // ─── VOICE / VIDEO PROVIDERS ──────────────────────────────────────────────
  {
    id: 'coqui',
    group: 'voice',
    title: 'Self-host Coqui XTTS server',
    why: 'Free, multilingual voiceover for video. Lives on your Contabo box; no per-call cost.',
    steps: [
      'SSH to Contabo: docker run -d -p 5002:5002 ghcr.io/coqui-ai/tts-server:latest',
      'Verify: curl http://localhost:5002/health',
      'Set COQUI_TTS_URL=http://localhost:5002 in backend/.env',
    ],
    envVars: ['COQUI_TTS_URL'],
    cost: 'Free (~2GB RAM on Contabo)',
    externalUrl: 'https://github.com/coqui-ai/TTS',
    required: true,
  },
  {
    id: 'did',
    group: 'video',
    title: 'D-ID — avatar short videos (30-60s)',
    why: 'Cheapest avatar API for TikTok/Reels/Shorts.',
    steps: [
      'Sign up at studio.d-id.com → Developer tab',
      'Generate API key (Basic auth)',
      'Set DID_API_KEY in backend/.env',
      'Optional: upload a custom CoinDaily anchor image; set DID_PRESENTER_IMAGE_URL',
    ],
    envVars: ['DID_API_KEY', 'DID_PRESENTER_IMAGE_URL', 'DID_DEFAULT_VOICE'],
    cost: '$5/mo entry → ~$0.20 per 60s clip',
    externalUrl: 'https://studio.d-id.com',
    required: true,
  },
  {
    id: 'invideo',
    group: 'video',
    title: 'InVideo AI — long-form (3-5min)',
    why: 'Article → polished YouTube explainer with stock footage + AI voice.',
    steps: [
      'Apply for API access at invideo.io/ai (currently invite-only)',
      'On approval, generate API key',
      'Set INVIDEO_API_KEY + (optional) INVIDEO_TEMPLATE_ID',
    ],
    envVars: ['INVIDEO_API_KEY', 'INVIDEO_TEMPLATE_ID', 'INVIDEO_VOICE'],
    cost: '$20/mo for 60 min/month',
    externalUrl: 'https://invideo.io/ai',
    required: false,
  },
  {
    id: 'fal',
    group: 'video',
    title: 'fal.ai — cinematic B-roll clips',
    why: 'Optional intro/outro clips. Open-model video gen, pay-per-call.',
    steps: [
      'Sign up at fal.ai → Dashboard → API Keys',
      'Set FAL_API_KEY in backend/.env',
      'Optional: set FAL_MODEL (default fal-ai/ltx-video)',
    ],
    envVars: ['FAL_API_KEY', 'FAL_MODEL'],
    cost: '$10 free credit; ~$0.05-0.30 per 5s clip',
    externalUrl: 'https://fal.ai',
    required: false,
  },

  // ─── SOCIAL DISTRIBUTION ─────────────────────────────────────────────────
  {
    id: 'telegram',
    group: 'social',
    title: 'Telegram — channel + bot',
    why: 'Simplest social: bot token, no OAuth. Best for African + diaspora reach.',
    steps: [
      'In Telegram, message @BotFather → /newbot → name it CoinDailyBot',
      'BotFather gives you a token — set TELEGRAM_BOT_TOKEN',
      'Create CoinDaily channel; add bot as admin with post privileges',
      'In /admin/distribution → Targets, add target platform=telegram handle=@coindailyafrica',
    ],
    envVars: ['TELEGRAM_BOT_TOKEN'],
    cost: 'Free',
    externalUrl: 'https://t.me/BotFather',
    platformPing: 'telegram',
    required: true,
  },
  {
    id: 'meta-business',
    group: 'social',
    title: 'Meta Business Manager — root account (req for FB/IG/WhatsApp)',
    why: 'Single business account underpins Facebook Page, Instagram Business, WhatsApp Cloud API.',
    steps: [
      'Create business.facebook.com account if you don\'t have one',
      'Verify the business (1-3 weeks; pass commercial registration docs)',
      'You\'ll use this for Facebook Page + Instagram Business + WhatsApp setup',
    ],
    envVars: [],
    cost: 'Free, verification ~3 weeks',
    externalUrl: 'https://business.facebook.com',
    required: true,
  },
  {
    id: 'facebook',
    group: 'social',
    title: 'Facebook Page',
    why: 'Article + video distribution to Facebook readers.',
    steps: [
      'Create a Facebook Page under your Meta Business account',
      'developers.facebook.com → create app → add "Facebook Login for Business"',
      'Get a long-lived Page Access Token (use Graph API Explorer)',
      'Set FACEBOOK_DEFAULT_PAGE_ID + FACEBOOK_DEFAULT_PAGE_TOKEN',
    ],
    envVars: ['FACEBOOK_DEFAULT_PAGE_ID', 'FACEBOOK_DEFAULT_PAGE_TOKEN'],
    cost: 'Free',
    externalUrl: 'https://developers.facebook.com',
    platformPing: 'facebook',
    required: true,
  },
  {
    id: 'instagram',
    group: 'social',
    title: 'Instagram Business (Reels)',
    why: 'Required for posting Reels via API — personal accounts can\'t use the API.',
    steps: [
      'Convert Instagram to Business account (in IG app settings)',
      'Connect to the Facebook Page from above',
      'In Meta app, add "Instagram Graph API" product',
      'Get Instagram Business Account ID via Graph API Explorer',
      'Set INSTAGRAM_BUSINESS_ACCOUNT_ID + INSTAGRAM_ACCESS_TOKEN',
    ],
    envVars: ['INSTAGRAM_BUSINESS_ACCOUNT_ID', 'INSTAGRAM_ACCESS_TOKEN'],
    cost: 'Free (rate-limited to 25 posts/day/account)',
    externalUrl: 'https://developers.facebook.com/docs/instagram-api',
    platformPing: 'instagram',
    required: true,
  },
  {
    id: 'youtube',
    group: 'social',
    title: 'YouTube channel + Data API v3',
    why: 'YouTube Shorts (vertical) + long-form explainers.',
    steps: [
      'Create or claim CoinDaily YouTube channel',
      'console.cloud.google.com → new project → enable YouTube Data API v3',
      'Create OAuth 2.0 credentials (Web app)',
      'Use OAuth playground to generate refresh token with youtube.upload scope',
      'Set YOUTUBE_CLIENT_ID + YOUTUBE_CLIENT_SECRET + YOUTUBE_REFRESH_TOKEN',
    ],
    envVars: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN'],
    cost: 'Free (10k API units/day = ~6 uploads — request quota increase for more)',
    externalUrl: 'https://console.cloud.google.com',
    platformPing: 'youtube',
    required: true,
  },
  {
    id: 'tiktok',
    group: 'social',
    title: 'TikTok for Business — Content Posting API',
    why: 'Native TikTok publishing. Personal accounts cannot use the API.',
    steps: [
      'Apply for TikTok for Business account',
      'developers.tiktok.com → create app → add Content Posting API product',
      'App review takes 1-2 weeks',
      'Generate OAuth tokens; set TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET + TIKTOK_REFRESH_TOKEN',
    ],
    envVars: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REFRESH_TOKEN'],
    cost: 'Free; review ~1-2 weeks',
    externalUrl: 'https://developers.tiktok.com',
    platformPing: 'tiktok',
    required: true,
  },
  {
    id: 'x',
    group: 'social',
    title: 'X (Twitter) — paid API tier',
    why: 'Tweet articles + media. Free tier no longer supports posting.',
    steps: [
      'developer.x.com → sign up → choose Basic tier ($100/mo) for media uploads',
      'Create an app; generate OAuth 1.0a consumer key+secret + access token+secret',
      'Set X_API_KEY + X_API_SECRET + X_ACCESS_TOKEN + X_ACCESS_SECRET',
    ],
    envVars: ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'],
    cost: '$100/mo (Basic) — required for media; free tier read-only',
    externalUrl: 'https://developer.x.com',
    platformPing: 'x',
    required: false,
  },
  {
    id: 'linkedin',
    group: 'social',
    title: 'LinkedIn company page',
    why: 'Institutional reach for finance/policy content.',
    steps: [
      'Create CoinDaily company page on LinkedIn',
      'linkedin.com/developers → create app → request Sign In with LinkedIn + Share on LinkedIn products',
      'OAuth dance to get access token with w_organization_social scope',
      'Set LINKEDIN_ORG_ID + LINKEDIN_ACCESS_TOKEN',
    ],
    envVars: ['LINKEDIN_ORG_ID', 'LINKEDIN_ACCESS_TOKEN'],
    cost: 'Free',
    externalUrl: 'https://linkedin.com/developers',
    platformPing: 'linkedin',
    required: false,
  },
  {
    id: 'whatsapp',
    group: 'social',
    title: 'WhatsApp Cloud API',
    why: 'Direct delivery to subscribers via WhatsApp.',
    steps: [
      'Meta Business → WhatsApp → set up Cloud API',
      'Add a phone number (free test number; production needs your own)',
      'Business verification (~3 weeks first time)',
      'Generate a permanent system user token',
      'Set WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_ACCESS_TOKEN',
    ],
    envVars: ['WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN'],
    cost: 'Free for first 1000 conversations/month; then per-message',
    externalUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
    platformPing: 'whatsapp',
    required: false,
  },

  // ─── CDN / STORAGE ──────────────────────────────────────────────────────
  {
    id: 'b2',
    group: 'cdn',
    title: 'Backblaze B2 — media storage',
    why: 'Where Iengine + voiceover + ffmpeg-composed videos land. Cheaper than S3.',
    steps: [
      'Sign up at backblaze.com → B2 Cloud Storage',
      'Create bucket coindaily-media (Public)',
      'Create Application Key with read+write to that bucket',
      'Set B2_APPLICATION_KEY_ID + B2_APPLICATION_KEY + B2_BUCKET_NAME',
    ],
    envVars: ['B2_APPLICATION_KEY_ID', 'B2_APPLICATION_KEY', 'B2_BUCKET_NAME', 'B2_ENDPOINT'],
    cost: '~$5/TB/month',
    externalUrl: 'https://backblaze.com',
    required: true,
  },

  // ─── OBSERVABILITY ──────────────────────────────────────────────────────
  {
    id: 'frontend-revalidate',
    group: 'observability',
    title: 'Frontend revalidate webhook',
    why: 'When article approved, frontend re-renders without a deploy.',
    steps: [
      'In frontend, add /api/revalidate that accepts {slug, paths[]} with a bearer secret',
      'Set FRONTEND_REVALIDATE_URL + FRONTEND_REVALIDATE_SECRET in backend/.env',
    ],
    envVars: ['FRONTEND_REVALIDATE_URL', 'FRONTEND_REVALIDATE_SECRET'],
    cost: 'Free',
    required: false,
  },
];

export default function SetupChecklistPage() {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [platformStatus, setPlatformStatus] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'required' | 'todo' | 'done'>('all');

  // Load checked state from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setDone(new Set(JSON.parse(raw)));
    } catch {}
  }, []);

  // Load live adapter configured-status from backend
  const refresh = useCallback(async () => {
    const token = getAccessToken();
    if (!token) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/distribution/platforms`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = (await res.json()) as { platforms: Array<{ platform: string; configured: boolean }> };
        const map: Record<string, boolean> = {};
        for (const p of json.platforms) map[p.platform] = p.configured;
        setPlatformStatus(map);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const toggle = (id: string) => {
    setDone(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(LS_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const isItemDone = (item: ChecklistItem): boolean => {
    if (item.platformPing && platformStatus[item.platformPing]) return true;
    return done.has(item.id);
  };

  const counts = useMemo(() => {
    const required = CHECKLIST.filter(i => i.required);
    return {
      requiredDone: required.filter(isItemDone).length,
      required: required.length,
      total: CHECKLIST.length,
      totalDone: CHECKLIST.filter(isItemDone).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, platformStatus]);

  const filtered = CHECKLIST.filter(item => {
    if (filter === 'required') return item.required;
    if (filter === 'todo') return !isItemDone(item);
    if (filter === 'done') return isItemDone(item);
    return true;
  });

  const grouped: Record<string, ChecklistItem[]> = {};
  for (const item of filtered) {
    (grouped[item.group] ||= []).push(item);
  }

  return (
    <div className="p-6 max-w-4xl space-y-4">
      <header>
        <h1 className="text-xl font-bold text-gray-900">Setup checklist</h1>
        <p className="text-sm text-gray-500">
          Manual offline tasks: API keys, OAuth apps, business verifications, env vars.
          Items with a backend-known status (social platforms) auto-check when configured;
          others toggle locally.
        </p>
      </header>

      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900">
              <span className="text-indigo-600">{counts.requiredDone}/{counts.required}</span> required
              <span className="ml-3 text-gray-400">·</span>
              <span className="ml-3 text-gray-500">{counts.totalDone}/{counts.total} total</span>
            </p>
            <div className="mt-2 h-1.5 w-64 overflow-hidden rounded bg-gray-200">
              <div
                className="h-full bg-indigo-600 transition-all"
                style={{ width: `${(counts.requiredDone / Math.max(counts.required, 1)) * 100}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-lg border p-0.5 text-xs">
            {(['all', 'required', 'todo', 'done'] as const).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded px-2.5 py-1 ${filter === f ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 p-3 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading live adapter status…
        </div>
      )}

      {Object.entries(grouped).map(([group, items]) => (
        <section key={group} className="rounded-xl border bg-white">
          <header className="border-b px-4 py-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              {groupLabel(group)}
            </h2>
          </header>
          <ul className="divide-y">
            {items.map(item => (
              <ChecklistRow
                key={item.id}
                item={item}
                done={isItemDone(item)}
                liveConfigured={item.platformPing ? !!platformStatus[item.platformPing] : false}
                onToggle={() => toggle(item.id)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ChecklistRow({
  item, done, liveConfigured, onToggle,
}: { item: ChecklistItem; done: boolean; liveConfigured: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          className="mt-0.5 shrink-0"
          disabled={liveConfigured}
          title={liveConfigured ? 'Auto-detected as configured by backend' : 'Toggle manually'}
        >
          {done ? (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          ) : (
            <Circle className="h-5 w-5 text-gray-300" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <button type="button" onClick={() => setOpen(o => !o)} className="text-left">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`font-medium ${done ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                {item.title}
              </span>
              {item.required && !done && (
                <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">required</span>
              )}
              {liveConfigured && (
                <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">backend-detected</span>
              )}
              <span className="text-xs text-gray-400">{item.cost}</span>
            </div>
            <p className="mt-0.5 text-xs text-gray-500">{item.why}</p>
          </button>

          {open && (
            <div className="mt-3 space-y-2 text-xs">
              <div>
                <p className="mb-1 font-medium text-gray-700">Steps:</p>
                <ol className="ml-5 list-decimal space-y-1 text-gray-600">
                  {item.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
              {item.envVars.length > 0 && (
                <div>
                  <p className="mb-1 font-medium text-gray-700">Env vars to set in backend/.env:</p>
                  <ul className="ml-5 list-disc space-y-0.5 text-gray-600">
                    {item.envVars.map(v => (
                      <li key={v}>
                        <code className="rounded bg-gray-100 px-1 py-0.5 font-mono">{v}</code>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(v)}
                          className="ml-1.5 align-middle text-gray-400 hover:text-gray-700"
                          title="Copy"
                        >
                          <Copy className="inline h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {item.externalUrl && (
                <a
                  href={item.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
                >
                  Open external <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function groupLabel(g: string): string {
  switch (g) {
    case 'video': return 'Video generation';
    case 'voice': return 'Voiceover';
    case 'social': return 'Social distribution';
    case 'cdn': return 'CDN / storage';
    case 'observability': return 'Observability';
    default: return g;
  }
}

'use client';

/**
 * /admin/distribution — distribution dashboard (P7.3).
 *
 * Three tabs:
 *   - POSTS: recent distribution posts across all platforms, with per-platform
 *     metrics + republish/retry buttons.
 *   - TARGETS: configured social platform handles (enable / disable / add new).
 *   - PLATFORMS: which adapters are env-configured + setup hints.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Share2,
  ExternalLink,
  RefreshCw,
  Settings2,
  Eye,
  Heart,
  MessageSquare,
  Repeat2,
} from 'lucide-react';
import { getAccessToken } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type Tab = 'posts' | 'targets' | 'platforms';

interface DistributionPost {
  id: string;
  targetId: string;
  itemType: 'article' | 'video' | 'image' | string;
  itemId: string;
  externalId: string | null;
  externalUrl: string | null;
  status: 'PENDING' | 'POSTED' | 'FAILED' | string;
  errorMessage: string | null;
  postedAt: string | null;
  metrics: { views?: number; likes?: number; shares?: number; comments?: number } | null;
  createdAt: string;
  target: { platform: string; handle: string };
}

interface Target {
  id: string;
  platform: string;
  handle: string;
  enabled: boolean;
  authMode: string;
  metadata: any;
}

interface PlatformStatus {
  platform: string;
  configured: boolean;
}

export default function DistributionDashboard() {
  const [tab, setTab] = useState<Tab>('posts');

  const headers = useMemo(() => {
    const t = getAccessToken();
    return t ? { Authorization: `Bearer ${t}` } : null;
  }, []);

  return (
    <div className="p-6 space-y-4">
      <header>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Share2 className="h-5 w-5 text-indigo-600" /> Distribution
        </h1>
        <p className="text-sm text-gray-500">
          Cross-platform publishing for articles, videos, and images. Powered by the dispatcher
          worker that fans out approved items to enabled targets.
        </p>
      </header>

      <nav className="flex gap-1 border-b">
        {(['posts', 'targets', 'platforms'] as Tab[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t === 'posts' ? 'Recent posts' : t === 'targets' ? 'Targets' : 'Platforms'}
          </button>
        ))}
      </nav>

      {tab === 'posts' && <PostsTab headers={headers} />}
      {tab === 'targets' && <TargetsTab headers={headers} />}
      {tab === 'platforms' && <PlatformsTab headers={headers} />}
    </div>
  );
}

function PostsTab({ headers }: { headers: Record<string, string> | null }) {
  const [posts, setPosts] = useState<DistributionPost[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const refresh = useCallback(async () => {
    if (!headers) return;
    setLoading(true);
    try {
      const url = `${API_URL}/api/admin/distribution/posts?limit=200${statusFilter ? `&status=${statusFilter}` : ''}`;
      const res = await fetch(url, { headers });
      const json = (await res.json()) as { posts: DistributionPost[] };
      setPosts(json.posts || []);
    } finally {
      setLoading(false);
    }
  }, [headers, statusFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  const republish = async (post: DistributionPost) => {
    if (!headers) return;
    await fetch(`${API_URL}/api/admin/distribution/posts/republish`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemType: post.itemType,
        itemId: post.itemId,
        platforms: [post.target.platform],
      }),
    });
    await refresh();
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded border px-2 py-1 text-xs"
        >
          <option value="">All statuses</option>
          <option value="POSTED">Posted</option>
          <option value="PENDING">Pending</option>
          <option value="FAILED">Failed</option>
        </select>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded border bg-white px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>

      <ul className="divide-y rounded-xl border bg-white">
        {posts?.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-gray-500">
            No distribution posts yet. Approve a video at <Link href="/admin/videos" className="text-indigo-600 hover:underline">/admin/videos</Link> to kick off the first run.
          </li>
        )}
        {posts?.map(p => (
          <li key={p.id} className="px-4 py-3">
            <div className="flex items-center gap-3">
              <StatusIcon status={p.status} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono text-xs uppercase rounded bg-gray-100 px-1.5 py-0.5">{p.target.platform}</span>
                  <span className="text-gray-700">{p.target.handle}</span>
                  <span className="text-gray-400">·</span>
                  <span className="font-medium text-gray-700">{p.itemType}</span>
                  <span className="font-mono text-xs text-gray-500">{p.itemId.slice(0, 8)}…</span>
                  {p.externalUrl && (
                    <a href={p.externalUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline inline-flex items-center gap-0.5 text-xs">
                      open <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-gray-500">
                  {p.postedAt ? new Date(p.postedAt).toLocaleString() : new Date(p.createdAt).toLocaleString()}
                </div>
                {p.errorMessage && (
                  <div className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{p.errorMessage}</div>
                )}
                {p.metrics && (
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-600">
                    {typeof p.metrics.views === 'number' && <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> {p.metrics.views.toLocaleString()}</span>}
                    {typeof p.metrics.likes === 'number' && <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" /> {p.metrics.likes.toLocaleString()}</span>}
                    {typeof p.metrics.comments === 'number' && <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {p.metrics.comments.toLocaleString()}</span>}
                    {typeof p.metrics.shares === 'number' && <span className="inline-flex items-center gap-1"><Repeat2 className="h-3 w-3" /> {p.metrics.shares.toLocaleString()}</span>}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => republish(p)}
                className="shrink-0 rounded border px-2 py-1 text-xs hover:bg-gray-50"
                title="Republish to this platform"
              >
                Republish
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TargetsTab({ headers }: { headers: Record<string, string> | null }) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Target> | null>(null);

  const refresh = useCallback(async () => {
    if (!headers) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/distribution/targets`, { headers });
      const json = (await res.json()) as { targets: Target[] };
      setTargets(json.targets || []);
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => { refresh(); }, [refresh]);

  const save = async () => {
    if (!headers || !editing?.platform || !editing.handle) return;
    await fetch(`${API_URL}/api/admin/distribution/targets`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: editing.platform,
        handle: editing.handle,
        enabled: editing.enabled ?? true,
        metadata: editing.metadata || {},
      }),
    });
    setEditing(null);
    await refresh();
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">Configured platform handles. The dispatcher posts to every <strong>enabled</strong> target.</p>
        <button
          type="button"
          onClick={() => setEditing({ platform: 'telegram', handle: '', enabled: true })}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
        >
          + Add target
        </button>
      </div>

      <ul className="divide-y rounded-xl border bg-white">
        {loading && <li className="px-4 py-3 text-sm text-gray-500">Loading…</li>}
        {!loading && targets.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-gray-500">
            No targets yet. Add one to start distributing.
          </li>
        )}
        {targets.map(t => (
          <li key={t.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <span className={`h-2 w-2 rounded-full ${t.enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
            <span className="font-mono text-xs uppercase rounded bg-gray-100 px-1.5 py-0.5">{t.platform}</span>
            <span className="flex-1 text-gray-800">{t.handle}</span>
            <span className="text-xs text-gray-500">{t.enabled ? 'enabled' : 'disabled'}</span>
            <button
              type="button"
              onClick={() => setEditing(t)}
              className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
            >
              <Settings2 className="inline h-3 w-3" /> edit
            </button>
          </li>
        ))}
      </ul>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold">{editing.id ? 'Edit target' : 'New target'}</h3>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-medium text-gray-700">
                Platform
                <select
                  value={editing.platform}
                  onChange={e => setEditing({ ...editing, platform: e.target.value })}
                  disabled={!!editing.id}
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                >
                  {['telegram', 'facebook', 'youtube', 'tiktok', 'instagram', 'x', 'linkedin', 'whatsapp'].map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-gray-700">
                Handle (channel id / page id / username)
                <input
                  type="text"
                  value={editing.handle || ''}
                  onChange={e => setEditing({ ...editing, handle: e.target.value })}
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                  placeholder="@coindailyafrica or page id"
                />
              </label>
              <label className="block text-xs font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={editing.enabled ?? true}
                  onChange={e => setEditing({ ...editing, enabled: e.target.checked })}
                  className="mr-2"
                />
                Enabled
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
              <button onClick={save} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">Save</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PlatformsTab({ headers }: { headers: Record<string, string> | null }) {
  const [platforms, setPlatforms] = useState<PlatformStatus[]>([]);

  useEffect(() => {
    if (!headers) return;
    fetch(`${API_URL}/api/admin/distribution/platforms`, { headers })
      .then(r => r.json())
      .then(j => setPlatforms(j.platforms || []));
  }, [headers]);

  const hints: Record<string, string> = {
    youtube: 'YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN — OAuth 2.0; videos.insert needs upload scope',
    tiktok: 'TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REFRESH_TOKEN — Content Posting API, requires TikTok for Business',
    instagram: 'INSTAGRAM_BUSINESS_ACCOUNT_ID, INSTAGRAM_ACCESS_TOKEN — Meta Graph API, business account',
    x: 'X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET — paid Basic tier ($100/mo) for media',
    facebook: 'FACEBOOK_DEFAULT_PAGE_ID, FACEBOOK_DEFAULT_PAGE_TOKEN — page access token',
    linkedin: 'LINKEDIN_ORG_ID, LINKEDIN_ACCESS_TOKEN — w_organization_social scope',
    telegram: 'TELEGRAM_BOT_TOKEN — simplest: get from @BotFather, add bot as channel admin',
    whatsapp: 'WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN — Cloud API + business verification',
  };

  return (
    <section className="space-y-2">
      <p className="text-sm text-gray-600">Each adapter checks for required env vars on startup. Configured adapters can post to any target on that platform.</p>
      <ul className="divide-y rounded-xl border bg-white">
        {platforms.map(p => (
          <li key={p.platform} className="flex items-start gap-3 px-4 py-3 text-sm">
            <span className={`mt-0.5 h-2 w-2 rounded-full ${p.configured ? 'bg-green-500' : 'bg-gray-300'}`} />
            <div className="flex-1">
              <span className="font-mono text-xs uppercase rounded bg-gray-100 px-1.5 py-0.5">{p.platform}</span>
              <span className="ml-2 text-xs text-gray-500">{p.configured ? 'configured' : 'not configured'}</span>
              <div className="mt-1 text-xs text-gray-500">{hints[p.platform] || 'See adapter file for setup.'}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'POSTED': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case 'FAILED': return <XCircle className="h-4 w-4 text-red-600" />;
    case 'PENDING': return <Clock className="h-4 w-4 text-amber-500" />;
    default: return <AlertCircle className="h-4 w-4 text-gray-400" />;
  }
}

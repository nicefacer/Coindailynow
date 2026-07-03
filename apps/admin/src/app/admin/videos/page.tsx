'use client';

/**
 * /admin/videos — list of video pipeline runs (P6.7).
 * Filter by status; click into a run for review.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, AlertCircle, CheckCircle2, Clock, PlayCircle, RefreshCw, Filter, Film } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface VideoRunRow {
  id: string;
  articleId: string;
  status: 'RUNNING' | 'READY_FOR_REVIEW' | 'APPROVED' | 'REJECTED' | 'FAILED' | string;
  totalDurationMs: number | null;
  totalCostUsd: string | null;
  createdAt: string;
  assets: Array<{ format: string; url: string; provider: string | null }>;
}

const STATUS_OPTIONS = [
  { value: 'READY_FOR_REVIEW', label: 'Ready for review' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'FAILED', label: 'Failed' },
];

export default function VideosListPage() {
  const [status, setStatus] = useState('READY_FOR_REVIEW');
  const [runs, setRuns] = useState<VideoRunRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const headers = useMemo(() => {
    const t = getAccessToken();
    return t ? { Authorization: `Bearer ${t}` } : null;
  }, []);

  const refresh = useCallback(async () => {
    if (!headers) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/video-runs?status=${encodeURIComponent(status)}&limit=100`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { runs: VideoRunRow[] };
      setRuns(json.runs || []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [headers, status]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Film className="h-5 w-5 text-indigo-600" /> Video pipeline
          </h1>
          <p className="text-sm text-gray-500">
            Per-article video runs. Short (60s vertical) + long (3-5 min landscape) outputs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-lg border bg-white px-2 py-1 text-xs">
            <Filter className="h-3 w-3 text-gray-400" />
            <select value={status} onChange={e => setStatus(e.target.value)} className="bg-transparent text-xs focus:outline-none">
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {!loading && runs && runs.length === 0 && (
        <div className="rounded-xl border bg-gray-50 p-6 text-center text-sm text-gray-500">
          No video runs with status <span className="font-mono">{status}</span>.
          {status === 'READY_FOR_REVIEW' && (
            <span className="block mt-1">Runs are auto-created when an article is approved & published.</span>
          )}
        </div>
      )}

      <ul className="divide-y rounded-xl border bg-white">
        {runs?.map(run => (
          <li key={run.id} className="px-4 py-3 hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <StatusIcon status={run.status} />
              <div className="flex-1 min-w-0">
                <Link href={`/admin/videos/${run.id}`} className="font-medium text-gray-900 hover:text-indigo-700">
                  Article {run.articleId.slice(0, 8)}…
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                  <span className="font-mono">{run.id.slice(0, 8)}…</span>
                  <span>· {new Date(run.createdAt).toLocaleString()}</span>
                  {run.assets.map(a => (
                    <span
                      key={a.format}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        a.format === 'SHORT' ? 'bg-indigo-100 text-indigo-700' :
                        a.format === 'LONG' ? 'bg-purple-100 text-purple-700' :
                        'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {a.format} · {a.provider}
                    </span>
                  ))}
                  {typeof run.totalDurationMs === 'number' && (
                    <span>⏱ {(run.totalDurationMs / 1000).toFixed(1)}s pipeline</span>
                  )}
                </div>
              </div>
              <Link href={`/admin/videos/${run.id}`} className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">
                Open
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'READY_FOR_REVIEW': return <PlayCircle className="h-4 w-4 text-indigo-600" />;
    case 'RUNNING': return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
    case 'APPROVED': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case 'FAILED': return <AlertCircle className="h-4 w-4 text-red-600" />;
    default: return <Clock className="h-4 w-4 text-gray-400" />;
  }
}

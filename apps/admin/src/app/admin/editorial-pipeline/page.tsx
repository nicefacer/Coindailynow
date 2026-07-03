'use client';

/**
 * /admin/editorial-pipeline — list of editorial pipeline runs.
 *
 * Replaces "guess the runId" by surfacing every PipelineRun from
 * GET /api/admin/pipeline-runs?status=… and linking into the doc editor at
 * /admin/review/[runId]. Default filter shows READY_FOR_REVIEW; toggles
 * expose RUNNING / FAILED / APPROVED for triage.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  PlayCircle,
  RefreshCw,
  Filter,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { getAccessToken } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface PipelineRunRow {
  id: string;
  topic: string;
  status: 'RUNNING' | 'READY_FOR_REVIEW' | 'SUBMITTED_FOR_REVIEW' | 'APPROVED' | 'REJECTED' | 'FAILED' | string;
  articleId: string | null;
  isMockMode: boolean;
  createdAt: string;
  updatedAt: string;
  totalDurationMs: number | null;
  totalTokens: number | null;
  totalCostUsd: string | null;
  seedSource: string | null;
  submittedForReviewAt: string | null;
  approvedAt: string | null;
}

const STATUS_OPTIONS = [
  { value: 'READY_FOR_REVIEW', label: 'Ready for review' },
  { value: 'SUBMITTED_FOR_REVIEW', label: 'Submitted (awaiting approver)' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'APPROVED', label: 'Approved' },
];

function formatDuration(ms: number | null): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatTokens(n: number | null): string {
  if (!n) return '—';
  if (n < 1000) return `${n}`;
  return `${(n / 1000).toFixed(1)}k`;
}

function formatCost(c: string | null): string {
  if (!c) return '$0';
  const num = Number(c);
  if (!isFinite(num) || num === 0) return '$0';
  if (num < 0.01) return `<$0.01`;
  return `$${num.toFixed(2)}`;
}

export default function EditorialPipelinePage() {
  const [status, setStatus] = useState<string>('READY_FOR_REVIEW');
  const [runs, setRuns] = useState<PipelineRunRow[] | null>(null);
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
      const res = await fetch(`${API_URL}/api/admin/pipeline-runs?status=${encodeURIComponent(status)}&limit=100`, {
        headers,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { runs: PipelineRunRow[] };
      setRuns(json.runs || []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [headers, status]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Editorial pipeline</h1>
          <p className="text-sm text-gray-500">
            Doc-based review for every AI-generated article. Click a run to open the collab editor.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-lg border bg-white px-2 py-1 text-xs">
            <Filter className="h-3 w-3 text-gray-400" />
            <select value={status} onChange={e => setStatus(e.target.value)} className="bg-transparent text-xs focus:outline-none">
              {STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
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
          No runs with status <span className="font-mono">{status}</span>.
          {status === 'READY_FOR_REVIEW' && (
            <span className="block mt-1">Trigger one via <Link href="/admin/content/ai-generate" className="text-indigo-600 hover:underline">AI Generate</Link> or wait for a promoted gov alert.</span>
          )}
        </div>
      )}

      <ul className="divide-y rounded-xl border bg-white">
        {runs?.map(run => (
          <li key={run.id} className="px-4 py-3 hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <StatusIcon status={run.status} />
              <div className="flex-1 min-w-0">
                <Link
                  href={`/admin/review/${run.id}`}
                  className="font-medium text-gray-900 hover:text-indigo-700 inline-flex items-center gap-1"
                >
                  {run.topic}
                  <ExternalLink className="h-3 w-3 opacity-50" />
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                  <span className="font-mono">{run.id.slice(0, 8)}…</span>
                  <span>· {new Date(run.createdAt).toLocaleString()}</span>
                  {run.isMockMode && (
                    <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] font-medium text-yellow-800">mock</span>
                  )}
                  {run.seedSource && run.seedSource !== 'user_trigger' && (
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800">
                      {run.seedSource}
                    </span>
                  )}
                  {run.articleId && (
                    <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800">published</span>
                  )}
                  {/* P4.5 — cost + duration + tokens */}
                  <span title="Total pipeline duration">⏱ {formatDuration(run.totalDurationMs)}</span>
                  <span title="Total LLM tokens">⚡ {formatTokens(run.totalTokens)}</span>
                  <span title="Estimated cost (USD)">💰 {formatCost(run.totalCostUsd)}</span>
                </div>
              </div>
              <Link
                href={`/admin/review/${run.id}`}
                className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
              >
                Open
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 rounded-xl border border-dashed bg-white p-4 text-xs text-gray-500">
        <p className="font-medium text-gray-700">Pipeline shortcuts</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href="/admin/content/ai-generate" className="inline-flex items-center gap-1 rounded border bg-white px-2 py-1 hover:bg-gray-50">
            <Sparkles className="h-3 w-3" /> Generate new article
          </Link>
          <Link href="/admin/gov-alerts" className="inline-flex items-center gap-1 rounded border bg-white px-2 py-1 hover:bg-gray-50">
            <PlayCircle className="h-3 w-3" /> Gov wire
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'READY_FOR_REVIEW':
      return <Sparkles className="h-4 w-4 text-indigo-600" />;
    case 'RUNNING':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
    case 'APPROVED':
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case 'FAILED':
      return <AlertCircle className="h-4 w-4 text-red-600" />;
    default:
      return <Clock className="h-4 w-4 text-gray-400" />;
  }
}

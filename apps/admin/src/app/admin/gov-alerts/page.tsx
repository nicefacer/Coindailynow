'use client';

/**
 * /admin/gov-alerts — incoming wire from the GovMonitor worker (P3.8 + P3.5 C).
 *
 * Lists recent regulator / central-bank / agency announcements with one-click
 * "promote" to enqueue them as candidate research seeds for the editorial
 * pipeline. Promotion writes to a Redis list the orchestrator consumer (Task B)
 * picks up to auto-create PipelineRuns.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, AlertCircle, ExternalLink, Send, RefreshCw, Filter } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface GovAlert {
  url: string;
  title: string;
  summary?: string;
  publishedAt?: string;
  source: string;
  sourceName: string;
  region: 'US' | 'LATAM' | 'CARIBBEAN' | 'PAPERS' | 'GLOBAL' | string;
  country?: string;
  category: string;
  credibility_score: number;
  detectedAt: string;
}

const REGION_COLORS: Record<string, string> = {
  US: 'bg-blue-100 text-blue-700',
  LATAM: 'bg-amber-100 text-amber-700',
  CARIBBEAN: 'bg-teal-100 text-teal-700',
  PAPERS: 'bg-purple-100 text-purple-700',
  GLOBAL: 'bg-slate-100 text-slate-700',
};

export default function GovAlertsPage() {
  const [alerts, setAlerts] = useState<GovAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [promoting, setPromoting] = useState<string | null>(null);
  const [promoted, setPromoted] = useState<Set<string>>(new Set());

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
      const res = await fetch(`${API_URL}/api/admin/gov-alerts/recent?limit=100`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { alerts: GovAlert[] };
      setAlerts(json.alerts || []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const promote = async (alert: GovAlert) => {
    if (!headers) return;
    setPromoting(alert.url);
    try {
      const res = await fetch(`${API_URL}/api/admin/gov-alerts/promote`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: alert.url }),
      });
      if (!res.ok) throw new Error(`Promote failed (${res.status})`);
      setPromoted(prev => new Set(prev).add(alert.url));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPromoting(null);
    }
  };

  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.region === filter || a.category === filter);

  if (error && !alerts.length) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <AlertCircle className="h-5 w-5" />
          {error}
          <button type="button" onClick={refresh} className="ml-auto rounded px-2 py-1 text-xs font-medium hover:bg-red-100">
            retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Government wire</h1>
          <p className="text-sm text-gray-500">
            Incoming regulator / central bank / agency announcements detected by the GovMonitor worker.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-lg border bg-white px-2 py-1 text-xs">
            <Filter className="h-3 w-3 text-gray-400" />
            <select
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="bg-transparent text-xs focus:outline-none"
            >
              <option value="all">All</option>
              <option value="US">US</option>
              <option value="LATAM">LATAM</option>
              <option value="CARIBBEAN">Caribbean</option>
              <option value="PAPERS">Papers</option>
              <option value="GLOBAL">Global</option>
              <option value="regulator">Regulators</option>
              <option value="central_bank">Central banks</option>
              <option value="agency">Agencies</option>
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
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
          {error}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="rounded-xl border bg-gray-50 p-6 text-center text-sm text-gray-500">
          No alerts {filter !== 'all' ? `for filter "${filter}"` : 'yet'}. The worker polls every 15 minutes.
        </div>
      )}

      <ul className="divide-y rounded-xl border bg-white">
        {filtered.map(a => {
          const isPromoting = promoting === a.url;
          const isPromoted = promoted.has(a.url);
          return (
            <li key={a.url} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className={`rounded px-1.5 py-0.5 font-medium ${REGION_COLORS[a.region] || 'bg-gray-100 text-gray-700'}`}>
                    {a.region}
                  </span>
                  <span>{a.sourceName}</span>
                  {a.country && <span>· {a.country}</span>}
                  <span>· cred {a.credibility_score}</span>
                  {a.publishedAt && <span>· {new Date(a.publishedAt).toLocaleString()}</span>}
                </div>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 font-medium text-gray-900 hover:text-indigo-700"
                >
                  {a.title}
                  <ExternalLink className="h-3 w-3 opacity-50" />
                </a>
                {a.summary && (
                  <p className="mt-1 line-clamp-2 text-sm text-gray-600">{a.summary}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => promote(a)}
                disabled={isPromoting || isPromoted}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                  isPromoted
                    ? 'bg-green-100 text-green-700'
                    : 'border bg-white text-gray-700 hover:bg-indigo-50 hover:text-indigo-700'
                } disabled:opacity-50`}
              >
                {isPromoting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
                {isPromoted ? 'Promoted' : 'Promote'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

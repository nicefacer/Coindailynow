'use client';

/**
 * /super-admin/events/submissions — events awaiting moderation.
 * Lists CryptoEvent rows where status=PENDING; admin moderates from here.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Loader2, AlertCircle, CheckCircle2, XCircle, RefreshCw, Filter, ExternalLink } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Submission {
  id: string; title: string; slug: string;
  eventType: string; category: string;
  country?: string; startDate?: string;
  organizerName?: string; status: string;
  relevanceScore?: number;
  submissionSource?: string; createdAt: string;
}

const STATUS_TABS = ['PENDING', 'APPROVED', 'REJECTED', 'LIVE', 'COMPLETED'] as const;

export default function EventsSubmissionsPage() {
  const [status, setStatus] = useState<typeof STATUS_TABS[number]>('PENDING');
  const [rows, setRows] = useState<Submission[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moderating, setModerating] = useState<string | null>(null);

  const headers = useMemo<Record<string,string>>(() => {
    const t = getAccessToken();
    if (!t) return {} as Record<string,string>;
    return { Authorization: `Bearer ` + t };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/events/submissions/list?status=${status}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setRows(j.submissions || []);
      setError(null);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [status, headers]);

  useEffect(() => { refresh(); }, [refresh]);

  const moderate = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    setModerating(id);
    try {
      const res = await fetch(`${API_URL}/api/v1/events/${id}/moderate`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refresh();
    } catch (e: any) { setError(e.message); }
    finally { setModerating(null); }
  };

  return (
    <div className="p-6 space-y-4">
      <Link href="/super-admin" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600">
        <ChevronLeft className="h-4 w-4" /> Super Admin
      </Link>
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Event submissions</h1>
          <p className="text-sm text-gray-500">Events submitted by users / scrapers / API — admin moderates to push live.</p>
        </div>
        <button onClick={refresh} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Refresh
        </button>
      </header>

      <div className="flex items-center gap-1 rounded-lg border bg-white p-0.5 text-xs w-fit">
        <Filter className="h-3 w-3 text-gray-400 ml-2" />
        {STATUS_TABS.map(s => (
          <button key={s} type="button" onClick={() => setStatus(s)} className={`rounded px-2.5 py-1 ${status === s ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>{s}</button>
        ))}
      </div>

      {error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div>}

      <ul className="divide-y rounded-xl border bg-white">
        {rows && rows.length === 0 && (
          <li className="p-6 text-center text-sm text-gray-500">No {status.toLowerCase()} submissions.</li>
        )}
        {rows?.map(s => (
          <li key={s.id} className="px-4 py-3 hover:bg-gray-50">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono uppercase">{s.eventType}</span>
                  <span>{s.category}</span>
                  {s.country && <span>· {s.country}</span>}
                  {s.startDate && <span>· {new Date(s.startDate).toLocaleDateString()}</span>}
                  {s.submissionSource && <span>· via {s.submissionSource}</span>}
                  {typeof s.relevanceScore === 'number' && <span>· relevance {s.relevanceScore.toFixed(0)}/100</span>}
                </div>
                <h3 className="mt-1 font-semibold text-gray-900">{s.title}</h3>
                {s.organizerName && <p className="text-xs text-gray-500">Organizer: {s.organizerName}</p>}
                <div className="mt-1 flex items-center gap-3 text-xs">
                  <Link href={`/events/${s.slug}`} target="_blank" className="inline-flex items-center gap-0.5 text-indigo-600 hover:underline">
                    Preview <ExternalLink className="h-3 w-3" />
                  </Link>
                  <span className="text-gray-400">Submitted {new Date(s.createdAt).toLocaleString()}</span>
                </div>
              </div>
              {status === 'PENDING' && (
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => moderate(s.id, 'APPROVED')} disabled={!!moderating} className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50">
                    {moderating === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} Approve
                  </button>
                  <button onClick={() => moderate(s.id, 'REJECTED')} disabled={!!moderating} className="inline-flex items-center gap-1 rounded-lg border bg-white px-2.5 py-1 text-xs font-medium hover:bg-red-50 hover:text-red-700 disabled:opacity-50">
                    <XCircle className="h-3 w-3" /> Reject
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

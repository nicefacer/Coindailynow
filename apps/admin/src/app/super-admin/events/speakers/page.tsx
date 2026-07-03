'use client';

/**
 * /super-admin/events/speakers — speaker bureau.
 * Lists every EventSpeaker; toggle filters by bureau membership.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Loader2, AlertCircle, RefreshCw, Linkedin, Twitter, Star, Mic } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Speaker {
  id: string; name: string; title?: string; organization?: string;
  country?: string; photoUrl?: string; bio?: string;
  linkedinUrl?: string; twitterHandle?: string;
  isInBureau: boolean; bureauRate?: number;
  rating?: number; pastEvents: number;
}

export default function SpeakersPage() {
  const [bureauOnly, setBureauOnly] = useState(false);
  const [rows, setRows] = useState<Speaker[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const headers = useMemo<Record<string,string>>(() => {
    const t = getAccessToken();
    if (!t) return {} as Record<string,string>;
    return { Authorization: `Bearer ` + t };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const qs = bureauOnly ? '?bureauOnly=true' : '';
      const res = await fetch(`${API_URL}/api/v1/events/speakers${qs}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setRows(j.speakers || j.data || []);
      setError(null);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [bureauOnly, headers]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="p-6 space-y-4">
      <Link href="/super-admin" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600">
        <ChevronLeft className="h-4 w-4" /> Super Admin
      </Link>
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Mic className="h-5 w-5 text-indigo-600" /> Speakers</h1>
          <p className="text-sm text-gray-500">Speaker bureau across events. Toggle filter to bureau-only members.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={bureauOnly} onChange={e => setBureauOnly(e.target.checked)} /> Bureau only
          </label>
          <button onClick={refresh} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Refresh
          </button>
        </div>
      </header>

      {error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div>}

      <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows && rows.length === 0 && (
          <li className="col-span-full rounded-xl border bg-gray-50 p-6 text-center text-sm text-gray-500">
            No speakers yet. Add speakers via the events admin or import a CSV.
          </li>
        )}
        {rows?.map(s => (
          <li key={s.id} className="rounded-xl border bg-white p-4">
            <div className="flex items-start gap-3">
              {s.photoUrl ? (
                <img src={s.photoUrl} alt={s.name} className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <div className="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-semibold">
                  {s.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{s.name}</p>
                {s.title && <p className="text-xs text-gray-500 truncate">{s.title}</p>}
                {s.organization && <p className="text-xs text-gray-500 truncate">{s.organization}{s.country ? ` · ${s.country}` : ''}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {s.isInBureau && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-indigo-100 px-1.5 py-0.5 font-medium text-indigo-700">
                      <Star className="h-3 w-3" /> Bureau
                    </span>
                  )}
                  {typeof s.rating === 'number' && (
                    <span className="text-gray-500">★ {s.rating.toFixed(1)}</span>
                  )}
                  <span className="text-gray-400">{s.pastEvents} past events</span>
                  {s.bureauRate && <span className="text-gray-500">${s.bureauRate.toLocaleString()}/talk</span>}
                </div>
                <div className="mt-1 flex items-center gap-2 text-gray-400">
                  {s.linkedinUrl && <a href={s.linkedinUrl} target="_blank" rel="noopener noreferrer" className="hover:text-blue-700"><Linkedin className="h-3.5 w-3.5" /></a>}
                  {s.twitterHandle && <a href={`https://x.com/${s.twitterHandle.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" className="hover:text-blue-500"><Twitter className="h-3.5 w-3.5" /></a>}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

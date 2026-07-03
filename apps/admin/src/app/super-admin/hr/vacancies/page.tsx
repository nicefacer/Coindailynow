'use client';

/**
 * /super-admin/hr/vacancies — job vacancies list.
 * Lists JobVacancy rows; filters by status + department.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Loader2, AlertCircle, RefreshCw, Briefcase, MapPin, Users } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Vacancy {
  id: string; title: string; department: string;
  location?: string; locationType: string; employmentType: string;
  salaryMin?: number; salaryMax?: number; salaryCurrency?: string;
  status: string; publishedAt?: string; closingDate?: string;
  applicantCount: number; viewCount: number;
  createdAt: string;
}

const STATUS_TABS = ['ALL', 'OPEN', 'DRAFT', 'PAUSED', 'CLOSED', 'FILLED'] as const;

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-green-100 text-green-700',
  DRAFT: 'bg-gray-100 text-gray-700',
  PAUSED: 'bg-amber-100 text-amber-700',
  CLOSED: 'bg-red-100 text-red-700',
  FILLED: 'bg-indigo-100 text-indigo-700',
};

export default function VacanciesPage() {
  const [status, setStatus] = useState<typeof STATUS_TABS[number]>('OPEN');
  const [rows, setRows] = useState<Vacancy[] | null>(null);
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
      const qs = status === 'ALL' ? '' : `?status=${status}`;
      const res = await fetch(`${API_URL}/api/v1/hr/vacancies${qs}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setRows(j.vacancies || j.data || []);
      setError(null);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [status, headers]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="p-6 space-y-4">
      <Link href="/super-admin" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600">
        <ChevronLeft className="h-4 w-4" /> Super Admin
      </Link>
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Briefcase className="h-5 w-5 text-indigo-600" /> Vacancies</h1>
          <p className="text-sm text-gray-500">Open + closed job postings. Filter by status; create new from the HR ops tools.</p>
        </div>
        <button onClick={refresh} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Refresh
        </button>
      </header>

      <div className="flex items-center gap-1 rounded-lg border bg-white p-0.5 text-xs w-fit">
        {STATUS_TABS.map(s => (
          <button key={s} type="button" onClick={() => setStatus(s)} className={`rounded px-2.5 py-1 ${status === s ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>{s}</button>
        ))}
      </div>

      {error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div>}

      <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows && rows.length === 0 && (
          <li className="col-span-full rounded-xl border bg-gray-50 p-6 text-center text-sm text-gray-500">
            No {status === 'ALL' ? '' : status.toLowerCase() + ' '}vacancies yet.
          </li>
        )}
        {rows?.map(v => (
          <li key={v.id} className="rounded-xl border bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900">{v.title}</p>
                <p className="text-xs text-gray-500">{v.department} · {v.employmentType.replace(/_/g, ' ')}</p>
              </div>
              <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[v.status] || 'bg-gray-100 text-gray-700'}`}>{v.status}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-600">
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {v.locationType}{v.location ? ` · ${v.location}` : ''}</span>
              <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {v.applicantCount} applicants</span>
              <span>{v.viewCount.toLocaleString()} views</span>
              {(v.salaryMin || v.salaryMax) && (
                <span>{v.salaryCurrency || 'USD'} {v.salaryMin?.toLocaleString() ?? '?'}-{v.salaryMax?.toLocaleString() ?? '?'}</span>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
              <span>Created {new Date(v.createdAt).toLocaleDateString()}</span>
              {v.closingDate && <span>Closes {new Date(v.closingDate).toLocaleDateString()}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

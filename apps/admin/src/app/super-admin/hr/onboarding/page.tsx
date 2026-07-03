'use client';

/**
 * /super-admin/hr/onboarding — new-hire onboarding tracker.
 * Lists StaffOnboarding rows with checklist/documents/access progress.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Loader2, AlertCircle, RefreshCw, UserPlus, CheckCircle2, Circle } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface OnboardingRow {
  id: string; userId: string; applicationId?: string;
  status: string;
  startDate?: string; completedDate?: string;
  checklist?: string;
  documentsUploaded?: string;
  systemAccess?: string;
  trainingModules?: string;
  buddyId?: string; buddyAssignedAt?: string;
  createdAt: string;
}

const STATUS_TABS = ['ALL', 'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] as const;

const STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: 'bg-gray-100 text-gray-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
};

function parseJson<T = any>(s?: string): T | null {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function checklistProgress(s?: string): { done: number; total: number } {
  const arr = parseJson<any[]>(s);
  if (!Array.isArray(arr) || arr.length === 0) return { done: 0, total: 0 };
  const done = arr.filter(i => i.completed || i.done || i.status === 'COMPLETED').length;
  return { done, total: arr.length };
}

function docsCount(s?: string): { done: number; total: number } {
  const obj = parseJson<Record<string, boolean>>(s);
  if (!obj) return { done: 0, total: 0 };
  const keys = Object.keys(obj);
  return { done: keys.filter(k => obj[k]).length, total: keys.length };
}

export default function OnboardingPage() {
  const [status, setStatus] = useState<typeof STATUS_TABS[number]>('ALL');
  const [rows, setRows] = useState<OnboardingRow[] | null>(null);
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
      const res = await fetch(`${API_URL}/api/v1/hr/onboarding${qs}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setRows(j.onboarding || []);
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
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><UserPlus className="h-5 w-5 text-indigo-600" /> Onboarding</h1>
          <p className="text-sm text-gray-500">New-hire onboarding tracker — checklist, documents, system access, training, 30/60/90 reviews.</p>
        </div>
        <button onClick={refresh} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Refresh
        </button>
      </header>

      <div className="flex items-center gap-1 rounded-lg border bg-white p-0.5 text-xs w-fit">
        {STATUS_TABS.map(s => (
          <button key={s} type="button" onClick={() => setStatus(s)} className={`rounded px-2.5 py-1 ${status === s ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>{s.replace(/_/g, ' ')}</button>
        ))}
      </div>

      {error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div>}

      <ul className="divide-y rounded-xl border bg-white">
        {rows && rows.length === 0 && (
          <li className="p-6 text-center text-sm text-gray-500">No onboarding records. Create one by moving an application to HIRED — the system auto-spawns the checklist.</li>
        )}
        {rows?.map(r => {
          const checklist = checklistProgress(r.checklist);
          const docs = docsCount(r.documentsUploaded);
          const access = docsCount(r.systemAccess);
          const training = checklistProgress(r.trainingModules);
          return (
            <li key={r.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900">User {r.userId.slice(0, 8)}…</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[r.status] || 'bg-gray-100'}`}>{r.status.replace(/_/g, ' ')}</span>
                    {r.buddyId && <span className="text-xs text-gray-500">Buddy: {r.buddyId.slice(0, 8)}…</span>}
                  </div>
                  <div className="mt-1 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <ProgressPill label="Checklist" done={checklist.done} total={checklist.total} />
                    <ProgressPill label="Documents" done={docs.done} total={docs.total} />
                    <ProgressPill label="Access" done={access.done} total={access.total} />
                    <ProgressPill label="Training" done={training.done} total={training.total} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    {r.startDate && <span>Started {new Date(r.startDate).toLocaleDateString()}</span>}
                    {r.completedDate && <span>Completed {new Date(r.completedDate).toLocaleDateString()}</span>}
                    <span>Created {new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ProgressPill({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const colored = total > 0 && done === total;
  return (
    <div className="rounded-lg border bg-white px-2 py-1">
      <div className="flex items-center gap-1">
        {colored ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <Circle className="h-3 w-3 text-gray-300" />}
        <span className="text-gray-700 font-medium">{label}</span>
      </div>
      <div className="mt-1 flex items-center gap-1">
        <div className="h-1 flex-1 rounded bg-gray-100 overflow-hidden">
          <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[10px] text-gray-500">{done}/{total}</span>
      </div>
    </div>
  );
}

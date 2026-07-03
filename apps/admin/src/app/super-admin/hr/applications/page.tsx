'use client';

/**
 * /super-admin/hr/applications — candidate applications pipeline.
 * Lists JobApplication rows by stage; inline action to advance stage.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Loader2, AlertCircle, RefreshCw, ArrowRight, ExternalLink, Sparkles } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Application {
  id: string; vacancyId: string;
  candidateName: string; candidateEmail: string; country?: string;
  resumeUrl?: string; linkedinUrl?: string;
  stage: string;
  aiScore?: number; skillMatch?: number; experienceMatch?: number; cultureMatch?: number;
  interviewDate?: string;
  createdAt: string;
  vacancy?: { title: string; department: string };
}

const STAGES = ['APPLIED', 'SCREENING', 'AI_SCORED', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'] as const;

const STAGE_COLORS: Record<string, string> = {
  APPLIED: 'bg-gray-100 text-gray-700',
  SCREENING: 'bg-blue-100 text-blue-700',
  AI_SCORED: 'bg-purple-100 text-purple-700',
  INTERVIEW: 'bg-amber-100 text-amber-700',
  OFFER: 'bg-indigo-100 text-indigo-700',
  HIRED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

export default function ApplicationsPage() {
  const [stage, setStage] = useState<string>('ALL');
  const [rows, setRows] = useState<Application[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const headers = useMemo<Record<string,string>>(() => {
    const t = getAccessToken();
    if (!t) return {} as Record<string,string>;
    return { Authorization: `Bearer ` + t };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const qs = stage === 'ALL' ? '' : `?stage=${stage}`;
      const res = await fetch(`${API_URL}/api/v1/hr/applications${qs}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setRows(j.applications || []);
      setError(null);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [stage, headers]);

  useEffect(() => { refresh(); }, [refresh]);

  const advance = async (a: Application) => {
    const i = STAGES.indexOf(a.stage as any);
    if (i < 0 || i >= STAGES.length - 2) return;
    const next = STAGES[i + 1];
    setBusy(a.id);
    try {
      const res = await fetch(`${API_URL}/api/v1/hr/applications/${a.id}/stage`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: next, notes: `Advanced via admin UI` }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refresh();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(null); }
  };

  const score = async (a: Application) => {
    setBusy(a.id);
    try {
      const res = await fetch(`${API_URL}/api/v1/hr/applications/${a.id}/score`, { method: 'POST', headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refresh();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(null); }
  };

  return (
    <div className="p-6 space-y-4">
      <Link href="/super-admin" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600">
        <ChevronLeft className="h-4 w-4" /> Super Admin
      </Link>
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Applications</h1>
          <p className="text-sm text-gray-500">Candidate pipeline. Click → to advance stage; ✨ to run AI scoring.</p>
        </div>
        <button onClick={refresh} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Refresh
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-white p-0.5 text-xs">
        {(['ALL', ...STAGES] as const).map(s => (
          <button key={s} type="button" onClick={() => setStage(s)} className={`rounded px-2.5 py-1 ${stage === s ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>{s}</button>
        ))}
      </div>

      {error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div>}

      <ul className="divide-y rounded-xl border bg-white">
        {rows && rows.length === 0 && (
          <li className="p-6 text-center text-sm text-gray-500">No applications in this stage.</li>
        )}
        {rows?.map(a => (
          <li key={a.id} className="px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-gray-900">{a.candidateName}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STAGE_COLORS[a.stage] || 'bg-gray-100'}`}>{a.stage}</span>
                  {typeof a.aiScore === 'number' && (
                    <span className="text-xs text-gray-500">AI {a.aiScore.toFixed(0)}/100</span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span>{a.candidateEmail}</span>
                  {a.country && <span>· {a.country}</span>}
                  <span>· {a.vacancy?.title || `Vacancy ${a.vacancyId.slice(0, 8)}`}</span>
                  {a.vacancy?.department && <span>· {a.vacancy.department}</span>}
                  <span>· applied {new Date(a.createdAt).toLocaleDateString()}</span>
                  {a.interviewDate && <span>· interview {new Date(a.interviewDate).toLocaleString()}</span>}
                </div>
                {(a.skillMatch || a.experienceMatch || a.cultureMatch) && (
                  <div className="mt-1 flex gap-3 text-xs text-gray-500">
                    {typeof a.skillMatch === 'number' && <span>Skill {Math.round(a.skillMatch)}%</span>}
                    {typeof a.experienceMatch === 'number' && <span>Experience {Math.round(a.experienceMatch)}%</span>}
                    {typeof a.cultureMatch === 'number' && <span>Culture {Math.round(a.cultureMatch)}%</span>}
                  </div>
                )}
                <div className="mt-1 flex items-center gap-3 text-xs">
                  {a.resumeUrl && <a href={a.resumeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-indigo-600 hover:underline">Resume <ExternalLink className="h-3 w-3" /></a>}
                  {a.linkedinUrl && <a href={a.linkedinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-indigo-600 hover:underline">LinkedIn <ExternalLink className="h-3 w-3" /></a>}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                {typeof a.aiScore !== 'number' && a.stage !== 'HIRED' && a.stage !== 'REJECTED' && (
                  <button onClick={() => score(a)} disabled={!!busy} className="inline-flex items-center gap-1 rounded border bg-white px-2 py-1 text-xs hover:bg-purple-50 hover:text-purple-700 disabled:opacity-50" title="Run AI scoring">
                    {busy === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  </button>
                )}
                {STAGES.indexOf(a.stage as any) < STAGES.length - 2 && (
                  <button onClick={() => advance(a)} disabled={!!busy} className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-700 disabled:opacity-50" title="Advance to next stage">
                    {busy === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

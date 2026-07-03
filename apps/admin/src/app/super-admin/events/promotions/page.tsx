'use client';

/**
 * /super-admin/events/promotions — paid event promotions.
 * Lists every EventPromotion (CP-paid placements) with cost + delivery metrics.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Loader2, AlertCircle, RefreshCw, Filter, MousePointerClick, Eye, Megaphone } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Promotion {
  id: string; eventId: string;
  promotionType: string; cpCost: number; status: string;
  deliverables?: string;
  startDate?: string; endDate?: string;
  impressions: number; clicks: number;
  createdAt: string;
  event?: { id: string; title: string; slug: string; startDate?: string; country?: string };
}

const STATUS_TABS = ['ALL', 'PENDING', 'ACTIVE', 'COMPLETED'] as const;

const TYPE_COLORS: Record<string, string> = {
  FEATURED_LISTING: 'bg-indigo-100 text-indigo-700',
  ARTICLE: 'bg-blue-100 text-blue-700',
  NEWSLETTER: 'bg-purple-100 text-purple-700',
  SOCIAL: 'bg-pink-100 text-pink-700',
  WHATSAPP: 'bg-green-100 text-green-700',
  FULL_BUNDLE: 'bg-amber-100 text-amber-700',
};

export default function PromotionsPage() {
  const [statusFilter, setStatusFilter] = useState<typeof STATUS_TABS[number]>('ALL');
  const [rows, setRows] = useState<Promotion[] | null>(null);
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
      const qs = statusFilter === 'ALL' ? '' : `?status=${statusFilter}`;
      const res = await fetch(`${API_URL}/api/v1/events/promotions/list${qs}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setRows(j.promotions || []);
      setError(null);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [statusFilter, headers]);

  useEffect(() => { refresh(); }, [refresh]);

  const totalSpend = (rows || []).reduce((s, p) => s + (p.cpCost || 0), 0);
  const totalImpressions = (rows || []).reduce((s, p) => s + (p.impressions || 0), 0);
  const totalClicks = (rows || []).reduce((s, p) => s + (p.clicks || 0), 0);
  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  return (
    <div className="p-6 space-y-4">
      <Link href="/super-admin" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600">
        <ChevronLeft className="h-4 w-4" /> Super Admin
      </Link>
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Megaphone className="h-5 w-5 text-indigo-600" /> Event promotions</h1>
          <p className="text-sm text-gray-500">CP-paid placements across featured listings, articles, newsletter, social, WhatsApp.</p>
        </div>
        <button onClick={refresh} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Refresh
        </button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-white p-4"><p className="text-2xl font-bold text-indigo-600">{rows?.length ?? '—'}</p><p className="text-xs text-gray-500">Promotions</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-2xl font-bold text-amber-600">{totalSpend.toLocaleString()} CP</p><p className="text-xs text-gray-500">Total spend</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-2xl font-bold text-blue-600">{totalImpressions.toLocaleString()}</p><p className="text-xs text-gray-500">Impressions</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-2xl font-bold text-green-600">{ctr.toFixed(2)}%</p><p className="text-xs text-gray-500">CTR ({totalClicks.toLocaleString()} clicks)</p></div>
      </div>

      <div className="flex items-center gap-1 rounded-lg border bg-white p-0.5 text-xs w-fit">
        <Filter className="h-3 w-3 text-gray-400 ml-2" />
        {STATUS_TABS.map(s => (
          <button key={s} type="button" onClick={() => setStatusFilter(s)} className={`rounded px-2.5 py-1 ${statusFilter === s ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>{s}</button>
        ))}
      </div>

      {error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div>}

      <ul className="divide-y rounded-xl border bg-white">
        {rows && rows.length === 0 && (
          <li className="p-6 text-center text-sm text-gray-500">No promotions yet. Event organizers purchase promotions from the public events portal.</li>
        )}
        {rows?.map(p => (
          <li key={p.id} className="px-4 py-3">
            <div className="flex items-start gap-3">
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${TYPE_COLORS[p.promotionType] || 'bg-gray-100 text-gray-700'}`}>{p.promotionType.replace(/_/g, ' ')}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900">{p.event?.title || `Event ${p.eventId.slice(0, 8)}`}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  {p.event?.country && <span>{p.event.country}</span>}
                  {p.event?.startDate && <span>· starts {new Date(p.event.startDate).toLocaleDateString()}</span>}
                  {p.startDate && <span>· promo {new Date(p.startDate).toLocaleDateString()}{p.endDate ? `→${new Date(p.endDate).toLocaleDateString()}` : ''}</span>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-600">
                  <span className="font-mono">{p.cpCost.toLocaleString()} CP</span>
                  <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> {p.impressions.toLocaleString()}</span>
                  <span className="inline-flex items-center gap-1"><MousePointerClick className="h-3 w-3" /> {p.clicks.toLocaleString()}</span>
                </div>
              </div>
              <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium ${p.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : p.status === 'PENDING' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'}`}>
                {p.status}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

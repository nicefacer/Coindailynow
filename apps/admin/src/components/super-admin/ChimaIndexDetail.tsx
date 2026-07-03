'use client';

/**
 * ChimaIndexDetail — shared view for any Chima Index symbol (ADAI/CRI/EMAI/RRS).
 *
 * Fetches /api/v1/chima-index/:symbol + /history, renders current value,
 * 24h/7d/30d changes, country components, and a sparkline-ish history list.
 * Loads data on mount; recalculate button POSTs to /:symbol/calculate.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, RefreshCw, Loader2, AlertCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface ChimaIndexDetailProps {
  symbol: 'ADAI' | 'CRI' | 'EMAI' | 'RRS';
  name: string;
  blurb: string;
}

interface IndexData {
  id: string;
  name: string;
  symbol: string;
  indexType: string;
  description?: string;
  methodology?: string;
  currentValue: number;
  previousValue: number;
  change24h: number;
  changePercent24h: number;
  change7d: number;
  change30d: number;
  allTimeHigh: number;
  allTimeLow: number;
  athDate?: string;
  atlDate?: string;
  components?: string; // JSON string
  isPublished: boolean;
  updateFrequency: string;
  lastCalculated?: string;
  lastPublished?: string;
}

interface HistoryPoint { timestamp: string; value: number; }

function trendIcon(d: number) {
  if (d > 0) return <TrendingUp className="h-4 w-4 text-green-600" />;
  if (d < 0) return <TrendingDown className="h-4 w-4 text-red-600" />;
  return <Minus className="h-4 w-4 text-gray-400" />;
}

function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export default function ChimaIndexDetail({ symbol, name, blurb }: ChimaIndexDetailProps) {
  const [data, setData] = useState<IndexData | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  const headers = useMemo<Record<string,string>>(() => {
    const t = getAccessToken();
    if (!t) return {} as Record<string,string>;
    return { Authorization: `Bearer ` + t };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [indexRes, histRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/chima-index/${symbol}`, { headers }),
        fetch(`${API_URL}/api/v1/chima-index/${symbol}/history?days=30`, { headers }),
      ]);
      if (indexRes.ok) {
        const j = await indexRes.json();
        setData(j.data ?? j.index ?? j);
      } else if (indexRes.status === 404) {
        setData(null);
        setError(`Index ${symbol} has not been initialized. Click "Initialize indexes" to seed.`);
      } else {
        throw new Error(`HTTP ${indexRes.status}`);
      }
      if (histRes.ok) {
        const j = await histRes.json();
        const pts: HistoryPoint[] = Array.isArray(j) ? j : (j.history ?? j.data ?? []);
        setHistory(pts.map((p: any) => ({ timestamp: p.timestamp, value: Number(p.value) })));
      }
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [symbol, headers]);

  useEffect(() => { refresh(); }, [refresh]);

  const recalculate = async () => {
    setRecalculating(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/chima-index/${symbol}/calculate`, {
        method: 'POST',
        headers,
      });
      if (!res.ok) throw new Error(`Recalculate failed (${res.status})`);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRecalculating(false);
    }
  };

  const initializeIndexes = async () => {
    setRecalculating(true);
    try {
      await fetch(`${API_URL}/api/v1/chima-index/initialize`, { method: 'POST', headers });
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRecalculating(false);
    }
  };

  const components = useMemo(() => {
    if (!data?.components) return [];
    try {
      const parsed = JSON.parse(data.components);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }, [data?.components]);

  return (
    <div className="p-6 space-y-6">
      <Link href="/super-admin" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600">
        <ChevronLeft className="h-4 w-4" /> Super Admin
      </Link>

      <header className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">{data?.indexType || 'Chima Index'}</div>
          <h1 className="text-2xl font-bold text-gray-900">{name} <span className="text-base font-mono text-gray-400">({symbol})</span></h1>
          <p className="text-sm text-gray-500 max-w-2xl">{data?.description || blurb}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {!data && !loading && (
            <button onClick={initializeIndexes} disabled={recalculating} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              Initialize indexes
            </button>
          )}
          {data && (
            <button onClick={recalculate} disabled={recalculating} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
              {recalculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Recalculate
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center gap-2 p-3 text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border bg-white p-5">
              <p className="text-xs uppercase tracking-wide text-gray-500">Current value</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{fmt(data.currentValue)}</p>
              <p className="mt-1 text-xs text-gray-500">Last calculated: {data.lastCalculated ? new Date(data.lastCalculated).toLocaleString() : '—'}</p>
            </div>
            {([['24h', data.changePercent24h, data.change24h], ['7d', null, data.change7d], ['30d', null, data.change30d]] as const).map(([label, pct, abs]) => (
              <div key={label} className="rounded-xl border bg-white p-5">
                <p className="text-xs uppercase tracking-wide text-gray-500">{label} change</p>
                <p className="mt-1 inline-flex items-center gap-1 text-2xl font-bold">
                  {trendIcon(abs ?? 0)}
                  <span className={(abs ?? 0) > 0 ? 'text-green-700' : (abs ?? 0) < 0 ? 'text-red-700' : 'text-gray-700'}>
                    {fmt(abs ?? 0)}
                  </span>
                </p>
                {typeof pct === 'number' && <p className="text-xs text-gray-500">{fmt(pct)}%</p>}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="rounded-xl border bg-white p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Country components</h3>
              {components.length === 0 ? (
                <p className="text-xs text-gray-500">No component breakdown yet. Run recalculate to populate.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-gray-500">
                    <tr><th className="text-left py-1">Country</th><th className="text-right">Value</th><th className="text-right">Weight</th><th className="text-right">Δ</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {components.map((c: any, i: number) => (
                      <tr key={i}>
                        <td className="py-2 font-medium text-gray-800">{c.country || c.name || '—'}</td>
                        <td className="py-2 text-right font-mono text-gray-700">{fmt(Number(c.value) || 0)}</td>
                        <td className="py-2 text-right text-gray-500">{c.weight ? `${fmt(Number(c.weight) * 100, 1)}%` : '—'}</td>
                        <td className="py-2 text-right inline-flex items-center gap-1 justify-end">
                          {trendIcon(Number(c.change) || 0)} {fmt(Number(c.change) || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="rounded-xl border bg-white p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">30-day history</h3>
              {history.length === 0 ? (
                <p className="text-xs text-gray-500">No history yet. Recalculate seeds the next point.</p>
              ) : (
                <div>
                  <Sparkline points={history.map(p => p.value)} ath={data.allTimeHigh} atl={data.allTimeLow} />
                  <table className="mt-3 w-full text-xs">
                    <thead className="text-gray-500"><tr><th className="text-left py-1">Date</th><th className="text-right">Value</th></tr></thead>
                    <tbody className="divide-y">
                      {history.slice(-10).reverse().map((p, i) => (
                        <tr key={i}>
                          <td className="py-1 text-gray-600">{new Date(p.timestamp).toLocaleDateString()}</td>
                          <td className="py-1 text-right font-mono text-gray-700">{fmt(p.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-3 flex gap-4 text-xs text-gray-500">
                <span>ATH {fmt(data.allTimeHigh)} {data.athDate && `· ${new Date(data.athDate).toLocaleDateString()}`}</span>
                <span>ATL {fmt(data.allTimeLow)} {data.atlDate && `· ${new Date(data.atlDate).toLocaleDateString()}`}</span>
              </div>
            </section>
          </div>

          {data.methodology && (
            <section className="rounded-xl border bg-white p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Methodology</h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{data.methodology}</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Sparkline({ points, ath, atl }: { points: number[]; ath: number; atl: number }) {
  if (!points.length) return null;
  const min = Math.min(...points, atl || Infinity);
  const max = Math.max(...points, ath || -Infinity);
  const range = max - min || 1;
  const w = 480;
  const h = 80;
  const stepX = points.length > 1 ? w / (points.length - 1) : 0;
  const path = points.map((v, i) => {
    const x = i * stepX;
    const y = h - ((v - min) / range) * h;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20 overflow-visible">
      <path d={path} fill="none" stroke="rgb(79, 70, 229)" strokeWidth={2} />
    </svg>
  );
}

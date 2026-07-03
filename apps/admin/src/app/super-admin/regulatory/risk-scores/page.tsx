'use client';

/**
 * /super-admin/regulatory/risk-scores — Risk Scores
 *
 * Replaces the broken `${dir}` redirect stub. Per-country regulatory risk
 * scoring (0-100) across five factors, with the rolling 90-day trend.
 * Mock data today; wire to backend regulatory.scores when available.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { BarChart3, ChevronLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface RiskScoreRow {
  code: string;
  name: string;
  region: string;
  score: number;          // 0-100, higher = friendlier
  trend30d: number;       // signed delta
  factors: {
    licensingClarity: number;
    aml: number;
    consumerProtection: number;
    taxClarity: number;
    enforcement: number;
  };
}

const mockScores: RiskScoreRow[] = [
  { code: 'AE', name: 'UAE', region: 'MIDDLE_EAST', score: 92, trend30d: +2, factors: { licensingClarity: 95, aml: 90, consumerProtection: 92, taxClarity: 88, enforcement: 95 } },
  { code: 'SG', name: 'Singapore', region: 'ASIA_PACIFIC', score: 90, trend30d: +1, factors: { licensingClarity: 92, aml: 94, consumerProtection: 88, taxClarity: 90, enforcement: 86 } },
  { code: 'SV', name: 'El Salvador', region: 'LATIN_AMERICA', score: 90, trend30d: 0, factors: { licensingClarity: 100, aml: 80, consumerProtection: 78, taxClarity: 95, enforcement: 80 } },
  { code: 'KY', name: 'Cayman Islands', region: 'CARIBBEAN', score: 85, trend30d: -1, factors: { licensingClarity: 90, aml: 85, consumerProtection: 80, taxClarity: 92, enforcement: 78 } },
  { code: 'ZA', name: 'South Africa', region: 'SOUTHERN_AFRICA', score: 78, trend30d: +5, factors: { licensingClarity: 80, aml: 82, consumerProtection: 76, taxClarity: 70, enforcement: 82 } },
  { code: 'BR', name: 'Brazil', region: 'LATIN_AMERICA', score: 75, trend30d: +3, factors: { licensingClarity: 78, aml: 80, consumerProtection: 70, taxClarity: 75, enforcement: 72 } },
  { code: 'BS', name: 'Bahamas', region: 'CARIBBEAN', score: 72, trend30d: -2, factors: { licensingClarity: 75, aml: 70, consumerProtection: 68, taxClarity: 75, enforcement: 72 } },
  { code: 'MX', name: 'Mexico', region: 'LATIN_AMERICA', score: 70, trend30d: +1, factors: { licensingClarity: 72, aml: 75, consumerProtection: 68, taxClarity: 70, enforcement: 65 } },
  { code: 'KE', name: 'Kenya', region: 'EAST_AFRICA', score: 68, trend30d: +8, factors: { licensingClarity: 72, aml: 70, consumerProtection: 65, taxClarity: 60, enforcement: 75 } },
  { code: 'NG', name: 'Nigeria', region: 'WEST_AFRICA', score: 62, trend30d: +4, factors: { licensingClarity: 65, aml: 60, consumerProtection: 58, taxClarity: 60, enforcement: 68 } },
  { code: 'GH', name: 'Ghana', region: 'WEST_AFRICA', score: 55, trend30d: -2, factors: { licensingClarity: 55, aml: 60, consumerProtection: 50, taxClarity: 48, enforcement: 62 } },
  { code: 'JM', name: 'Jamaica', region: 'CARIBBEAN', score: 55, trend30d: +6, factors: { licensingClarity: 60, aml: 55, consumerProtection: 50, taxClarity: 50, enforcement: 60 } },
  { code: 'AR', name: 'Argentina', region: 'LATIN_AMERICA', score: 52, trend30d: -4, factors: { licensingClarity: 48, aml: 55, consumerProtection: 50, taxClarity: 55, enforcement: 52 } },
  { code: 'EG', name: 'Egypt', region: 'NORTH_AFRICA', score: 30, trend30d: -1, factors: { licensingClarity: 25, aml: 35, consumerProtection: 30, taxClarity: 28, enforcement: 32 } },
  { code: 'ET', name: 'Ethiopia', region: 'EAST_AFRICA', score: 25, trend30d: 0, factors: { licensingClarity: 20, aml: 25, consumerProtection: 25, taxClarity: 25, enforcement: 30 } },
];

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-700';
  if (score >= 60) return 'text-blue-700';
  if (score >= 40) return 'text-amber-700';
  return 'text-red-700';
}

function trendIcon(d: number) {
  if (d > 0) return <TrendingUp className="h-4 w-4 text-green-600" />;
  if (d < 0) return <TrendingDown className="h-4 w-4 text-red-600" />;
  return <Minus className="h-4 w-4 text-gray-400" />;
}

export default function RiskScoresPage() {
  const [regionFilter, setRegionFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'score' | 'trend' | 'name'>('score');

  let rows = regionFilter === 'ALL' ? mockScores : mockScores.filter(s => s.region === regionFilter);
  rows = [...rows].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'trend') return b.trend30d - a.trend30d;
    return b.score - a.score;
  });

  const avg = Math.round(mockScores.reduce((s, x) => s + x.score, 0) / mockScores.length);
  const improving = mockScores.filter(s => s.trend30d > 0).length;
  const declining = mockScores.filter(s => s.trend30d < 0).length;

  return (
    <div className="p-6 space-y-6">
      <Link href="/super-admin/regulatory" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600">
        <ChevronLeft className="h-4 w-4" /> Regulatory Intelligence HQ
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-indigo-600" /> Risk Scores
        </h1>
        <p className="text-sm text-gray-500">
          Composite 0-100 score per country across five regulatory factors. Higher = friendlier.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-white p-4"><p className={`text-2xl font-bold ${scoreColor(avg)}`}>{avg}</p><p className="text-xs text-gray-500">Average score</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-2xl font-bold text-green-600">+{improving}</p><p className="text-xs text-gray-500">Improving (30d)</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-2xl font-bold text-red-600">-{declining}</p><p className="text-xs text-gray-500">Declining (30d)</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-2xl font-bold text-blue-600">{mockScores.filter(s => s.score >= 80).length}</p><p className="text-xs text-gray-500">High-friendliness (≥80)</p></div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-gray-700">Region:</span>
        {['ALL', 'WEST_AFRICA', 'EAST_AFRICA', 'SOUTHERN_AFRICA', 'NORTH_AFRICA', 'CARIBBEAN', 'LATIN_AMERICA', 'MIDDLE_EAST', 'ASIA_PACIFIC'].map(r => (
          <button
            key={r}
            type="button"
            onClick={() => setRegionFilter(r)}
            className={`rounded px-2 py-1 ${regionFilter === r ? 'bg-indigo-600 text-white' : 'bg-white border text-gray-700 hover:bg-gray-50'}`}
          >
            {r}
          </button>
        ))}
        <span className="ml-3 font-medium text-gray-700">Sort:</span>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="rounded border bg-white px-2 py-1">
          <option value="score">Score (highest)</option>
          <option value="trend">Trend (improving)</option>
          <option value="name">Name (A-Z)</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">Country</th>
              <th className="px-4 py-2 text-right">Score</th>
              <th className="px-4 py-2 text-right">30d Δ</th>
              <th className="px-4 py-2 text-right">Licensing</th>
              <th className="px-4 py-2 text-right">AML</th>
              <th className="px-4 py-2 text-right">Consumer</th>
              <th className="px-4 py-2 text-right">Tax</th>
              <th className="px-4 py-2 text-right">Enforce</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map(r => (
              <tr key={r.code} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">
                  <span className="font-mono text-xs rounded bg-gray-100 px-1.5 py-0.5">{r.code}</span>{' '}
                  {r.name}
                  <div className="text-xs text-gray-400">{r.region.replace(/_/g, ' ')}</div>
                </td>
                <td className={`px-4 py-2 text-right font-bold ${scoreColor(r.score)}`}>{r.score}</td>
                <td className="px-4 py-2 text-right">
                  <span className="inline-flex items-center gap-1">
                    {trendIcon(r.trend30d)}
                    <span className={r.trend30d > 0 ? 'text-green-700' : r.trend30d < 0 ? 'text-red-700' : 'text-gray-400'}>
                      {r.trend30d > 0 ? `+${r.trend30d}` : r.trend30d}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-2 text-right text-gray-600">{r.factors.licensingClarity}</td>
                <td className="px-4 py-2 text-right text-gray-600">{r.factors.aml}</td>
                <td className="px-4 py-2 text-right text-gray-600">{r.factors.consumerProtection}</td>
                <td className="px-4 py-2 text-right text-gray-600">{r.factors.taxClarity}</td>
                <td className="px-4 py-2 text-right text-gray-600">{r.factors.enforcement}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        Mock data — wire to <code>regulatory_scores</code> table once the scoring worker lands.
      </p>
    </div>
  );
}

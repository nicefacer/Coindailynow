'use client';

/**
 * /super-admin/regulatory/changes — Change Detection
 *
 * Replaces the broken `${dir}` redirect stub. Surfaces material regulatory
 * changes detected across the 40-country database, with severity + source.
 * Mock data today; wire to backend regulatory.changes table when available.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronLeft, ExternalLink, Filter } from 'lucide-react';

interface RegulatoryChange {
  id: string;
  country: string;
  region: string;
  title: string;
  summary: string;
  severity: 'MATERIAL' | 'NOTABLE' | 'MINOR';
  category: 'TAX' | 'LICENSING' | 'AML' | 'EXCHANGE' | 'STABLECOIN' | 'CBDC' | 'CONSUMER_PROT';
  detectedAt: string;
  sourceUrl: string;
  sourceName: string;
  status: 'NEW' | 'REVIEWED' | 'PUBLISHED';
}

const mockChanges: RegulatoryChange[] = [
  {
    id: 'c1', country: 'NG', region: 'WEST_AFRICA',
    title: 'CBN issues guidelines for stablecoin issuers',
    summary: 'Central Bank of Nigeria releases draft guidelines requiring naira-backed stablecoin issuers to maintain 1:1 reserves with quarterly attestation.',
    severity: 'MATERIAL', category: 'STABLECOIN',
    detectedAt: '2026-06-23T08:14:00Z',
    sourceUrl: 'https://www.cbn.gov.ng/news/',
    sourceName: 'CBN Nigeria', status: 'NEW',
  },
  {
    id: 'c2', country: 'KE', region: 'EAST_AFRICA',
    title: 'CMA finalizes VASP licensing framework',
    summary: 'Capital Markets Authority publishes final rules for Virtual Asset Service Providers; minimum capital requirement set at KES 5M.',
    severity: 'MATERIAL', category: 'LICENSING',
    detectedAt: '2026-06-22T14:30:00Z',
    sourceUrl: 'https://www.cma.or.ke/',
    sourceName: 'Kenya CMA', status: 'REVIEWED',
  },
  {
    id: 'c3', country: 'BR', region: 'LATIN_AMERICA',
    title: 'Banco Central do Brasil updates AML thresholds for crypto',
    summary: 'BCB raises mandatory KYC threshold from R$30k to R$50k per month for exchanges, effective Q3 2026.',
    severity: 'NOTABLE', category: 'AML',
    detectedAt: '2026-06-21T11:00:00Z',
    sourceUrl: 'https://www.bcb.gov.br/',
    sourceName: 'Banco Central do Brasil', status: 'PUBLISHED',
  },
  {
    id: 'c4', country: 'ZA', region: 'SOUTHERN_AFRICA',
    title: 'FSCA proposes new crypto-asset tax reporting',
    summary: 'South African FSCA proposes annual reporting requirements for crypto holdings exceeding R100k; consultation open 60 days.',
    severity: 'NOTABLE', category: 'TAX',
    detectedAt: '2026-06-20T09:45:00Z',
    sourceUrl: 'https://www.fsca.co.za/',
    sourceName: 'SA FSCA', status: 'NEW',
  },
  {
    id: 'c5', country: 'JM', region: 'CARIBBEAN',
    title: 'BoJ launches CBDC retail pilot phase 2',
    summary: 'Bank of Jamaica expands JAM-DEX retail pilot to all 14 parishes; daily transaction cap raised to J$100k.',
    severity: 'MATERIAL', category: 'CBDC',
    detectedAt: '2026-06-19T16:20:00Z',
    sourceUrl: 'https://boj.org.jm/',
    sourceName: 'Bank of Jamaica', status: 'PUBLISHED',
  },
];

const SEVERITY_STYLES: Record<RegulatoryChange['severity'], string> = {
  MATERIAL: 'bg-red-100 text-red-700 border-red-200',
  NOTABLE: 'bg-amber-100 text-amber-700 border-amber-200',
  MINOR: 'bg-gray-100 text-gray-600 border-gray-200',
};

const STATUS_STYLES: Record<RegulatoryChange['status'], string> = {
  NEW: 'bg-indigo-50 text-indigo-700',
  REVIEWED: 'bg-blue-50 text-blue-700',
  PUBLISHED: 'bg-green-50 text-green-700',
};

export default function ChangeDetectionPage() {
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'MATERIAL' | 'NOTABLE' | 'MINOR'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'NEW' | 'REVIEWED' | 'PUBLISHED'>('ALL');

  const filtered = mockChanges.filter(c =>
    (severityFilter === 'ALL' || c.severity === severityFilter) &&
    (statusFilter === 'ALL' || c.status === statusFilter),
  );

  return (
    <div className="p-6 space-y-6">
      <Link href="/super-admin/regulatory" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600">
        <ChevronLeft className="h-4 w-4" /> Regulatory Intelligence HQ
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-amber-500" /> Change Detection
          </h1>
          <p className="text-sm text-gray-500">
            Material regulatory changes detected across the 40-country database.
            Severity scoring + categorisation feed the daily Regulatory Brief.
          </p>
        </div>
        <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Run scan now
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Material (7d)', value: mockChanges.filter(c => c.severity === 'MATERIAL').length, color: 'text-red-600' },
          { label: 'Notable (7d)', value: mockChanges.filter(c => c.severity === 'NOTABLE').length, color: 'text-amber-600' },
          { label: 'Awaiting review', value: mockChanges.filter(c => c.status === 'NEW').length, color: 'text-indigo-600' },
          { label: 'Published this week', value: mockChanges.filter(c => c.status === 'PUBLISHED').length, color: 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border bg-white p-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Filter className="h-3 w-3 text-gray-400" />
        <span className="font-medium text-gray-700">Severity:</span>
        {(['ALL', 'MATERIAL', 'NOTABLE', 'MINOR'] as const).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setSeverityFilter(s)}
            className={`rounded px-2.5 py-1 ${severityFilter === s ? 'bg-indigo-600 text-white' : 'bg-white border text-gray-700 hover:bg-gray-50'}`}
          >
            {s}
          </button>
        ))}
        <span className="font-medium text-gray-700 ml-3">Status:</span>
        {(['ALL', 'NEW', 'REVIEWED', 'PUBLISHED'] as const).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded px-2.5 py-1 ${statusFilter === s ? 'bg-indigo-600 text-white' : 'bg-white border text-gray-700 hover:bg-gray-50'}`}
          >
            {s}
          </button>
        ))}
      </div>

      <ul className="divide-y rounded-xl border bg-white">
        {filtered.map(c => (
          <li key={c.id} className="p-4 hover:bg-gray-50">
            <div className="flex items-start gap-3">
              <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_STYLES[c.severity]}`}>
                {c.severity}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono">{c.country}</span>
                  <span>{c.region.replace(/_/g, ' ')}</span>
                  <span>·</span>
                  <span>{c.category}</span>
                  <span>·</span>
                  <span>{new Date(c.detectedAt).toLocaleString()}</span>
                </div>
                <h3 className="mt-1 font-semibold text-gray-900">{c.title}</h3>
                <p className="mt-1 text-sm text-gray-600">{c.summary}</p>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                    {c.sourceName} <ExternalLink className="h-3 w-3" />
                  </a>
                  <span className={`rounded px-1.5 py-0.5 ${STATUS_STYLES[c.status]}`}>{c.status}</span>
                </div>
              </div>
            </div>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="p-6 text-center text-sm text-gray-500">No changes match the filter.</li>
        )}
      </ul>

      <p className="text-xs text-gray-400">
        Mock data — wire to <code>regulatory_changes</code> table once the change-detection worker lands.
      </p>
    </div>
  );
}

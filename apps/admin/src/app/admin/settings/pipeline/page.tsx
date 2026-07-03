'use client';

/**
 * /admin/settings/pipeline — runtime toggles for the editorial pipeline (P4.4).
 *
 * Replaces .env-only configuration with admin-tunable controls for:
 *   - planner loop (web-search planner on/off + cache + max steps)
 *   - fact-check policy (require? soft-fail on outage?)
 *   - gov monitor (auto-create runs + credibility threshold)
 *
 * Settings are stored in SystemConfiguration; agents read via getPipelineSettings().
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, ShieldCheck, Sparkles, Radio, AlertCircle, CheckCircle2 } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface PipelineSettings {
  enablePlannerLoop: boolean;
  requireFactCheck: boolean;
  factCheckSoftFailOnOutage: boolean;
  govAlertAutoCreate: boolean;
  govAlertMinCredibility: number;
  plannerMaxSteps: number;
  plannerCacheEnabled: boolean;
}

export default function PipelineSettingsPage() {
  const [settings, setSettings] = useState<PipelineSettings | null>(null);
  const [source, setSource] = useState<'db' | 'env'>('env');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/pipeline-settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setSettings(json.settings);
      setSource(json.source);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!settings) return;
    const token = getAccessToken();
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/pipeline-settings`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setSettings(json.settings);
      setSource('db');
      setSavedAt(new Date());
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading pipeline settings…
      </div>
    );
  }

  const set = <K extends keyof PipelineSettings>(k: K, v: PipelineSettings[K]) =>
    setSettings(prev => (prev ? { ...prev, [k]: v } : prev));

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pipeline settings</h1>
          <p className="text-sm text-gray-500">
            Runtime toggles for the editorial pipeline. Saved to DB; falls back to env when unset.
            Current source: <span className="font-mono text-xs">{source}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
      </header>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
      {savedAt && !error && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          Saved at {savedAt.toLocaleTimeString()}
        </div>
      )}

      <section className="rounded-xl border bg-white">
        <SectionHeader icon={<ShieldCheck className="h-4 w-4" />} title="Fact-check" subtitle="Verifies research claims against cited sources." />
        <SettingsRow
          label="Require fact-check pass"
          desc="Block runs where high-stakes claims aren't supported by sources."
          input={<Toggle checked={settings.requireFactCheck} onChange={v => set('requireFactCheck', v)} />}
        />
        <SettingsRow
          label="Soft-pass on Ollama outage"
          desc="If the fact-check service is unreachable, proceed with a warning rather than blocking."
          input={<Toggle checked={settings.factCheckSoftFailOnOutage} onChange={v => set('factCheckSoftFailOnOutage', v)} />}
        />
      </section>

      <section className="rounded-xl border bg-white">
        <SectionHeader icon={<Sparkles className="h-4 w-4" />} title="Planner loop" subtitle="Vercel AI SDK + Ollama tool-use loop for proactive web research." />
        <SettingsRow
          label="Enable planner loop"
          desc="Run web search + scrape after static ingestion. Costs more Ollama time per run."
          input={<Toggle checked={settings.enablePlannerLoop} onChange={v => set('enablePlannerLoop', v)} />}
        />
        <SettingsRow
          label="Max tool calls per run"
          desc="Budget cap for the planner's web-search/fetch/summarize loop."
          input={
            <input
              type="number"
              min={1}
              max={20}
              value={settings.plannerMaxSteps}
              onChange={e => set('plannerMaxSteps', parseInt(e.target.value, 10) || 8)}
              className="w-20 rounded border px-2 py-1 text-sm"
            />
          }
        />
        <SettingsRow
          label="Cache planner results"
          desc="Repeated runs on the same topic skip the loop (24h TTL)."
          input={<Toggle checked={settings.plannerCacheEnabled} onChange={v => set('plannerCacheEnabled', v)} />}
        />
      </section>

      <section className="rounded-xl border bg-white">
        <SectionHeader icon={<Radio className="h-4 w-4" />} title="Gov monitor" subtitle="Polls regulator/central-bank feeds; enqueues pipeline seeds." />
        <SettingsRow
          label="Auto-create runs from high-credibility alerts"
          desc="When an alert above the threshold is detected, automatically enqueue a pipeline seed."
          input={<Toggle checked={settings.govAlertAutoCreate} onChange={v => set('govAlertAutoCreate', v)} />}
        />
        <SettingsRow
          label="Minimum credibility (0-100)"
          desc="Alerts below this score still appear on /admin/gov-alerts but won't auto-trigger pipelines."
          input={
            <input
              type="number"
              min={0}
              max={100}
              value={settings.govAlertMinCredibility}
              onChange={e => set('govAlertMinCredibility', parseInt(e.target.value, 10) || 90)}
              className="w-20 rounded border px-2 py-1 text-sm"
            />
          }
        />
      </section>

      <p className="pt-2 text-xs text-gray-400">
        Note: some flags (planner cache, gov monitor) are read by long-running worker processes —
        you may need to restart those workers for changes to take effect.
      </p>
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <header className="flex items-start gap-2 border-b px-4 py-3">
      <div className="mt-0.5 text-indigo-600">{icon}</div>
      <div>
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
    </header>
  );
}

function SettingsRow({ label, desc, input }: { label: string; desc: string; input: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">{desc}</p>
      </div>
      <div className="shrink-0">{input}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
        checked ? 'bg-indigo-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition ${
          checked ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

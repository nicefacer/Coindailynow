'use client';

/**
 * ApprovePreviewModal (P3.5 H) — pre-approve preview of every language that
 * will be persisted as an ArticleTranslation row.
 *
 * Each row shows the English title vs the per-language title, a snippet of
 * the body, and a source badge: "AI" (auto-translated) or "HUMAN" (the
 * editor has touched the per-lang collab editor). Editor sees what will be
 * persisted before clicking "Approve & publish".
 *
 * No diff per language vs. English (translations are derivative; a textual
 * diff between languages is meaningless). The English doc itself uses the
 * existing DiffModal during step rerun.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, X, Check, AlertCircle, Languages, User, Bot } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface ApprovePreviewModalProps {
  runId: string;
  englishTitle: string;
  onCancel: () => void;
  onConfirm: (opts: { publishMode: 'now' | 'scheduled'; scheduledAt?: string }) => void;
  approving: boolean;
}

interface PreviewRow {
  language_code: string;
  language?: string;
  title: string;
  contentPreview: string;
  source: 'AI' | 'HUMAN';
  charCount: number;
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  sw: 'Kiswahili',
  fr: 'Français',
  pt: 'Português',
  ar: 'العربية',
  ha: 'Hausa',
  ig: 'Igbo',
  yo: 'Yorùbá',
  zu: 'isiZulu',
  af: 'Afrikaans',
  am: 'አማርኛ',
  so: 'Soomaali',
  rw: 'Kinyarwanda',
  es: 'Español',
  ht: 'Kreyòl',
};

export function ApprovePreviewModal({
  runId,
  englishTitle,
  onCancel,
  onConfirm,
  approving,
}: ApprovePreviewModalProps) {
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishMode, setPublishMode] = useState<'now' | 'scheduled'>('now');
  // Default schedule = 1 hour from now, formatted for datetime-local input
  const defaultSchedule = useMemo(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  }, []);
  const [scheduledAt, setScheduledAt] = useState<string>(defaultSchedule);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setError('Not authenticated');
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/pipeline-runs/${runId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const translateStep = json.run.steps.find((s: any) => s.stepName === 'translate');
        const translations: any[] = Array.isArray(translateStep?.output) ? translateStep.output : [];

        // Fetch which translations have human edits (have a docJson in PipelineTranslationDoc)
        const editsRes = await fetch(`${API_URL}/api/admin/pipeline-runs/${runId}/translation-edits`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const editsJson = editsRes.ok ? await editsRes.json() : { edited: [] };
        const editedSet = new Set<string>(editsJson.edited || []);

        const previewRows: PreviewRow[] = translations
          .filter(t => t && (t.language_code || t.language))
          .map(t => {
            const code = t.language_code || t.language;
            const content: string = String(t.content || '');
            return {
              language_code: code,
              language: t.language,
              title: t.title || englishTitle,
              contentPreview: content.replace(/\s+/g, ' ').trim().slice(0, 240),
              source: editedSet.has(code) ? 'HUMAN' : 'AI',
              charCount: content.length,
            };
          });
        setRows(previewRows);
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, [runId, englishTitle]);

  const humanCount = useMemo(() => (rows || []).filter(r => r.source === 'HUMAN').length, [rows]);
  const aiCount = useMemo(() => (rows || []).filter(r => r.source === 'AI').length, [rows]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="flex w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '85vh' }}
      >
        <header className="flex items-center justify-between border-b px-5 py-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Approve & publish — preview</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Each language below will become an ArticleTranslation row. {humanCount > 0 && (
                <span className="text-indigo-700">{humanCount} human-edited</span>
              )}
              {humanCount > 0 && aiCount > 0 && ' · '}
              {aiCount > 0 && <span>{aiCount} AI-only</span>}
            </p>
          </div>
          <button type="button" onClick={onCancel} className="rounded p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-4">
          {error && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
          {!rows && !error && (
            <div className="flex items-center gap-2 p-6 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading translations…
            </div>
          )}
          {rows && rows.length === 0 && (
            <div className="rounded-lg border bg-gray-50 p-6 text-center text-sm text-gray-500">
              <Languages className="mx-auto mb-2 h-5 w-5 text-gray-400" />
              No translations to persist — only the English Article will be created.
            </div>
          )}
          {rows && rows.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {rows.map(r => (
                <li key={r.language_code} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">
                        {r.language_code.toUpperCase()}
                      </span>
                      <span className="font-medium text-gray-900">
                        {LANGUAGE_LABELS[r.language_code] || r.language || r.language_code}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          r.source === 'HUMAN'
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {r.source === 'HUMAN' ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                        {r.source}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">{r.charCount.toLocaleString()} chars</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-gray-700">{r.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-500">{r.contentPreview}…</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t bg-gray-50 px-5 py-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">When to publish</p>
          <div className="flex items-center gap-3 text-sm">
            <label className="inline-flex items-center gap-1.5">
              <input
                type="radio"
                checked={publishMode === 'now'}
                onChange={() => setPublishMode('now')}
              />
              Publish now
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="radio"
                checked={publishMode === 'scheduled'}
                onChange={() => setPublishMode('scheduled')}
              />
              Schedule:
            </label>
            <input
              type="datetime-local"
              disabled={publishMode !== 'scheduled'}
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              className="rounded border px-2 py-1 text-xs disabled:opacity-50"
            />
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t bg-gray-50 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirm({
                publishMode,
                scheduledAt: publishMode === 'scheduled' ? new Date(scheduledAt).toISOString() : undefined,
              })
            }
            disabled={approving || !rows}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {publishMode === 'now' ? 'Approve & publish now' : 'Approve & schedule'}
          </button>
        </footer>
      </div>
    </div>
  );
}

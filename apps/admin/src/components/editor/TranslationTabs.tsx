'use client';

/**
 * TranslationTabs — per-language collab editor + regen button.
 *
 * Phase 3.10 — translations are now EDITABLE in their own language.
 * Each tab connects to a per-language Hocuspocus document named
 * `${runId}:${langCode}`. On first open of a language, the editor hydrates
 * from the corresponding `translate` step output entry (markdown body +
 * title). Subsequent opens pull the live Y.Doc state from the backend.
 *
 * Editors stay mounted while you switch tabs (visibility-toggled) so
 * Y.Docs don't reconnect on every click.
 */

import React, { useMemo, useState } from 'react';
import { Loader2, RotateCcw, Languages, Sparkles, ShieldCheck, AlertTriangle } from 'lucide-react';
import { CollabEditor } from './CollabEditor';
import { markdownToTiptapNodes } from '@/lib/doc/articleDoc';
import { getAccessToken } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface TranslationFactCheckResult {
  passed: boolean;
  faithfulness: number;
  totalClaims: number;
  preservedClaims: number;
  driftedClaims: number;
  claims: Array<{ englishClaim: string; presentInTranslation: boolean; drift?: string }>;
  fallback?: boolean;
}

export interface TranslationOutput {
  language: string;
  language_code: string;
  title: string;
  content: string;
}

interface TranslationTabsProps {
  runId: string;
  translations: TranslationOutput[];
  collabToken: string;
  collabUrl: string;
  currentUser: { id: string; name: string; color?: string };
  onRerunLanguage: (langCode: string, instructions: string) => Promise<void>;
  rerunningLang?: string | null;
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

export function TranslationTabs({
  runId,
  translations,
  collabToken,
  collabUrl,
  currentUser,
  onRerunLanguage,
  rerunningLang,
}: TranslationTabsProps) {
  const [activeLang, setActiveLang] = useState<string>(translations[0]?.language_code ?? '');
  const [regenLang, setRegenLang] = useState<string | null>(null);
  const [factCheckLang, setFactCheckLang] = useState<string | null>(null);
  const [factCheckResults, setFactCheckResults] = useState<Map<string, TranslationFactCheckResult>>(new Map());

  // Keep editors mounted across tab switches to avoid Hocuspocus reconnects.
  // Only languages that have been opened at least once are mounted.
  const [openedLangs, setOpenedLangs] = useState<Set<string>>(
    new Set(translations[0]?.language_code ? [translations[0].language_code] : []),
  );

  // Memoize hydrate callbacks per language. Each lang's hydrator inserts the
  // translation's markdown body (with optional H1 title) as initial Tiptap
  // content. Stable identity matters — CollabEditor mounts once per docName.
  const hydrators = useMemo(() => {
    const map = new Map<string, (editor: any) => void>();
    for (const t of translations) {
      map.set(t.language_code, (editor: any) => {
        const titleNode = t.title
          ? { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: t.title }] }
          : null;
        const body = markdownToTiptapNodes(t.content || '');
        const doc = { type: 'doc', content: [titleNode, ...body].filter(Boolean) };
        editor.commands.setContent(doc, false);
      });
    }
    return map;
    // Hydrators recompute when translations change (e.g. after re-translate),
    // but only newly-opened tabs use the fresh hydrator — already-open Y.Docs
    // keep their server state.
  }, [translations]);

  if (!translations.length) {
    return (
      <div className="rounded-xl border bg-gray-50 p-4 text-sm text-gray-500">
        <Languages className="mb-1 inline h-4 w-4" /> No translations yet — the translate step hasn't run.
      </div>
    );
  }

  const runFactCheck = async (langCode: string) => {
    const token = getAccessToken();
    if (!token) return;
    setFactCheckLang(langCode);
    try {
      const res = await fetch(
        `${API_URL}/api/admin/pipeline-runs/${runId}/translations/${langCode}/factcheck`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      );
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `factcheck failed (${res.status})`);
      setFactCheckResults(prev => new Map(prev).set(langCode, json.result as TranslationFactCheckResult));
    } catch (e: any) {
      setFactCheckResults(prev =>
        new Map(prev).set(langCode, {
          passed: false,
          faithfulness: 0,
          totalClaims: 0,
          preservedClaims: 0,
          driftedClaims: 0,
          claims: [],
          fallback: true,
        }),
      );
      console.error('[TranslationTabs] factcheck error', e);
    } finally {
      setFactCheckLang(null);
    }
  };

  const switchLang = (code: string) => {
    setActiveLang(code);
    setOpenedLangs(prev => {
      if (prev.has(code)) return prev;
      const next = new Set(prev);
      next.add(code);
      return next;
    });
  };

  return (
    <>
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="flex items-center gap-1 overflow-x-auto border-b px-3 py-2">
          <Languages className="h-4 w-4 shrink-0 text-gray-400" />
          {translations.map(t => {
            const isActive = t.language_code === activeLang;
            const isRerunning = rerunningLang === t.language_code;
            return (
              <button
                key={t.language_code}
                type="button"
                onClick={() => switchLang(t.language_code)}
                className={`relative shrink-0 rounded px-2.5 py-1 text-xs font-medium transition ${
                  isActive
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                title={LANGUAGE_LABELS[t.language_code] || t.language}
              >
                {isRerunning && (
                  <Loader2 className="absolute -right-1 -top-1 h-3 w-3 animate-spin text-indigo-600" />
                )}
                {t.language_code.toUpperCase()}
              </button>
            );
          })}
        </div>

        <div className="px-3 py-3">
          <div className="mb-3 flex items-center justify-between px-2">
            <p className="text-xs uppercase tracking-wide text-gray-400">
              {LANGUAGE_LABELS[activeLang] || activeLang} — collab editor
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => runFactCheck(activeLang)}
                disabled={factCheckLang === activeLang}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {factCheckLang === activeLang ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ShieldCheck className="h-3 w-3" />
                )}
                Fact-check
              </button>
              <button
                type="button"
                onClick={() => setRegenLang(activeLang)}
                disabled={!!rerunningLang}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <RotateCcw className="h-3 w-3" />
                Re-translate
              </button>
            </div>
          </div>

          {factCheckResults.has(activeLang) && (
            <FactCheckBanner result={factCheckResults.get(activeLang)!} />
          )}

          {translations.map(t => {
            if (!openedLangs.has(t.language_code)) return null;
            const isActive = t.language_code === activeLang;
            return (
              <div key={t.language_code} style={{ display: isActive ? 'block' : 'none' }}>
                <CollabEditor
                  documentName={`${runId}:${t.language_code}`}
                  collabToken={collabToken}
                  collabUrl={collabUrl}
                  currentUser={currentUser}
                  hydrateIfEmpty={hydrators.get(t.language_code)}
                  proseClass="prose prose-slate max-w-none focus:outline-none min-h-[40vh] px-6 py-4"
                />
              </div>
            );
          })}
        </div>
      </div>

      {regenLang && (
        <RegenLangModal
          langCode={regenLang}
          langLabel={LANGUAGE_LABELS[regenLang] || regenLang}
          onCancel={() => setRegenLang(null)}
          onSubmit={async instructions => {
            setRegenLang(null);
            await onRerunLanguage(regenLang, instructions);
          }}
        />
      )}
    </>
  );
}

function FactCheckBanner({ result }: { result: TranslationFactCheckResult }) {
  const drifted = result.claims.filter(c => !c.presentInTranslation);
  const tone = result.passed
    ? 'border-green-200 bg-green-50 text-green-800'
    : 'border-amber-200 bg-amber-50 text-amber-800';
  const Icon = result.passed ? ShieldCheck : AlertTriangle;
  return (
    <div className={`mx-2 mb-3 rounded-lg border p-3 text-xs ${tone}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5" />
        <span className="font-semibold">
          Faithfulness {result.faithfulness}/100
        </span>
        <span className="opacity-80">
          {result.preservedClaims}/{result.totalClaims} claims preserved
          {result.fallback && ' · fact-check service unavailable, showing soft-pass'}
        </span>
      </div>
      {drifted.length > 0 && (
        <ul className="mt-2 space-y-1 pl-5 list-disc">
          {drifted.slice(0, 5).map((c, i) => (
            <li key={i}>
              <span className="font-medium">{c.englishClaim.slice(0, 100)}{c.englishClaim.length > 100 ? '…' : ''}</span>
              {c.drift && <span className="ml-1 opacity-80">— {c.drift}</span>}
            </li>
          ))}
          {drifted.length > 5 && <li className="opacity-60">+ {drifted.length - 5} more</li>}
        </ul>
      )}
    </div>
  );
}

function RegenLangModal({
  langCode,
  langLabel,
  onCancel,
  onSubmit,
}: {
  langCode: string;
  langLabel: string;
  onCancel: () => void;
  onSubmit: (instructions: string) => void;
}) {
  const [instructions, setInstructions] = useState('');
  const [submitting, setSubmitting] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-indigo-100 p-2">
            <Sparkles className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-gray-900">
              Re-translate {langLabel} ({langCode.toUpperCase()})
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Only this language will be re-translated. Other languages and the English doc are untouched.
              Your in-editor edits to this language will be overwritten — confirm cancel if you want to keep them.
            </p>
          </div>
        </div>

        <textarea
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          placeholder={`e.g. "Use more formal register" or "Avoid loanwords; prefer native ${langLabel} terms"`}
          className="mt-4 w-full rounded-lg border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          rows={4}
          autoFocus
          maxLength={4000}
        />

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              onSubmit(instructions);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Re-translate
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

/**
 * DiffModal — shows current vs new content before "Apply to doc" hard-overwrites.
 *
 * Unified diff (additions green, deletions red) via the `diff` package. Use the
 * existing doc body as `current` and the new step output as `incoming`.
 *
 * Phase 3.5 — prevents accidentally clobbering human edits during a step rerun.
 */

import React, { useMemo, useState } from 'react';
import { diffLines } from 'diff';
import { Loader2, X, Check } from 'lucide-react';

interface DiffModalProps {
  title: string;
  current: string;
  incoming: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DiffModal({ title, current, incoming, onCancel, onConfirm }: DiffModalProps) {
  const [confirming, setConfirming] = useState(false);

  const parts = useMemo(() => diffLines(current, incoming, { ignoreWhitespace: false }), [
    current,
    incoming,
  ]);

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const p of parts) {
      const lines = p.value.split('\n').filter(Boolean).length;
      if (p.added) added += lines;
      else if (p.removed) removed += lines;
    }
    return { added, removed };
  }, [parts]);

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
            <h3 className="text-base font-semibold text-gray-900">Apply changes — {title}</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              <span className="text-green-700">+{stats.added} lines</span>
              {' · '}
              <span className="text-red-700">-{stats.removed} lines</span>
            </p>
          </div>
          <button type="button" onClick={onCancel} className="rounded p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-4 font-mono text-[12px] leading-relaxed">
          <pre className="whitespace-pre-wrap break-words">
            {parts.map((part, i) => (
              <span
                key={i}
                className={
                  part.added
                    ? 'bg-green-50 text-green-900'
                    : part.removed
                    ? 'bg-red-50 text-red-800 line-through opacity-70'
                    : 'text-gray-600'
                }
              >
                {prefixLines(part.value, part.added ? '+ ' : part.removed ? '- ' : '  ')}
              </span>
            ))}
          </pre>
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
            disabled={confirming || (stats.added === 0 && stats.removed === 0)}
            onClick={() => {
              setConfirming(true);
              onConfirm();
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Apply
          </button>
        </footer>
      </div>
    </div>
  );
}

function prefixLines(text: string, prefix: string): string {
  if (!text) return '';
  // Keep trailing newline if present
  const trailing = text.endsWith('\n');
  const lines = text.split('\n');
  const last = trailing ? lines.pop() : undefined;
  const out = lines.map(l => prefix + l).join('\n');
  return trailing ? out + '\n' + (last ?? '') : out;
}

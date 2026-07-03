'use client';

/**
 * StepStatusPanel — right-side panel showing the 12 pipeline steps with
 * status, duration, I/O disclosure, and a per-step "Regenerate" button.
 *
 * Phase 2: rerun is wired. After a successful rerun, downstream steps
 * are marked STALE and the editor sees an "Apply to doc" button on
 * steps that produce doc content (writer, image, embedImage).
 */

import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Sparkles,
  ArrowUpFromLine,
} from 'lucide-react';

type StepStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'STALE';

export interface PipelineStep {
  stepName: string;
  stepOrder: number;
  status: StepStatus;
  input?: any;
  output?: any;
  errorMessage?: string | null;
  durationMs?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

interface StepStatusPanelProps {
  steps: PipelineStep[];
  onRerun: (stepName: string, instructions: string) => Promise<void>;
  onApplyToDoc: (stepName: string) => void;
  rerunningStep?: string | null;
}

const STEP_LABELS: Record<string, string> = {
  research: '1. Research',
  validateResearch: '2. Validate research',
  factCheck: '3. Fact-check claims',
  writingPrompt: '4. Writing prompt',
  writer: '5. Writer agent',
  validateArticle: '6. Validate article',
  imagePrompt: '7. Image prompt',
  image: '8. Image agent (Iengine)',
  validateImage: '9. Validate image',
  embedImage: '10. Embed image',
  translationPrompts: '11. Translation prompts',
  translate: '12. Translate (15 langs)',
  validateTranslations: '13. Validate translations',
  queueForApproval: '✓ Queue for review',
};

// Which steps support a user-supplied instructions field (vs. plain rerun)
const STEPS_WITH_INSTRUCTIONS = new Set([
  'research',
  'writer',
  'image',
  'writingPrompt',
  'imagePrompt',
  'translationPrompts',
]);

// Which steps produce doc-replayable output (writer text / image src)
const STEPS_WITH_DOC_REPLAY = new Set(['writer', 'image', 'embedImage']);

// Which steps are non-rerunnable (terminal queue step)
const STEPS_NON_RERUNNABLE = new Set(['queueForApproval']);

export function StepStatusPanel({
  steps,
  onRerun,
  onApplyToDoc,
  rerunningStep,
}: StepStatusPanelProps) {
  const sorted = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
  const [activeRerunStep, setActiveRerunStep] = useState<string | null>(null);

  return (
    <>
      <aside className="rounded-xl border bg-white shadow-sm">
        <header className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Pipeline steps</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Click any step to inspect I/O. Use ↻ to regenerate.
          </p>
        </header>
        <ul className="divide-y">
          {sorted.map(step => (
            <StepRow
              key={step.stepName}
              step={step}
              onRerunClick={() => setActiveRerunStep(step.stepName)}
              onApplyClick={() => onApplyToDoc(step.stepName)}
              isRerunning={rerunningStep === step.stepName}
            />
          ))}
        </ul>
      </aside>

      {activeRerunStep && (
        <RerunModal
          stepName={activeRerunStep}
          label={STEP_LABELS[activeRerunStep] || activeRerunStep}
          requiresInstructions={STEPS_WITH_INSTRUCTIONS.has(activeRerunStep)}
          onCancel={() => setActiveRerunStep(null)}
          onSubmit={async instructions => {
            setActiveRerunStep(null);
            await onRerun(activeRerunStep, instructions);
          }}
        />
      )}
    </>
  );
}

function StepRow({
  step,
  onRerunClick,
  onApplyClick,
  isRerunning,
}: {
  step: PipelineStep;
  onRerunClick: () => void;
  onApplyClick: () => void;
  isRerunning: boolean;
}) {
  const [open, setOpen] = useState(false);
  const label = STEP_LABELS[step.stepName] || step.stepName;
  const canRerun = !STEPS_NON_RERUNNABLE.has(step.stepName) && !isRerunning;
  const canApply =
    STEPS_WITH_DOC_REPLAY.has(step.stepName) && step.status === 'SUCCESS' && step.output;

  return (
    <li className="px-4 py-2.5 text-sm">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
          <StatusIcon status={step.status} isRerunning={isRerunning} />
          <span className="flex-1 truncate font-medium text-gray-800">{label}</span>
          {step.status === 'STALE' && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
              stale
            </span>
          )}
          {typeof step.durationMs === 'number' && step.status !== 'STALE' && (
            <span className="text-xs text-gray-400">{(step.durationMs / 1000).toFixed(1)}s</span>
          )}
        </button>

        {canApply && (
          <button
            type="button"
            title="Apply this step's output to the doc"
            onClick={onApplyClick}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
          >
            <ArrowUpFromLine className="h-4 w-4" />
          </button>
        )}
        {canRerun && (
          <button
            type="button"
            title="Regenerate this step"
            onClick={onRerunClick}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-indigo-600"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 space-y-2 pl-6 text-xs">
          {step.errorMessage && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-red-700">
              {step.errorMessage}
            </div>
          )}
          {step.input !== undefined && step.input !== null && (
            <details>
              <summary className="cursor-pointer text-gray-500">input</summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-gray-50 p-2 text-[11px]">
                {safeStringify(step.input)}
              </pre>
            </details>
          )}
          {step.output !== undefined && step.output !== null && (
            <details>
              <summary className="cursor-pointer text-gray-500">output</summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-gray-50 p-2 text-[11px]">
                {safeStringify(step.output)}
              </pre>
            </details>
          )}
        </div>
      )}
    </li>
  );
}

function StatusIcon({ status, isRerunning }: { status: StepStatus; isRerunning: boolean }) {
  if (isRerunning) return <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />;
  switch (status) {
    case 'SUCCESS':
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case 'FAILED':
      return <AlertCircle className="h-4 w-4 text-red-600" />;
    case 'RUNNING':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
    case 'STALE':
      return <RotateCcw className="h-4 w-4 text-amber-500" />;
    case 'SKIPPED':
      return <Clock className="h-4 w-4 text-gray-400" />;
    default:
      return <Clock className="h-4 w-4 text-gray-400" />;
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function RerunModal({
  stepName,
  label,
  requiresInstructions,
  onCancel,
  onSubmit,
}: {
  stepName: string;
  label: string;
  requiresInstructions: boolean;
  onCancel: () => void;
  onSubmit: (instructions: string) => void;
}) {
  const [instructions, setInstructions] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const placeholderFor = (name: string): string => {
    switch (name) {
      case 'research':
        return 'e.g. "Focus on Q3 2026 Kenya CMA enforcement actions, exclude exchange listing news"';
      case 'writer':
        return 'e.g. "Make the opening more punchy, add a section comparing to Nigeria SEC framework"';
      case 'image':
        return 'e.g. "Less text overlay, warmer color palette, include Nigerian flag colors"';
      default:
        return 'Instructions for this rerun (optional)';
    }
  };

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
            <h3 className="text-base font-semibold text-gray-900">Regenerate: {label}</h3>
            <p className="mt-1 text-xs text-gray-500">
              Downstream steps will be marked stale. You can selectively re-run them after.
            </p>
          </div>
        </div>

        {requiresInstructions ? (
          <textarea
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            placeholder={placeholderFor(stepName)}
            className="mt-4 w-full rounded-lg border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            rows={4}
            autoFocus
            maxLength={4000}
          />
        ) : (
          <p className="mt-4 text-sm text-gray-600">
            This step will be re-executed against its current inputs.
          </p>
        )}

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
            Rerun
          </button>
        </div>
      </div>
    </div>
  );
}

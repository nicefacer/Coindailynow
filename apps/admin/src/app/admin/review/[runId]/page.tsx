'use client';

/**
 * /admin/review/[runId] — doc-based review of a single editorial pipeline run.
 *
 * Phase 2:
 *   ┌──────────────────────────────┬─────────────────────────┐
 *   │ ArticleDocEditor (Tiptap)    │ StepStatusPanel         │
 *   │  (collab, with imperative    │  (regen buttons, stale  │
 *   │   replaceWriterContent /     │   badges, apply-to-doc) │
 *   │   replaceImageSrc handles)   │                         │
 *   └──────────────────────────────┴─────────────────────────┘
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, AlertCircle, CheckCircle2, Send } from 'lucide-react';
import { ArticleDocEditor, ArticleDocEditorHandle } from '@/components/editor/ArticleDocEditor';
import { StepStatusPanel, PipelineStep } from '@/components/editor/StepStatusPanel';
import { DiffModal } from '@/components/editor/DiffModal';
import { TranslationTabs, TranslationOutput } from '@/components/editor/TranslationTabs';
import { ApprovePreviewModal } from '@/components/editor/ApprovePreviewModal';
import { getAccessToken, getSessionUser } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const APPROVER_ROLES = new Set(['EDITOR', 'CEO', 'CONTENT_ADMIN', 'ADMIN', 'SUPER_ADMIN']);

function ApprovalControls({
  status,
  userRole,
  approving,
  submitting,
  onSubmit,
  onApproveClick,
}: {
  status: string;
  userRole?: string;
  approving: boolean;
  submitting: boolean;
  onSubmit: () => void;
  onApproveClick: () => void;
}) {
  const canApprove = userRole ? APPROVER_ROLES.has(userRole) : false;
  const isApproved = status === 'APPROVED';
  const isSubmitted = status === 'SUBMITTED_FOR_REVIEW';
  const isReady = status === 'READY_FOR_REVIEW';

  if (isApproved) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center gap-2 rounded-lg bg-green-100 px-4 py-2 text-sm font-medium text-green-700"
      >
        <CheckCircle2 className="h-4 w-4" /> Approved
      </button>
    );
  }

  // EDITOR+ — can approve directly (works on both READY and SUBMITTED states)
  if (canApprove && (isReady || isSubmitted)) {
    return (
      <button
        type="button"
        onClick={onApproveClick}
        disabled={approving}
        className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 disabled:opacity-50"
      >
        {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        Approve & publish
      </button>
    );
  }

  // Contributor / journalist — submit-for-review only
  if (!canApprove && isReady) {
    return (
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting}
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Submit for review
      </button>
    );
  }

  // Contributor on a SUBMITTED run — view-only, show status
  if (!canApprove && isSubmitted) {
    return (
      <span className="inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
        Awaiting editor approval
      </span>
    );
  }

  return null;
}

function extractTranslations(steps: PipelineStep[]): TranslationOutput[] {
  const translate = steps.find(s => s.stepName === 'translate');
  const out = translate?.output;
  if (!Array.isArray(out)) return [];
  return out
    .filter(t => t && typeof t === 'object' && (t.language_code || t.language))
    .map(t => ({
      language: t.language ?? t.language_code ?? '??',
      language_code: t.language_code ?? t.language ?? '??',
      title: t.title ?? '',
      content: t.content ?? '',
    }));
}

function collabUrl(): string {
  try {
    const u = new URL(API_URL);
    const wsProtocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${u.host}/collab`;
  } catch {
    return 'ws://localhost:4000/collab';
  }
}

interface PipelineRunResponse {
  run: {
    id: string;
    topic: string;
    status: string;
    isMockMode: boolean;
    docJson: any;
    steps: PipelineStep[];
    createdAt: string;
  };
  hasDocState: boolean;
}

export default function ReviewRunPage() {
  const params = useParams<{ runId: string }>();
  const router = useRouter();
  const runId = params.runId;
  const editorRef = useRef<ArticleDocEditorHandle | null>(null);

  const [data, setData] = useState<PipelineRunResponse | null>(null);
  const [collabToken, setCollabToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [rerunningStep, setRerunningStep] = useState<string | null>(null);
  const [rerunningLang, setRerunningLang] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pendingApply, setPendingApply] = useState<{
    stepName: string;
    title: string;
    current: string;
    incoming: string;
    apply: () => void;
  } | null>(null);
  const [showApprovePreview, setShowApprovePreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const authHeaders = useCallback((): Record<string, string> | null => {
    const token = getAccessToken();
    if (!token) return null;
    return { Authorization: `Bearer ${token}` };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const headers = authHeaders();
    if (!headers) {
      setError('Not authenticated');
      return;
    }

    (async () => {
      try {
        const [runRes, tokenRes] = await Promise.all([
          fetch(`${API_URL}/api/admin/pipeline-runs/${runId}`, { headers }),
          fetch(`${API_URL}/api/admin/pipeline-runs/${runId}/collab-token`, {
            method: 'POST',
            headers,
          }),
        ]);
        if (!runRes.ok) throw new Error(`Failed to load run (${runRes.status})`);
        if (!tokenRes.ok) throw new Error(`Failed to mint collab token (${tokenRes.status})`);

        const runJson = (await runRes.json()) as PipelineRunResponse;
        const tokenJson = (await tokenRes.json()) as { token: string };

        if (cancelled) return;
        setData(runJson);
        setCollabToken(tokenJson.token);
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runId, authHeaders]);

  const refreshRun = useCallback(async () => {
    const headers = authHeaders();
    if (!headers) return;
    const res = await fetch(`${API_URL}/api/admin/pipeline-runs/${runId}`, { headers });
    if (res.ok) {
      const json = (await res.json()) as PipelineRunResponse;
      setData(json);
    }
  }, [runId, authHeaders]);

  const onRerun = useCallback(
    async (stepName: string, instructions: string) => {
      const headers = authHeaders();
      if (!headers) return;
      setRerunningStep(stepName);
      setFlash(null);
      try {
        const res = await fetch(
          `${API_URL}/api/admin/pipeline-runs/${runId}/steps/${stepName}/rerun`,
          {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ instructions }),
          },
        );
        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json.errorMessage || json.error || `Rerun failed (${res.status})`);
        }
        setFlash(
          `${stepName} regenerated${json.staleSteps?.length ? ` — ${json.staleSteps.length} downstream step(s) marked stale` : ''}.`,
        );
        await refreshRun();
      } catch (e: any) {
        setError(e.message);
      } finally {
        setRerunningStep(null);
      }
    },
    [runId, authHeaders, refreshRun],
  );

  const onApplyToDoc = useCallback(
    (stepName: string) => {
      if (!data || !editorRef.current) return;
      const step = data.run.steps.find(s => s.stepName === stepName);
      if (!step?.output) {
        setError(`Step ${stepName} has no output to apply`);
        return;
      }

      const current = editorRef.current.getCurrentBodyText();

      if (stepName === 'writer' || stepName === 'embedImage') {
        const content = (step.output as any).content;
        const title = (step.output as any).title;
        if (typeof content !== 'string') {
          setError(`Step ${stepName} output has no content string`);
          return;
        }
        setPendingApply({
          stepName,
          title: stepName === 'writer' ? 'Writer agent output' : 'Embedded article',
          current,
          incoming: (title ? `# ${title}\n\n` : '') + content,
          apply: () => {
            editorRef.current?.replaceWriterContent(content, title);
            setFlash(`Applied "${stepName}" to doc${title ? ' (incl. title)' : ''}.`);
            setPendingApply(null);
          },
        });
        return;
      }

      if (stepName === 'image') {
        const url = (step.output as any).url;
        const alt = (step.output as any).alt_text;
        if (!url) {
          setError('Image step has no url to apply');
          return;
        }
        // No textual diff for image swap — apply directly.
        editorRef.current.replaceImageSrc(url, alt);
        setFlash('Applied new image to doc.');
        return;
      }

      setError(`Step ${stepName} is not doc-replayable`);
    },
    [data],
  );

  const onRerunLanguage = useCallback(
    async (langCode: string, instructions: string) => {
      const headers = authHeaders();
      if (!headers) return;
      setRerunningLang(langCode);
      setFlash(null);
      try {
        const res = await fetch(
          `${API_URL}/api/admin/pipeline-runs/${runId}/steps/translate/rerun`,
          {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ instructions, lang: langCode }),
          },
        );
        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json.errorMessage || json.error || `Rerun failed (${res.status})`);
        }
        setFlash(`Re-translated ${langCode.toUpperCase()}.`);
        await refreshRun();
      } catch (e: any) {
        setError(e.message);
      } finally {
        setRerunningLang(null);
      }
    },
    [runId, authHeaders, refreshRun],
  );

  const onSubmitForReview = useCallback(async () => {
    const headers = authHeaders();
    if (!headers) return;
    setSubmitting(true);
    setFlash(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/pipeline-runs/${runId}/submit-for-review`, {
        method: 'POST',
        headers,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Submit failed (${res.status})`);
      }
      setFlash('Submitted for editor review.');
      await refreshRun();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }, [runId, authHeaders, refreshRun]);

  const onApprove = useCallback(
    async (opts: { publishMode: 'now' | 'scheduled'; scheduledAt?: string }) => {
      const headers = authHeaders();
      if (!headers || !data) return;
      setApproving(true);
      try {
        const res = await fetch(`${API_URL}/api/admin/pipeline-runs/${runId}/approve`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(opts),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `Approve failed (${res.status})`);
        }
        const json = (await res.json()) as { articleId: string };
        router.push(`/admin/content?highlight=${json.articleId}`);
      } catch (e: any) {
        setError(e.message);
        setApproving(false);
      }
    },
    [data, runId, router, authHeaders],
  );

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <AlertCircle className="h-5 w-5" />
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto rounded px-2 py-1 text-xs font-medium hover:bg-red-100"
          >
            dismiss
          </button>
        </div>
      </div>
    );
  }

  if (!data || !collabToken) {
    return (
      <div className="flex items-center gap-2 p-6 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading run…
      </div>
    );
  }

  const sessionUser = getSessionUser();
  const currentUser = sessionUser
    ? {
        id: sessionUser.id,
        name:
          [sessionUser.profile?.firstName, sessionUser.profile?.lastName].filter(Boolean).join(' ') ||
          sessionUser.email ||
          'Editor',
      }
    : { id: 'anonymous', name: 'Editor' };

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{data.run.topic}</h1>
          <p className="text-sm text-gray-500">
            Run {runId.slice(0, 8)}… · status:{' '}
            <span className="font-medium">{data.run.status}</span>
            {data.run.isMockMode && (
              <span className="ml-2 rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">
                mock
              </span>
            )}
          </p>
        </div>
        <ApprovalControls
          status={data.run.status}
          userRole={sessionUser?.role}
          approving={approving}
          submitting={submitting}
          onSubmit={onSubmitForReview}
          onApproveClick={() => setShowApprovePreview(true)}
        />
      </header>

      {flash && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {flash}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <ArticleDocEditor
          ref={editorRef}
          runId={runId}
          initialRun={data.run}
          collabToken={collabToken}
          collabUrl={collabUrl()}
          currentUser={currentUser}
        />
        <StepStatusPanel
          steps={data.run.steps}
          onRerun={onRerun}
          onApplyToDoc={onApplyToDoc}
          rerunningStep={rerunningStep}
        />
      </div>

      <TranslationTabs
        runId={runId}
        translations={extractTranslations(data.run.steps)}
        collabToken={collabToken}
        collabUrl={collabUrl()}
        currentUser={currentUser}
        onRerunLanguage={onRerunLanguage}
        rerunningLang={rerunningLang}
      />

      {pendingApply && (
        <DiffModal
          title={pendingApply.title}
          current={pendingApply.current}
          incoming={pendingApply.incoming}
          onCancel={() => setPendingApply(null)}
          onConfirm={pendingApply.apply}
        />
      )}

      {showApprovePreview && (
        <ApprovePreviewModal
          runId={runId}
          englishTitle={data.run.topic}
          approving={approving}
          onCancel={() => setShowApprovePreview(false)}
          onConfirm={async (opts) => {
            await onApprove(opts);
            setShowApprovePreview(false);
          }}
        />
      )}
    </div>
  );
}

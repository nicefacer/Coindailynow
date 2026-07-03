'use client';

/**
 * ArticleDocEditor — Tiptap collab editor for a PipelineRun.
 *
 * Connects to Hocuspocus at /collab using a short-lived token minted by
 * /api/admin/pipeline-runs/:runId/collab-token. The Y.Doc binary lives on
 * the backend in PipelineRun.docState; this client never touches it
 * directly — it just receives sync messages.
 *
 * On first ever open of a run, the backend's docState is null; we
 * hydrate the Y.Doc from the initial Tiptap JSON computed via
 * pipelineRunToTiptapDoc(). Subsequent opens pull state from the server.
 *
 * Phase 2: exposes imperative `replaceWriterContent` and `replaceImageSrc`
 * via the ArticleDocEditorHandle ref so the page can "Apply to doc" after
 * a step rerun. All edits flow through Y.Doc transactions, so other
 * connected editors receive the change as a normal collab update.
 */

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { common, createLowlight } from 'lowlight';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { FootnoteExtension } from '@/lib/doc/extensions/footnoteExtension';
import { AnchoredListItem } from '@/lib/doc/extensions/anchoredListItem';
import { pipelineRunToTiptapDoc, markdownToTiptapNodes } from '@/lib/doc/articleDoc';

const lowlight = createLowlight(common);

interface ArticleDocEditorProps {
  runId: string;
  initialRun: any;
  collabToken: string;
  collabUrl: string;
  currentUser: { id: string; name: string; color?: string };
}

export interface ArticleDocEditorHandle {
  /**
   * Replace the body markdown with a new writer step output. Optional title
   * overrides the existing H1 (P3.4 — writer reruns can change the title).
   */
  replaceWriterContent: (newMarkdown: string, title?: string) => void;
  /** Update the first <img> node in the doc to a new src + alt. */
  replaceImageSrc: (newSrc: string, alt?: string) => void;
  /** Update the H1 title. Used standalone when only the title changed. */
  replaceTitle: (newTitle: string) => void;
  /** Get the current body text as a plain string for diff comparison. */
  getCurrentBodyText: () => string;
}

export const ArticleDocEditor = forwardRef<ArticleDocEditorHandle, ArticleDocEditorProps>(
  function ArticleDocEditor({ runId, initialRun, collabToken, collabUrl, currentUser }, ref) {
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

    const { ydoc, provider } = useMemo(() => {
      const doc = new Y.Doc();
      const prov = new HocuspocusProvider({
        url: collabUrl,
        name: runId,
        document: doc,
        token: collabToken,
        onStatus: ({ status: s }) => setStatus(s as any),
      });
      return { ydoc: doc, provider: prov };
    }, [runId, collabToken, collabUrl]);

    const editor = useEditor(
      {
        extensions: [
          // Disable StarterKit's listItem — replaced by AnchoredListItem below
          // so the Sources list can carry id="fn-N" anchors.
          StarterKit.configure({ history: false, codeBlock: false, listItem: false }),
          AnchoredListItem,
          Image,
          Link.configure({ openOnClick: false, autolink: true }),
          Table.configure({ resizable: true }),
          TableRow,
          TableHeader,
          TableCell,
          CodeBlockLowlight.configure({ lowlight }),
          FootnoteExtension,
          Collaboration.configure({ document: ydoc }),
          CollaborationCursor.configure({
            provider,
            user: { name: currentUser.name, color: currentUser.color || pickUserColor(currentUser.id) },
          }),
        ],
        editorProps: {
          attributes: {
            class: 'prose prose-slate max-w-none focus:outline-none min-h-[60vh] px-6 py-4',
          },
        },
      },
      [ydoc],
    );

    // First-load hydration from PipelineRun → Tiptap JSON
    useEffect(() => {
      if (!editor) return;
      let hydrated = false;
      const onSynced = () => {
        if (hydrated) return;
        hydrated = true;
        const fragment = ydoc.getXmlFragment('default');
        if (fragment.length === 0) {
          const initialDoc = pipelineRunToTiptapDoc(initialRun);
          editor.commands.setContent(initialDoc as any, false);
        }
      };
      provider.on('synced', onSynced);
      return () => {
        provider.off('synced', onSynced);
      };
    }, [editor, provider, ydoc, initialRun]);

    useEffect(() => {
      return () => {
        provider.destroy();
        ydoc.destroy();
      };
    }, [provider, ydoc]);

    useImperativeHandle(
      ref,
      () => ({
        replaceWriterContent: (newMarkdown: string, title?: string) => {
          if (!editor) return;
          replaceWriterSection(editor, newMarkdown);
          if (title) replaceH1(editor, title);
        },
        replaceImageSrc: (newSrc: string, alt?: string) => {
          if (!editor) return;
          replaceFirstImage(editor, newSrc, alt);
        },
        replaceTitle: (newTitle: string) => {
          if (!editor) return;
          replaceH1(editor, newTitle);
        },
        getCurrentBodyText: () => {
          if (!editor) return '';
          // Plain text dump — sufficient for line-diff comparison.
          return editor.getText({ blockSeparator: '\n\n' });
        },
      }),
      [editor],
    );

    return (
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-2 text-sm text-gray-600">
          <span>Doc editor — run {runId.slice(0, 8)}…</span>
          <span className={statusClass(status)}>{status}</span>
        </div>
        <EditorContent editor={editor} />
      </div>
    );
  },
);

/**
 * Replace everything between the article body and the "Sources" h2 with
 * fresh writer output. Preserves the title, image, and citations footer.
 *
 * Strategy: find the first h2 (which is "Sources" if present) and replace
 * the range [imageEnd+1, sourcesH2) with the new markdown-converted nodes.
 */
function replaceWriterSection(editor: Editor, newMarkdown: string): void {
  const { state } = editor;
  const { doc } = state;

  let bodyStart = 0;
  let bodyEnd = doc.content.size;
  let foundImage = false;

  doc.descendants((node, pos) => {
    if (!foundImage && node.type.name === 'image') {
      bodyStart = pos + node.nodeSize;
      foundImage = true;
    }
    if (node.type.name === 'heading' && node.attrs.level === 2) {
      const text = node.textContent.toLowerCase();
      if (text.includes('source')) {
        bodyEnd = pos;
        return false;
      }
    }
    return true;
  });

  if (!foundImage) {
    // No image — find the first paragraph after the title heading
    doc.descendants((node, pos) => {
      if (node.type.name === 'heading' && node.attrs.level === 1) {
        bodyStart = pos + node.nodeSize;
        return false;
      }
      return true;
    });
  }

  const newNodes = markdownToTiptapNodes(newMarkdown);

  editor
    .chain()
    .focus()
    .deleteRange({ from: bodyStart, to: bodyEnd })
    .insertContentAt(bodyStart, newNodes as any)
    .run();
}

/**
 * Update the src attr of the first image node in the doc.
 * Works through a Y.Doc transaction so other collaborators see the change.
 */
function replaceFirstImage(editor: Editor, newSrc: string, alt?: string): void {
  const { state } = editor;
  let imagePos: number | null = null;
  let imageNode: any = null;

  state.doc.descendants((node, pos) => {
    if (imagePos !== null) return false;
    if (node.type.name === 'image') {
      imagePos = pos;
      imageNode = node;
      return false;
    }
    return true;
  });

  if (imagePos === null || !imageNode) {
    // No existing image — insert at top after title
    let insertPos = 0;
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading' && node.attrs.level === 1) {
        insertPos = pos + node.nodeSize;
        return false;
      }
      return true;
    });
    editor
      .chain()
      .focus()
      .insertContentAt(insertPos, { type: 'image', attrs: { src: newSrc, alt: alt || '' } })
      .run();
    return;
  }

  editor
    .chain()
    .focus()
    .setNodeSelection(imagePos)
    .updateAttributes('image', { src: newSrc, alt: alt ?? imageNode.attrs.alt })
    .run();
}

/** Replace the first H1's text content with newTitle. Inserts one if missing. */
function replaceH1(editor: Editor, newTitle: string): void {
  const { state } = editor;
  let h1Pos: number | null = null;
  let h1Size = 0;

  state.doc.descendants((node, pos) => {
    if (h1Pos !== null) return false;
    if (node.type.name === 'heading' && node.attrs.level === 1) {
      h1Pos = pos;
      h1Size = node.nodeSize;
      return false;
    }
    return true;
  });

  const newNode = { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: newTitle }] };

  if (h1Pos === null) {
    editor.chain().focus().insertContentAt(0, newNode as any).run();
    return;
  }
  editor
    .chain()
    .focus()
    .deleteRange({ from: h1Pos, to: h1Pos + h1Size })
    .insertContentAt(h1Pos, newNode as any)
    .run();
}

function statusClass(s: string): string {
  if (s === 'connected') return 'text-green-600';
  if (s === 'connecting') return 'text-yellow-600';
  return 'text-red-600';
}

function pickUserColor(userId: string): string {
  const palette = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'];
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

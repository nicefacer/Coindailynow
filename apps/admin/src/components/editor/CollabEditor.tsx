'use client';

/**
 * CollabEditor — generic Tiptap + Hocuspocus collab editor shell.
 *
 * Used directly by per-language translation editors (P3.10) and indirectly
 * by ArticleDocEditor (which adds imperative handles for the main English doc).
 *
 * Caller is responsible for:
 *   - constructing the documentName (e.g. `${runId}` or `${runId}:sw`)
 *   - providing a hydrate() callback called once if the server-side Y.Doc
 *     is empty (first ever open)
 *
 * Extension set matches the main editor so a Swahili / French / Hausa
 * editor has the same toolbox.
 */

import React, { useEffect, useMemo, useState } from 'react';
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

const lowlight = createLowlight(common);

export interface CollabEditorProps {
  /** Full Hocuspocus document name, e.g. `${runId}` or `${runId}:sw`. */
  documentName: string;
  collabToken: string;
  collabUrl: string;
  currentUser: { id: string; name: string; color?: string };
  /**
   * Called once after the first sync if the server-side Y.Doc is empty
   * (first open of this document). Should call editor.commands.setContent
   * with the initial Tiptap JSON.
   */
  hydrateIfEmpty?: (editor: Editor) => void;
  /** Tailwind class on the editor's contentEditable root. */
  proseClass?: string;
  /** Optional status callback exposed to the parent (e.g. for a header chip). */
  onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected') => void;
  /** Receives the live editor instance once it mounts (parent imperative handles). */
  onEditorReady?: (editor: Editor) => void;
}

export function CollabEditor({
  documentName,
  collabToken,
  collabUrl,
  currentUser,
  hydrateIfEmpty,
  proseClass = 'prose prose-slate max-w-none focus:outline-none min-h-[40vh] px-6 py-4',
  onStatusChange,
  onEditorReady,
}: CollabEditorProps) {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  const { ydoc, provider } = useMemo(() => {
    const doc = new Y.Doc();
    const prov = new HocuspocusProvider({
      url: collabUrl,
      name: documentName,
      document: doc,
      token: collabToken,
      onStatus: ({ status: s }) => {
        setStatus(s as any);
        onStatusChange?.(s as any);
      },
    });
    return { ydoc: doc, provider: prov };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentName, collabToken, collabUrl]);

  const editor = useEditor(
    {
      extensions: [
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
          user: {
            name: currentUser.name,
            color: currentUser.color || pickUserColor(currentUser.id),
          },
        }),
      ],
      editorProps: { attributes: { class: proseClass } },
    },
    [ydoc],
  );

  useEffect(() => {
    if (editor) onEditorReady?.(editor);
  }, [editor, onEditorReady]);

  // Hydrate on first sync if the server doc is empty
  useEffect(() => {
    if (!editor || !hydrateIfEmpty) return;
    let hydrated = false;
    const onSynced = () => {
      if (hydrated) return;
      hydrated = true;
      const fragment = ydoc.getXmlFragment('default');
      if (fragment.length === 0) hydrateIfEmpty(editor);
    };
    provider.on('synced', onSynced);
    return () => {
      provider.off('synced', onSynced);
    };
  }, [editor, provider, ydoc, hydrateIfEmpty]);

  useEffect(() => {
    return () => {
      provider.destroy();
      ydoc.destroy();
    };
  }, [provider, ydoc]);

  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-gray-500">
        <span>doc: {documentName.length > 24 ? documentName.slice(0, 8) + '…' + documentName.slice(-12) : documentName}</span>
        <span className={statusClass(status)}>{status}</span>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
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

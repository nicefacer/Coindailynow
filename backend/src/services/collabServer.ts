/**
 * Hocuspocus Collab Server
 *
 * Mounted on the existing Express HTTP server's `upgrade` event at /collab.
 * Each document name = PipelineRun.id. Y.Doc binary state persists to
 * PipelineRun.docState; on every store we also extract a JSON snapshot
 * into PipelineRun.docJson so non-realtime consumers (lists, exports,
 * approve flow) can read the doc without booting a Y.Doc.
 */

import { Server } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import * as Y from 'yjs';
import type { Server as HttpServer } from 'http';
import { WebSocketServer } from 'ws';
import prisma from '../lib/prisma';
import { verifyCollabToken } from './collabTokenService';

/**
 * P3.10 — parse a collab document name.
 * Bare `${runId}` is the English/master doc; `${runId}:${langCode}` is a
 * per-language translation doc backed by PipelineTranslationDoc.
 */
function parseDocName(documentName: string): { runId: string; lang: string | null } {
  const colon = documentName.indexOf(':');
  if (colon === -1) return { runId: documentName, lang: null };
  return {
    runId: documentName.slice(0, colon),
    lang: documentName.slice(colon + 1).toLowerCase() || null,
  };
}

/**
 * Extract a Tiptap-shaped JSON snapshot from a Y.Doc.
 * Tiptap stores the doc in a Y.XmlFragment named "default".
 */
function ydocToTiptapJson(ydoc: Y.Doc): any {
  const fragment = ydoc.getXmlFragment('default');
  // Y.XmlFragment.toJSON() returns the XML serialization; for the Tiptap
  // shape we mirror the structure recursively.
  const toNode = (xmlNode: any): any => {
    if (xmlNode instanceof Y.XmlText) {
      return { type: 'text', text: xmlNode.toString(), marks: xmlNode.getAttributes() };
    }
    const children: any[] = [];
    xmlNode.toArray().forEach((child: any) => children.push(toNode(child)));
    return {
      type: xmlNode.nodeName,
      attrs: xmlNode.getAttributes(),
      content: children.length ? children : undefined,
    };
  };
  return {
    type: 'doc',
    content: fragment.toArray().map(toNode),
  };
}

export function createCollabServer(): ReturnType<typeof Server.configure> {
  return Server.configure({
    name: 'coindaily-collab',

    async onAuthenticate({ token, documentName }) {
      const payload = verifyCollabToken(token);
      // P3.10 — documentName is either `${runId}` (the English doc) or
      // `${runId}:${lang}` (a per-language translation doc). The token's
      // runId must match the run prefix; the lang suffix is unrestricted.
      const { runId } = parseDocName(documentName);
      if (payload.runId !== runId) {
        throw new Error(
          `Token runId (${payload.runId}) does not match document (${documentName})`,
        );
      }
      return { userId: payload.userId, role: payload.role };
    },

    extensions: [
      new Database({
        // Load the Y.Doc binary state for a given doc, or null if first open.
        // Routes by docName: bare runId → PipelineRun; runId:lang → translation.
        fetch: async ({ documentName }) => {
          const { runId, lang } = parseDocName(documentName);
          if (lang) {
            const row = await prisma.pipelineTranslationDoc.findUnique({
              where: { runId_langCode: { runId, langCode: lang } },
              select: { docState: true },
            });
            return row?.docState ?? null;
          }
          const run = await prisma.pipelineRun.findUnique({
            where: { id: runId },
            select: { docState: true },
          });
          return run?.docState ?? null;
        },

        // Persist the Y.Doc binary state + JSON snapshot on every change.
        store: async ({ documentName, state, document }) => {
          const { runId, lang } = parseDocName(documentName);
          const docJson = ydocToTiptapJson(document);

          if (lang) {
            await prisma.pipelineTranslationDoc.upsert({
              where: { runId_langCode: { runId, langCode: lang } },
              create: {
                runId,
                langCode: lang,
                docState: Buffer.from(state),
                docJson,
              },
              update: {
                docState: Buffer.from(state),
                docJson,
              },
            });
            return;
          }

          await prisma.pipelineRun.update({
            where: { id: runId },
            data: {
              docState: Buffer.from(state),
              docJson,
            },
          });
        },
      }),
    ],
  });
}

/**
 * Attach the Hocuspocus server to an existing HTTP server's upgrade event.
 * Path: /collab — frontend connects with `new HocuspocusProvider({ url: 'ws://host/collab', ... })`.
 *
 * Uses noServer mode so it coexists with other upgrade handlers (graphql-ws,
 * market data stream, admin Socket.IO) by claiming only paths starting with /collab.
 */
export function attachCollabServer(httpServer: HttpServer): ReturnType<typeof Server.configure> {
  const collab = createCollabServer();
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const url = request.url || '';
    if (!url.startsWith('/collab')) return;
    wss.handleUpgrade(request, socket as any, head, (ws) => {
      collab.handleConnection(ws, request);
    });
  });

  console.log('[collab] Hocuspocus mounted on /collab (ws)');
  return collab;
}

/**
 * Collab Token Service
 *
 * Mints + verifies short-lived per-document tokens for the Hocuspocus
 * websocket connection. Separate from the main admin JWT so a leaked
 * collab token grants access only to one PipelineRun, for one hour,
 * for editing purposes only.
 *
 * Flow:
 *   admin opens /admin/review/[runId]
 *     → frontend GET /api/admin/pipeline-runs/:runId/collab-token
 *     → backend mints token { runId, userId, role } signed with COLLAB_TOKEN_SECRET
 *     → frontend opens WS to /collab?token=…&doc=<runId>
 *     → Hocuspocus onAuthenticate verifies token + doc matches runId
 */

import jwt from 'jsonwebtoken';

const TOKEN_TTL_SECONDS = 60 * 60; // 1 hour

function getSecret(): string {
  const secret = process.env.COLLAB_TOKEN_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('COLLAB_TOKEN_SECRET (or JWT_SECRET fallback) must be set');
  }
  return secret;
}

export interface CollabTokenPayload {
  runId: string;
  userId: string;
  role: 'editor' | 'viewer';
}

export function mintCollabToken(payload: CollabTokenPayload): { token: string; expiresIn: number } {
  const token = jwt.sign(payload, getSecret(), {
    expiresIn: TOKEN_TTL_SECONDS,
    issuer: 'coindaily-collab',
  });
  return { token, expiresIn: TOKEN_TTL_SECONDS };
}

export function verifyCollabToken(token: string): CollabTokenPayload {
  const decoded = jwt.verify(token, getSecret(), {
    issuer: 'coindaily-collab',
  }) as CollabTokenPayload & { iat: number; exp: number };

  if (!decoded.runId || !decoded.userId) {
    throw new Error('Collab token missing required claims');
  }

  return {
    runId: decoded.runId,
    userId: decoded.userId,
    role: decoded.role || 'viewer',
  };
}

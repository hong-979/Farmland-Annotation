import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export type UserRole = 'admin' | 'annotator';
export type UserStatus = 'active' | 'disabled';

export type AuthenticatedUser = {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
};

type SessionRow = AuthenticatedUser & {
  sessionId: string;
};

const SESSION_COOKIE_NAME = 'annotation_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;
const DEFAULT_SESSION_SECRET = 'development-session-secret';

export function createSession(database: DatabaseSync, userId: number) {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  database
    .prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`)
    .run(sessionId, userId, expiresAt);

  return sessionId;
}

export function deleteSession(database: DatabaseSync, sessionId: string) {
  database.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
}

export function getUserFromRequestCookie(
  database: DatabaseSync,
  cookieHeader: string | undefined,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const sessionId = readSessionIdFromCookieHeader(cookieHeader, environment);

  if (!sessionId) {
    return null;
  }

  const row = database
    .prepare(
      `
        SELECT
          users.id,
          users.username,
          users.display_name AS displayName,
          users.role,
          users.status,
          sessions.id AS sessionId
        FROM sessions
        INNER JOIN users ON users.id = sessions.user_id
        WHERE sessions.id = ? AND sessions.expires_at > ?
        LIMIT 1
      `,
    )
    .get(sessionId, new Date().toISOString()) as SessionRow | undefined;

  if (!row) {
    return null;
  }

  return {
    sessionId: row.sessionId,
    user: {
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      role: row.role,
      status: row.status,
    },
  };
}

export function serializeSessionCookie(
  sessionId: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  return serializeCookie(
    SESSION_COOKIE_NAME,
    signValue(sessionId, getSessionSecret(environment)),
    SESSION_DURATION_MS,
  );
}

export function serializeClearedSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readSessionIdFromCookieHeader(
  cookieHeader: string | undefined,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';');
  const sessionCookie = cookies.find((cookie) => cookie.trim().startsWith(`${SESSION_COOKIE_NAME}=`));

  if (!sessionCookie) {
    return null;
  }

  const signedValue = sessionCookie.trim().slice(`${SESSION_COOKIE_NAME}=`.length);
  return unsignValue(signedValue, getSessionSecret(environment));
}

function serializeCookie(name: string, value: string, maxAgeMs: number) {
  const maxAgeSeconds = Math.floor(maxAgeMs / 1000);
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function getSessionSecret(environment: NodeJS.ProcessEnv) {
  return (
    environment.SESSION_SECRET ||
    environment.ANNOTATION_SESSION_SECRET ||
    DEFAULT_SESSION_SECRET
  );
}

function signValue(value: string, secret: string) {
  const signature = createHmac('sha256', secret).update(value).digest('hex');
  return `${value}.${signature}`;
}

function unsignValue(signedValue: string, secret: string) {
  const separatorIndex = signedValue.lastIndexOf('.');

  if (separatorIndex <= 0) {
    return null;
  }

  const value = signedValue.slice(0, separatorIndex);
  const signature = signedValue.slice(separatorIndex + 1);
  const expectedSignature = createHmac('sha256', secret).update(value).digest('hex');
  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  return value;
}

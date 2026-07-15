import { Router } from 'express';

import type { UserRole, UserStatus } from '../auth/session.js';
import { verifyPassword } from '../auth/passwords.js';
import {
  createSession,
  deleteSession,
  readSessionIdFromCookieHeader,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from '../auth/session.js';
import { ensureBootstrapAdmin } from '../db/bootstrapAdmin.js';
import type { DatabaseProvider } from '../db/database.js';
import { createRequireAuth } from '../middleware/requireAuth.js';

type AuthRoutesOptions = {
  databaseProvider: DatabaseProvider;
  environment?: NodeJS.ProcessEnv;
};

export function createAuthRoutes({
  databaseProvider,
  environment = process.env,
}: AuthRoutesOptions) {
  const router = Router();
  const requireAuth = createRequireAuth(databaseProvider, environment);

  router.post('/login', (request, response) => {
    const username = normalizeUsername(request.body?.username);
    const password = request.body?.password;

    if (!username || typeof password !== 'string' || password.length === 0) {
      response.status(400).json({ error: '用户名和密码不能为空。' });
      return;
    }

    const database = databaseProvider.getDatabase();
    ensureBootstrapAdmin(database, environment);

    const user = database
      .prepare(
        `
          SELECT
            id,
            username,
            display_name AS displayName,
            role,
            status,
            password_hash AS passwordHash
          FROM users
          WHERE username = ?
          LIMIT 1
        `,
      )
      .get(username) as
      | {
          id: number;
          username: string;
          displayName: string;
          role: UserRole;
          status: UserStatus;
          passwordHash: string;
        }
      | undefined;

    if (!user || !verifyPassword(password, user.passwordHash)) {
      response.status(401).json({ error: '用户名或密码错误，请检查后重试。' });
      return;
    }

    if (user.status !== 'active') {
      response.status(403).json({ error: '账号已停用，无法继续使用，请联系管理员。' });
      return;
    }

    const sessionId = createSession(database, user.id);
    response.setHeader('set-cookie', serializeSessionCookie(sessionId, environment));
    response.status(200).json({
      user: serializeUser(user),
    });
  });

  router.post('/logout', (request, response) => {
    const database = databaseProvider.getDatabase();
    ensureBootstrapAdmin(database, environment);

    const sessionId = readSessionIdFromCookieHeader(request.headers.cookie, environment);

    if (sessionId) {
      deleteSession(database, sessionId);
    }

    response.setHeader('set-cookie', serializeClearedSessionCookie());
    response.status(204).send();
  });

  router.get('/me', requireAuth, (request, response) => {
    response.status(200).json({
      user: serializeUser(request.authenticatedUser),
    });
  });

  return router;
}

function normalizeUsername(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  return normalized;
}

function serializeUser(
  user:
    | {
        username: string;
        displayName: string;
        role: UserRole;
      }
    | undefined,
) {
  return {
    username: user?.username,
    displayName: user?.displayName,
    role: user?.role,
  };
}

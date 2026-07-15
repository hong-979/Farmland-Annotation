import type { NextFunction, Request, Response } from 'express';

import {
  deleteSession,
  getUserFromRequestCookie,
  serializeClearedSessionCookie,
  type AuthenticatedUser,
  type UserRole,
} from '../auth/session.js';
import { ensureBootstrapAdmin } from '../db/bootstrapAdmin.js';
import type { DatabaseProvider } from '../db/database.js';

declare module 'express-serve-static-core' {
  interface Request {
    authenticatedUser?: AuthenticatedUser;
    sessionId?: string;
  }
}

export function createRequireAuth(
  databaseProvider: DatabaseProvider,
  environment: NodeJS.ProcessEnv = process.env,
) {
  return function requireAuth(request: Request, response: Response, next: NextFunction) {
    const database = databaseProvider.getDatabase();
    ensureBootstrapAdmin(database, environment);

    const authenticatedSession = getUserFromRequestCookie(
      database,
      request.headers.cookie,
      environment,
    );

    if (!authenticatedSession) {
      response.status(401).json({ error: '当前登录状态已失效，请重新登录。' });
      return;
    }

    if (authenticatedSession.user.status !== 'active') {
      deleteSession(database, authenticatedSession.sessionId);
      response.setHeader('set-cookie', serializeClearedSessionCookie());
      response.status(403).json({ error: '账号已停用，无法继续使用，请联系管理员。' });
      return;
    }

    request.authenticatedUser = authenticatedSession.user;
    request.sessionId = authenticatedSession.sessionId;
    next();
  };
}

export function createRequireRole(...allowedRoles: UserRole[]) {
  return function requireRole(request: Request, response: Response, next: NextFunction) {
    const role = request.authenticatedUser?.role;

    if (!role) {
      response.status(401).json({ error: '当前登录状态已失效，请重新登录。' });
      return;
    }

    if (!allowedRoles.includes(role)) {
      response.status(403).json({ error: '当前账号无权执行此操作。' });
      return;
    }

    next();
  };
}

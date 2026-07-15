// @vitest-environment node

import express from 'express';
import { mkdtempSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../../server/app';
import { hashPassword } from '../../server/auth/passwords';
import { createDatabaseProvider } from '../../server/db/database';
import { createRequireAuth, createRequireRole } from '../../server/middleware/requireAuth';
import { createAuthRoutes } from '../../server/routes/authRoutes';

type RunningServer = {
  server: Server;
  baseUrl: string;
};

const SESSION_SECRET = 'test-session-secret';
const AUTH_REQUIRED_MESSAGE =
  '\u5f53\u524d\u767b\u5f55\u72b6\u6001\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u3002';
const DISABLED_MESSAGE =
  '\u8d26\u53f7\u5df2\u505c\u7528\uff0c\u65e0\u6cd5\u7ee7\u7eed\u4f7f\u7528\uff0c\u8bf7\u8054\u7cfb\u7ba1\u7406\u5458\u3002';
const FORBIDDEN_MESSAGE =
  '\u5f53\u524d\u8d26\u53f7\u65e0\u6743\u6267\u884c\u6b64\u64cd\u4f5c\u3002';

async function startServer(environment: NodeJS.ProcessEnv): Promise<RunningServer> {
  return startServerWithApp(createApp({ environment }));
}

async function startServerWithApp(app: ReturnType<typeof express>): Promise<RunningServer> {
  const server = createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Server did not bind to an ephemeral port.');
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function stopServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function createEnvironment(): NodeJS.ProcessEnv {
  const directory = mkdtempSync(join(tmpdir(), 'annotation-auth-test-'));

  return {
    ANNOTATION_DB_PATH: join(directory, 'annotation.sqlite'),
    BOOTSTRAP_ADMIN_USERNAME: 'admin',
    BOOTSTRAP_ADMIN_PASSWORD: 'S3curePassw0rd!',
    BOOTSTRAP_ADMIN_DISPLAY_NAME: 'System Admin',
    ANNOTATION_SESSION_SECRET: SESSION_SECRET,
    NODE_ENV: 'test',
  };
}

describe('auth routes', () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => stopServer(server)));
  });

  it('bootstraps the first admin and returns it from GET /api/auth/me after login', async () => {
    const environment = createEnvironment();
    const runningServer = await startServer(environment);
    servers.push(runningServer.server);

    const loginResponse = await fetch(`${runningServer.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: environment.BOOTSTRAP_ADMIN_USERNAME,
        password: environment.BOOTSTRAP_ADMIN_PASSWORD,
      }),
    });

    expect(loginResponse.status).toBe(200);
    await expect(loginResponse.json()).resolves.toEqual({
      user: {
        username: environment.BOOTSTRAP_ADMIN_USERNAME,
        displayName: environment.BOOTSTRAP_ADMIN_DISPLAY_NAME,
        role: 'admin',
      },
    });

    const sessionCookie = loginResponse.headers.get('set-cookie');
    expect(sessionCookie).toContain('annotation_session=');

    const meResponse = await fetch(`${runningServer.baseUrl}/api/auth/me`, {
      headers: {
        cookie: sessionCookie ?? '',
      },
    });

    expect(meResponse.status).toBe(200);
    await expect(meResponse.json()).resolves.toEqual({
      user: {
        username: environment.BOOTSTRAP_ADMIN_USERNAME,
        displayName: environment.BOOTSTRAP_ADMIN_DISPLAY_NAME,
        role: 'admin',
      },
    });

    const database = new DatabaseSync(environment.ANNOTATION_DB_PATH!);
    const storedUser = database
      .prepare(
        `
          SELECT username, display_name AS displayName, role, status
          FROM users
          LIMIT 1
        `,
      )
      .get() as
      | { username: string; displayName: string; role: string; status: string }
      | undefined;
    database.close();

    expect(storedUser).toEqual({
      username: environment.BOOTSTRAP_ADMIN_USERNAME,
      displayName: environment.BOOTSTRAP_ADMIN_DISPLAY_NAME,
      role: 'admin',
      status: 'active',
    });
  });

  it('rejects GET /api/auth/me when there is no authenticated session cookie', async () => {
    const runningServer = await startServer(createEnvironment());
    servers.push(runningServer.server);

    const response = await fetch(`${runningServer.baseUrl}/api/auth/me`);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: AUTH_REQUIRED_MESSAGE });
  });

  it('clears the session on logout and rejects the old cookie afterwards', async () => {
    const environment = createEnvironment();
    const runningServer = await startServer(environment);
    servers.push(runningServer.server);

    const loginResponse = await fetch(`${runningServer.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: environment.BOOTSTRAP_ADMIN_USERNAME,
        password: environment.BOOTSTRAP_ADMIN_PASSWORD,
      }),
    });

    expect(loginResponse.status).toBe(200);
    const sessionCookie = loginResponse.headers.get('set-cookie');

    const logoutResponse = await fetch(`${runningServer.baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        cookie: sessionCookie ?? '',
      },
    });

    expect(logoutResponse.status).toBe(204);
    expect(logoutResponse.headers.get('set-cookie')).toContain('annotation_session=');
    expect(logoutResponse.headers.get('set-cookie')).toContain('Max-Age=0');

    const meResponse = await fetch(`${runningServer.baseUrl}/api/auth/me`, {
      headers: {
        cookie: sessionCookie ?? '',
      },
    });

    expect(meResponse.status).toBe(401);
    await expect(meResponse.json()).resolves.toEqual({ error: AUTH_REQUIRED_MESSAGE });
  });

  it('rejects disabled users during login and for existing sessions', async () => {
    const environment = createEnvironment();
    const runningServer = await startServer(environment);
    servers.push(runningServer.server);

    const loginResponse = await fetch(`${runningServer.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: environment.BOOTSTRAP_ADMIN_USERNAME,
        password: environment.BOOTSTRAP_ADMIN_PASSWORD,
      }),
    });

    expect(loginResponse.status).toBe(200);

    const sessionCookie = loginResponse.headers.get('set-cookie');
    const database = new DatabaseSync(environment.ANNOTATION_DB_PATH!);
    database.prepare(`UPDATE users SET status = 'disabled' WHERE username = ?`).run('admin');
    database.close();

    const meResponse = await fetch(`${runningServer.baseUrl}/api/auth/me`, {
      headers: {
        cookie: sessionCookie ?? '',
      },
    });

    expect(meResponse.status).toBe(403);
    await expect(meResponse.json()).resolves.toEqual({
      error: DISABLED_MESSAGE,
    });

    const reloginResponse = await fetch(`${runningServer.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: environment.BOOTSTRAP_ADMIN_USERNAME,
        password: environment.BOOTSTRAP_ADMIN_PASSWORD,
      }),
    });

    expect(reloginResponse.status).toBe(403);
    await expect(reloginResponse.json()).resolves.toEqual({
      error: DISABLED_MESSAGE,
    });
  });

  it('bootstraps the first admin during app startup before any auth request arrives', () => {
    const environment = createEnvironment();
    createApp({ environment });

    const database = new DatabaseSync(environment.ANNOTATION_DB_PATH!);
    const user = database
      .prepare(
        `
          SELECT username, display_name AS displayName, role, status
          FROM users
          LIMIT 1
        `,
      )
      .get() as
      | { username: string; displayName: string; role: string; status: string }
      | undefined;
    database.close();

    expect(user).toEqual({
      username: environment.BOOTSTRAP_ADMIN_USERNAME,
      displayName: environment.BOOTSTRAP_ADMIN_DISPLAY_NAME,
      role: 'admin',
      status: 'active',
    });
  });

  it('blocks authenticated users whose role does not match the protected route', async () => {
    const environment = createEnvironment();
    const databaseProvider = createDatabaseProvider(environment);
    const app = express();

    app.use(express.json());
    app.use(
      '/api/auth',
      createAuthRoutes({
        databaseProvider,
        environment,
      }),
    );

    const requireAuth = createRequireAuth(databaseProvider, environment);
    const requireAdmin = createRequireRole('admin');
    app.get('/api/admin-only', requireAuth, requireAdmin, (_request, response) => {
      response.status(200).json({ ok: true });
    });

    const database = databaseProvider.getDatabase();
    database
      .prepare(
        `
          INSERT INTO users (username, password_hash, role, display_name, status)
          VALUES (?, ?, ?, ?, ?)
        `,
      )
      .run(
        'annotator-1',
        hashPassword('AnnotatorPass1!'),
        'annotator',
        'Annotator One',
        'active',
      );

    const runningServer = await startServerWithApp(app);
    servers.push(runningServer.server);

    const loginResponse = await fetch(`${runningServer.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: 'annotator-1',
        password: 'AnnotatorPass1!',
      }),
    });

    expect(loginResponse.status).toBe(200);

    const protectedResponse = await fetch(`${runningServer.baseUrl}/api/admin-only`, {
      headers: {
        cookie: loginResponse.headers.get('set-cookie') ?? '',
      },
    });

    expect(protectedResponse.status).toBe(403);
    await expect(protectedResponse.json()).resolves.toEqual({
      error: FORBIDDEN_MESSAGE,
    });
  });

  it('allows admin users through the protected role guard', async () => {
    const environment = createEnvironment();
    const databaseProvider = createDatabaseProvider(environment);
    const app = express();

    app.use(express.json());
    app.use(
      '/api/auth',
      createAuthRoutes({
        databaseProvider,
        environment,
      }),
    );

    const requireAuth = createRequireAuth(databaseProvider, environment);
    const requireAdmin = createRequireRole('admin');
    app.get('/api/admin-only', requireAuth, requireAdmin, (_request, response) => {
      response.status(200).json({ ok: true });
    });

    const runningServer = await startServerWithApp(app);
    servers.push(runningServer.server);

    const loginResponse = await fetch(`${runningServer.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: environment.BOOTSTRAP_ADMIN_USERNAME,
        password: environment.BOOTSTRAP_ADMIN_PASSWORD,
      }),
    });

    expect(loginResponse.status).toBe(200);

    const protectedResponse = await fetch(`${runningServer.baseUrl}/api/admin-only`, {
      headers: {
        cookie: loginResponse.headers.get('set-cookie') ?? '',
      },
    });

    expect(protectedResponse.status).toBe(200);
    await expect(protectedResponse.json()).resolves.toEqual({ ok: true });
  });

  it('supports legacy ANNOTATION_ADMIN_* bootstrap variables for backward compatibility', async () => {
    const environment = createEnvironment();
    delete environment.BOOTSTRAP_ADMIN_USERNAME;
    delete environment.BOOTSTRAP_ADMIN_PASSWORD;
    delete environment.BOOTSTRAP_ADMIN_DISPLAY_NAME;
    environment.ANNOTATION_ADMIN_USERNAME = 'legacy-admin';
    environment.ANNOTATION_ADMIN_PASSWORD = 'LegacyPass123!';
    environment.ANNOTATION_ADMIN_DISPLAY_NAME = 'Legacy Admin';

    const runningServer = await startServer(environment);
    servers.push(runningServer.server);

    const loginResponse = await fetch(`${runningServer.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: 'legacy-admin',
        password: 'LegacyPass123!',
      }),
    });

    expect(loginResponse.status).toBe(200);
    await expect(loginResponse.json()).resolves.toEqual({
      user: {
        username: 'legacy-admin',
        displayName: 'Legacy Admin',
        role: 'admin',
      },
    });
  });

  it('uses SESSION_SECRET from the deployment contract when ANNOTATION_SESSION_SECRET is unset', async () => {
    const environment = createEnvironment();
    delete environment.ANNOTATION_SESSION_SECRET;
    environment.SESSION_SECRET = 'session-secret-from-plan';

    const runningServer = await startServer(environment);
    servers.push(runningServer.server);

    const loginResponse = await fetch(`${runningServer.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: environment.BOOTSTRAP_ADMIN_USERNAME,
        password: environment.BOOTSTRAP_ADMIN_PASSWORD,
      }),
    });

    expect(loginResponse.status).toBe(200);

    const sessionCookie = loginResponse.headers.get('set-cookie');
    expect(sessionCookie).toContain('annotation_session=');

    const meResponse = await fetch(`${runningServer.baseUrl}/api/auth/me`, {
      headers: {
        cookie: sessionCookie ?? '',
      },
    });

    expect(meResponse.status).toBe(200);
    await expect(meResponse.json()).resolves.toEqual({
      user: {
        username: environment.BOOTSTRAP_ADMIN_USERNAME,
        displayName: environment.BOOTSTRAP_ADMIN_DISPLAY_NAME,
        role: 'admin',
      },
    });
  });

  it('fails fast when the bootstrap admin username is already occupied by a non-admin user', () => {
    const environment = createEnvironment();
    const databaseProvider = createDatabaseProvider(environment);
    const database = databaseProvider.getDatabase();

    database
      .prepare(
        `
          INSERT INTO users (username, password_hash, role, display_name, status)
          VALUES (?, ?, ?, ?, ?)
        `,
      )
      .run(
        'admin',
        hashPassword('AnnotatorPass1!'),
        'annotator',
        'Occupied Account',
        'active',
      );

    expect(() => createApp({ environment })).toThrowError(
      'Bootstrap admin username "admin" is already used by a non-admin account.',
    );
  });
});

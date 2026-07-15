// @vitest-environment node

import { createServer, type Server } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../server/app';

describe('server app smoke', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer(
      createApp({
        environment: {
          ANNOTATION_DB_PATH: join(mkdtempSync(join(tmpdir(), 'annotation-app-smoke-')), 'app.sqlite'),
          BOOTSTRAP_ADMIN_USERNAME: 'admin',
          BOOTSTRAP_ADMIN_PASSWORD: 'SmokePass123!',
          BOOTSTRAP_ADMIN_DISPLAY_NAME: 'Smoke Admin',
          ANNOTATION_SESSION_SECRET: 'smoke-session-secret',
          NODE_ENV: 'test',
        },
      }),
    );

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Server did not bind to an ephemeral port.');
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  it('returns the health payload on GET /api/health', async () => {
    const response = await fetch(`${baseUrl}/api/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('serves the built web app shell for non-api routes when a dist directory is available', async () => {
    const webDistPath = mkdtempSync(join(tmpdir(), 'annotation-web-dist-'));
    mkdirSync(join(webDistPath, 'assets'));
    writeFileSync(
      join(webDistPath, 'index.html'),
      '<!doctype html><html><body><div id="root">annotation service</div></body></html>',
      'utf8',
    );
    writeFileSync(join(webDistPath, 'assets', 'app.txt'), 'asset-ok', 'utf8');
    const staticServer = createServer(
      createApp({
        environment: {
          ANNOTATION_DB_PATH: join(mkdtempSync(join(tmpdir(), 'annotation-app-static-')), 'app.sqlite'),
          BOOTSTRAP_ADMIN_USERNAME: 'admin',
          BOOTSTRAP_ADMIN_PASSWORD: 'SmokePass123!',
          BOOTSTRAP_ADMIN_DISPLAY_NAME: 'Smoke Admin',
          ANNOTATION_SESSION_SECRET: 'smoke-session-secret',
          NODE_ENV: 'test',
        },
        webDistPath,
      }),
    );

    await new Promise<void>((resolve) => {
      staticServer.listen(0, '127.0.0.1', () => resolve());
    });

    const address = staticServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('Static server did not bind to an ephemeral port.');
    }

    const staticBaseUrl = `http://127.0.0.1:${address.port}`;

    const shellResponse = await fetch(`${staticBaseUrl}/admin`);
    expect(shellResponse.status).toBe(200);
    await expect(shellResponse.text()).resolves.toContain('annotation service');

    const assetResponse = await fetch(`${staticBaseUrl}/assets/app.txt`);
    expect(assetResponse.status).toBe(200);
    await expect(assetResponse.text()).resolves.toBe('asset-ok');

    await new Promise<void>((resolve, reject) => {
      staticServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });
});

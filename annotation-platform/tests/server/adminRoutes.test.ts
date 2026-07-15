// @vitest-environment node

import { mkdtempSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../../server/app';

type RunningServer = {
  server: Server;
  baseUrl: string;
  environment: NodeJS.ProcessEnv;
};

async function createPdfBytes(text: string) {
  const document = await PDFDocument.create();
  const page = document.addPage([400, 200]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText(text, {
    x: 40,
    y: 120,
    size: 18,
    font,
  });
  return Buffer.from(await document.save());
}

function createEnvironment(): NodeJS.ProcessEnv {
  const directory = mkdtempSync(join(tmpdir(), 'annotation-admin-routes-'));

  return {
    ANNOTATION_DB_PATH: join(directory, 'annotation.sqlite'),
    BOOTSTRAP_ADMIN_USERNAME: 'admin',
    BOOTSTRAP_ADMIN_PASSWORD: 'S3curePassw0rd!',
    BOOTSTRAP_ADMIN_DISPLAY_NAME: 'System Admin',
    SESSION_SECRET: 'admin-route-secret',
    NODE_ENV: 'test',
  };
}

async function startServer(environment: NodeJS.ProcessEnv): Promise<RunningServer> {
  const app = createApp({ environment });
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
    environment,
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

async function loginAsAdmin(runningServer: RunningServer) {
  const response = await fetch(`${runningServer.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      username: runningServer.environment.BOOTSTRAP_ADMIN_USERNAME,
      password: runningServer.environment.BOOTSTRAP_ADMIN_PASSWORD,
    }),
  });

  expect(response.status).toBe(200);
  const cookie = response.headers.get('set-cookie');
  expect(cookie).toContain('annotation_session=');
  return cookie ?? '';
}

describe('admin routes', () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => stopServer(server)));
  });

  it('creates an annotator account and lists it for the admin', async () => {
    const runningServer = await startServer(createEnvironment());
    servers.push(runningServer.server);

    const adminCookie = await loginAsAdmin(runningServer);

    const createUserResponse = await fetch(`${runningServer.baseUrl}/api/admin/users`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: adminCookie,
      },
      body: JSON.stringify({
        username: 'annotator-1',
        password: 'AnnotatorPass1!',
        displayName: 'Annotator One',
      }),
    });

    expect(createUserResponse.status).toBe(201);
    await expect(createUserResponse.json()).resolves.toEqual({
      user: {
        id: expect.any(Number),
        username: 'annotator-1',
        displayName: 'Annotator One',
        role: 'annotator',
        status: 'active',
      },
    });

    const listUsersResponse = await fetch(`${runningServer.baseUrl}/api/admin/users`, {
      headers: {
        cookie: adminCookie,
      },
    });

    expect(listUsersResponse.status).toBe(200);
    await expect(listUsersResponse.json()).resolves.toEqual({
      users: expect.arrayContaining([
        expect.objectContaining({
          username: 'annotator-1',
          displayName: 'Annotator One',
          role: 'annotator',
          status: 'active',
        }),
      ]),
    });
  });

  it('uploads a JSON and PDF document and creates pending tasks', async () => {
    const runningServer = await startServer(createEnvironment());
    servers.push(runningServer.server);

    const adminCookie = await loginAsAdmin(runningServer);
    const payload = {
      project_code: 'demo-001',
      output: [
        {
          label: 'water',
          review_point: 'Check water item',
          verification_status: '',
          evidence_fragments: [],
          judgment_basis: '',
        },
        {
          label: 'road',
          review_point: 'Check road item',
          verification_status: '',
          evidence_fragments: [],
          judgment_basis: '',
        },
      ],
    };

    const formData = new FormData();
    formData.set('title', 'Demo Document');
    formData.set(
      'jsonFile',
      new Blob([JSON.stringify(payload)], { type: 'application/json' }),
      'demo.json',
    );
    formData.set(
      'pdfFile',
      new Blob([await createPdfBytes('Demo PDF')], { type: 'application/pdf' }),
      'demo.pdf',
    );

    const uploadResponse = await fetch(`${runningServer.baseUrl}/api/admin/documents`, {
      method: 'POST',
      headers: {
        cookie: adminCookie,
      },
      body: formData,
    });

    expect(uploadResponse.status).toBe(201);
    await expect(uploadResponse.json()).resolves.toEqual({
      document: expect.objectContaining({
        id: expect.any(Number),
        title: 'Demo Document',
        taskCount: 2,
      }),
    });

    const database = new DatabaseSync(runningServer.environment.ANNOTATION_DB_PATH!);
    const tasks = database
      .prepare(
        `
          SELECT task_index AS taskIndex, label, review_point AS reviewPoint, status
          FROM tasks
          ORDER BY task_index ASC
        `,
      )
      .all() as Array<{
      taskIndex: number;
      label: string | null;
      reviewPoint: string;
      status: string;
    }>;
    database.close();

    expect(tasks).toEqual([
      {
        taskIndex: 0,
        label: 'water',
        reviewPoint: 'Check water item',
        status: 'pending',
      },
      {
        taskIndex: 1,
        label: 'road',
        reviewPoint: 'Check road item',
        status: 'pending',
      },
    ]);
  });

  it('reclaims a claimed task back to pending and records history', async () => {
    const runningServer = await startServer(createEnvironment());
    servers.push(runningServer.server);

    const adminCookie = await loginAsAdmin(runningServer);

    const formData = new FormData();
    formData.set('title', 'Claimed Document');
    formData.set(
      'jsonFile',
      new Blob(
        [
          JSON.stringify({
            output: [
              {
                label: 'water',
                review_point: 'Check reclaim',
                verification_status: '',
                evidence_fragments: [],
                judgment_basis: '',
              },
            ],
          }),
        ],
        { type: 'application/json' },
      ),
      'claimed.json',
    );
    formData.set(
      'pdfFile',
      new Blob([await createPdfBytes('Claimed PDF')], { type: 'application/pdf' }),
      'claimed.pdf',
    );

    const uploadResponse = await fetch(`${runningServer.baseUrl}/api/admin/documents`, {
      method: 'POST',
      headers: {
        cookie: adminCookie,
      },
      body: formData,
    });
    const uploaded = (await uploadResponse.json()) as { document: { id: number } };

    const database = new DatabaseSync(runningServer.environment.ANNOTATION_DB_PATH!);
    const adminUser = database
      .prepare(`SELECT id FROM users WHERE username = ? LIMIT 1`)
      .get('admin') as { id: number };
    const annotatorUser = database
      .prepare(
        `
          INSERT INTO users (username, password_hash, role, display_name, status)
          VALUES (?, ?, 'annotator', ?, 'active')
          RETURNING id
        `,
      )
      .get('annotator-1', 'placeholder-hash', 'Annotator One') as { id: number };
    const task = database
      .prepare(`SELECT id FROM tasks WHERE document_id = ? LIMIT 1`)
      .get(uploaded.document.id) as { id: number };

    database
      .prepare(
        `
          UPDATE tasks
          SET status = 'claimed', claimed_by = ?, claimed_at = '2026-07-15T10:00:00.000Z'
          WHERE id = ?
        `,
      )
      .run(annotatorUser.id, task.id);
    database
      .prepare(
        `
          INSERT INTO task_history (task_id, actor_user_id, action_type, snapshot_json)
          VALUES (?, ?, 'claim', ?)
        `,
      )
      .run(task.id, annotatorUser.id, JSON.stringify({ status: 'claimed' }));
    database.close();

    const reclaimResponse = await fetch(`${runningServer.baseUrl}/api/admin/tasks/${task.id}/reclaim`, {
      method: 'POST',
      headers: {
        cookie: adminCookie,
      },
    });

    expect(reclaimResponse.status).toBe(200);
    await expect(reclaimResponse.json()).resolves.toEqual({
      task: expect.objectContaining({
        id: task.id,
        status: 'pending',
        claimedBy: null,
      }),
    });

    const verifyDatabase = new DatabaseSync(runningServer.environment.ANNOTATION_DB_PATH!);
    const storedTask = verifyDatabase
      .prepare(`SELECT status, claimed_by AS claimedBy, claimed_at AS claimedAt FROM tasks WHERE id = ?`)
      .get(task.id) as { status: string; claimedBy: number | null; claimedAt: string | null };
    const historyActions = verifyDatabase
      .prepare(`SELECT action_type AS actionType, actor_user_id AS actorUserId FROM task_history WHERE task_id = ? ORDER BY id ASC`)
      .all(task.id) as Array<{ actionType: string; actorUserId: number }>;
    verifyDatabase.close();

    expect(storedTask).toEqual({
      status: 'pending',
      claimedBy: null,
      claimedAt: null,
    });
    expect(historyActions).toEqual([
      { actionType: 'claim', actorUserId: annotatorUser.id },
      { actionType: 'reclaim', actorUserId: adminUser.id },
    ]);
  });

  it('exports partial JSON using the latest current task payloads and blocks final export early', async () => {
    const runningServer = await startServer(createEnvironment());
    servers.push(runningServer.server);

    const adminCookie = await loginAsAdmin(runningServer);

    const formData = new FormData();
    formData.set('title', 'Export Document');
    formData.set(
      'jsonFile',
      new Blob(
        [
          JSON.stringify({
            root_extension: { keep: true },
            output: [
              {
                label: 'water',
                review_point: 'Check export',
                verification_status: '',
                evidence_fragments: [],
                judgment_basis: '',
              },
            ],
          }),
        ],
        { type: 'application/json' },
      ),
      'export.json',
    );
    formData.set(
      'pdfFile',
      new Blob([await createPdfBytes('Export PDF')], { type: 'application/pdf' }),
      'export.pdf',
    );

    const uploadResponse = await fetch(`${runningServer.baseUrl}/api/admin/documents`, {
      method: 'POST',
      headers: {
        cookie: adminCookie,
      },
      body: formData,
    });
    const uploaded = (await uploadResponse.json()) as { document: { id: number } };

    const database = new DatabaseSync(runningServer.environment.ANNOTATION_DB_PATH!);
    database
      .prepare(`UPDATE tasks SET current_payload_json = ? WHERE document_id = ?`)
      .run(
        JSON.stringify({
          label: 'water',
          review_point: 'Check export',
          verification_status: '[姝ｇ‘]',
          evidence_fragments: [],
          judgment_basis: 'Latest draft',
        }),
        uploaded.document.id,
      );
    database.close();

    const partialResponse = await fetch(
      `${runningServer.baseUrl}/api/admin/documents/${uploaded.document.id}/export`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: adminCookie,
        },
        body: JSON.stringify({ mode: 'partial' }),
      },
    );

    expect(partialResponse.status).toBe(200);
    const partialBody = (await partialResponse.json()) as {
      root_extension: { keep: boolean };
      output: Array<{ verification_status: string; judgment_basis: string }>;
    };
    expect(partialBody.root_extension).toEqual({ keep: true });
    expect(partialBody.output[0]).toMatchObject({
      verification_status: '[姝ｇ‘]',
      judgment_basis: 'Latest draft',
    });

    const finalResponse = await fetch(
      `${runningServer.baseUrl}/api/admin/documents/${uploaded.document.id}/export`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: adminCookie,
        },
        body: JSON.stringify({ mode: 'final' }),
      },
    );

    expect(finalResponse.status).toBe(409);
    await expect(finalResponse.json()).resolves.toEqual({
      error: '文档尚未全部提交，暂时不能导出完整结果。',
    });
  });
});

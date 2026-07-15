// @vitest-environment node

import { mkdtempSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  const directory = mkdtempSync(join(tmpdir(), 'annotation-annotator-routes-'));

  return {
    ANNOTATION_DB_PATH: join(directory, 'annotation.sqlite'),
    BOOTSTRAP_ADMIN_USERNAME: 'admin',
    BOOTSTRAP_ADMIN_PASSWORD: 'S3curePassw0rd!',
    BOOTSTRAP_ADMIN_DISPLAY_NAME: 'System Admin',
    SESSION_SECRET: 'annotator-route-secret',
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

async function login(
  runningServer: RunningServer,
  username: string,
  password: string,
) {
  const response = await fetch(`${runningServer.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      username,
      password,
    }),
  });

  expect(response.status).toBe(200);
  return response.headers.get('set-cookie') ?? '';
}

async function createAnnotator(
  runningServer: RunningServer,
  adminCookie: string,
  username = 'annotator-1',
) {
  const response = await fetch(`${runningServer.baseUrl}/api/admin/users`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: adminCookie,
    },
    body: JSON.stringify({
      username,
      password: 'AnnotatorPass1!',
      displayName: 'Annotator One',
    }),
  });

  expect(response.status).toBe(201);
}

async function uploadDocument(runningServer: RunningServer, adminCookie: string, title: string) {
  const formData = new FormData();
  formData.set('title', title);
  formData.set(
    'jsonFile',
    new Blob(
      [
        JSON.stringify({
          output: [
            {
              label: 'water',
              review_point: 'Check water item',
              verification_status: '',
              evidence_fragments: [],
              judgment_basis: '',
            },
          ],
        }),
      ],
      { type: 'application/json' },
    ),
    `${title}.json`,
  );
  formData.set(
    'pdfFile',
    new Blob([await createPdfBytes(title)], { type: 'application/pdf' }),
    `${title}.pdf`,
  );

  const response = await fetch(`${runningServer.baseUrl}/api/admin/documents`, {
    method: 'POST',
    headers: {
      cookie: adminCookie,
    },
    body: formData,
  });

  expect(response.status).toBe(201);
  return (await response.json()) as { document: { id: number } };
}

describe('annotator routes', () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => stopServer(server)));
  });

  it('rejects claim-next when the annotator already has a claimed task', async () => {
    const runningServer = await startServer(createEnvironment());
    servers.push(runningServer.server);

    const adminCookie = await login(runningServer, 'admin', 'S3curePassw0rd!');
    await createAnnotator(runningServer, adminCookie);
    await uploadDocument(runningServer, adminCookie, 'first-doc');
    await uploadDocument(runningServer, adminCookie, 'second-doc');

    const annotatorCookie = await login(runningServer, 'annotator-1', 'AnnotatorPass1!');

    const firstClaimResponse = await fetch(`${runningServer.baseUrl}/api/annotator/tasks/claim-next`, {
      method: 'POST',
      headers: {
        cookie: annotatorCookie,
      },
    });
    expect(firstClaimResponse.status).toBe(200);

    const secondClaimResponse = await fetch(`${runningServer.baseUrl}/api/annotator/tasks/claim-next`, {
      method: 'POST',
      headers: {
        cookie: annotatorCookie,
      },
    });
    expect(secondClaimResponse.status).toBe(409);
    await expect(secondClaimResponse.json()).resolves.toEqual({
      error: '当前已有未提交任务，请先完成后再领取下一条。',
    });
  });

  it('returns the current claimed task for the annotator', async () => {
    const runningServer = await startServer(createEnvironment());
    servers.push(runningServer.server);

    const adminCookie = await login(runningServer, 'admin', 'S3curePassw0rd!');
    await createAnnotator(runningServer, adminCookie);
    await uploadDocument(runningServer, adminCookie, 'current-doc');

    const annotatorCookie = await login(runningServer, 'annotator-1', 'AnnotatorPass1!');
    const claimResponse = await fetch(`${runningServer.baseUrl}/api/annotator/tasks/claim-next`, {
      method: 'POST',
      headers: {
        cookie: annotatorCookie,
      },
    });
    const claimedTask = (await claimResponse.json()) as {
      task: { id: number; status: string; reviewPoint: string };
    };

    const currentResponse = await fetch(`${runningServer.baseUrl}/api/annotator/tasks/current`, {
      headers: {
        cookie: annotatorCookie,
      },
    });

    expect(currentResponse.status).toBe(200);
    await expect(currentResponse.json()).resolves.toEqual({
      task: expect.objectContaining({
        id: claimedTask.task.id,
        status: 'claimed',
        reviewPoint: 'Check water item',
      }),
    });
  });

  it('rejects draft updates after submit succeeds', async () => {
    const runningServer = await startServer(createEnvironment());
    servers.push(runningServer.server);

    const adminCookie = await login(runningServer, 'admin', 'S3curePassw0rd!');
    await createAnnotator(runningServer, adminCookie);
    await uploadDocument(runningServer, adminCookie, 'submit-doc');

    const annotatorCookie = await login(runningServer, 'annotator-1', 'AnnotatorPass1!');
    const claimResponse = await fetch(`${runningServer.baseUrl}/api/annotator/tasks/claim-next`, {
      method: 'POST',
      headers: {
        cookie: annotatorCookie,
      },
    });
    const claimedTask = (await claimResponse.json()) as { task: { id: number } };

    const draftPayload = {
      label: 'water',
      review_point: 'Check water item',
      verification_status: '[姝ｇ‘]',
      evidence_fragments: [],
      judgment_basis: 'Draft before submit',
    };

    const draftResponse = await fetch(
      `${runningServer.baseUrl}/api/annotator/tasks/${claimedTask.task.id}/draft`,
      {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          cookie: annotatorCookie,
        },
        body: JSON.stringify({ payload: draftPayload }),
      },
    );
    expect(draftResponse.status).toBe(200);

    const submitResponse = await fetch(
      `${runningServer.baseUrl}/api/annotator/tasks/${claimedTask.task.id}/submit`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: annotatorCookie,
        },
        body: JSON.stringify({
          payload: {
            ...draftPayload,
            judgment_basis: 'Final submit',
          },
        }),
      },
    );
    expect(submitResponse.status).toBe(200);

    const staleDraftResponse = await fetch(
      `${runningServer.baseUrl}/api/annotator/tasks/${claimedTask.task.id}/draft`,
      {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          cookie: annotatorCookie,
        },
        body: JSON.stringify({ payload: draftPayload }),
      },
    );

    expect(staleDraftResponse.status).toBe(409);
    await expect(staleDraftResponse.json()).resolves.toEqual({
      error: '任务状态已变化，当前草稿不能再保存。',
    });
  });
});

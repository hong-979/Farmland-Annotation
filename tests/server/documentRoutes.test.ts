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
  const directory = mkdtempSync(join(tmpdir(), 'annotation-document-routes-'));

  return {
    ANNOTATION_DB_PATH: join(directory, 'annotation.sqlite'),
    BOOTSTRAP_ADMIN_USERNAME: 'admin',
    BOOTSTRAP_ADMIN_PASSWORD: 'S3curePassw0rd!',
    BOOTSTRAP_ADMIN_DISPLAY_NAME: 'System Admin',
    SESSION_SECRET: 'document-route-secret',
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

async function login(baseUrl: string, username: string, password: string) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
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

async function createAnnotator(baseUrl: string, adminCookie: string, username = 'annotator-1') {
  const response = await fetch(`${baseUrl}/api/admin/users`, {
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

async function uploadDocument(baseUrl: string, adminCookie: string, title: string) {
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
              review_point: `Check ${title}`,
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

  const response = await fetch(`${baseUrl}/api/admin/documents`, {
    method: 'POST',
    headers: {
      cookie: adminCookie,
    },
    body: formData,
  });

  expect(response.status).toBe(201);
  return (await response.json()) as { document: { id: number } };
}

describe('document pdf routes', () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => stopServer(server)));
  });

  it('downloads the full pdf bytes for the current claimed document', async () => {
    const runningServer = await startServer(createEnvironment());
    servers.push(runningServer.server);

    const adminCookie = await login(runningServer.baseUrl, 'admin', 'S3curePassw0rd!');
    await createAnnotator(runningServer.baseUrl, adminCookie);
    const uploaded = await uploadDocument(runningServer.baseUrl, adminCookie, 'claimed-pdf');

    const annotatorCookie = await login(
      runningServer.baseUrl,
      'annotator-1',
      'AnnotatorPass1!',
    );
    const claimResponse = await fetch(`${runningServer.baseUrl}/api/annotator/tasks/claim-next`, {
      method: 'POST',
      headers: {
        cookie: annotatorCookie,
      },
    });
    expect(claimResponse.status).toBe(200);

    const pdfResponse = await fetch(
      `${runningServer.baseUrl}/api/documents/${uploaded.document.id}/pdf`,
      {
        headers: {
          cookie: annotatorCookie,
        },
      },
    );

    expect(pdfResponse.status).toBe(200);
    expect(pdfResponse.headers.get('content-type')).toContain('application/pdf');
    expect((await pdfResponse.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it('rejects pdf download for annotators who do not hold the claimed task', async () => {
    const runningServer = await startServer(createEnvironment());
    servers.push(runningServer.server);

    const adminCookie = await login(runningServer.baseUrl, 'admin', 'S3curePassw0rd!');
    await createAnnotator(runningServer.baseUrl, adminCookie, 'annotator-1');
    await createAnnotator(runningServer.baseUrl, adminCookie, 'annotator-2');
    const firstDocument = await uploadDocument(runningServer.baseUrl, adminCookie, 'first-pdf');
    await uploadDocument(runningServer.baseUrl, adminCookie, 'second-pdf');

    const firstAnnotatorCookie = await login(
      runningServer.baseUrl,
      'annotator-1',
      'AnnotatorPass1!',
    );
    const secondAnnotatorCookie = await login(
      runningServer.baseUrl,
      'annotator-2',
      'AnnotatorPass1!',
    );

    const claimResponse = await fetch(`${runningServer.baseUrl}/api/annotator/tasks/claim-next`, {
      method: 'POST',
      headers: {
        cookie: firstAnnotatorCookie,
      },
    });
    expect(claimResponse.status).toBe(200);

    const pdfResponse = await fetch(
      `${runningServer.baseUrl}/api/documents/${firstDocument.document.id}/pdf`,
      {
        headers: {
          cookie: secondAnnotatorCookie,
        },
      },
    );

    expect(pdfResponse.status).toBe(403);
    await expect(pdfResponse.json()).resolves.toEqual({
      error: '当前账号无权读取该 PDF。',
    });
  });
});

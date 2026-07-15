import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import { ensureBootstrapAdmin } from './db/bootstrapAdmin.js';
import { createDatabaseProvider } from './db/database.js';
import { createAdminRoutes } from './routes/adminRoutes.js';
import { createAnnotatorRoutes } from './routes/annotatorRoutes.js';
import { createDocumentRoutes } from './routes/documentRoutes.js';
import { createAuthRoutes } from './routes/authRoutes.js';

type CreateAppOptions = {
  environment?: NodeJS.ProcessEnv;
  webDistPath?: string;
};

const defaultWebDistPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

export function createApp({ environment = process.env, webDistPath = defaultWebDistPath }: CreateAppOptions = {}) {
  const app = express();
  const databaseProvider = createDatabaseProvider(environment);
  ensureBootstrapAdmin(databaseProvider.getDatabase(), environment);

  app.use(express.json());
  app.use(
    '/api/auth',
    createAuthRoutes({
      databaseProvider,
      environment,
    }),
  );
  app.use(
    '/api/admin',
    createAdminRoutes({
      databaseProvider,
      environment,
    }),
  );
  app.use(
    '/api/annotator',
    createAnnotatorRoutes({
      databaseProvider,
      environment,
    }),
  );
  app.use(
    '/api/documents',
    createDocumentRoutes({
      databaseProvider,
      environment,
    }),
  );

  app.get('/api/health', (_request, response) => {
    response.status(200).json({ ok: true });
  });

  const indexHtmlPath = join(webDistPath, 'index.html');
  if (existsSync(indexHtmlPath)) {
    app.use(express.static(webDistPath));
    app.get(/^\/(?!api(?:\/|$)).*/, (_request, response) => {
      response.sendFile(indexHtmlPath);
    });
  }

  return app;
}

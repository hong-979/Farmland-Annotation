import express from 'express';

import { ensureBootstrapAdmin } from './db/bootstrapAdmin.js';
import { createDatabaseProvider } from './db/database.js';
import { createAdminRoutes } from './routes/adminRoutes.js';
import { createAuthRoutes } from './routes/authRoutes.js';

type CreateAppOptions = {
  environment?: NodeJS.ProcessEnv;
};

export function createApp({ environment = process.env }: CreateAppOptions = {}) {
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

  app.get('/api/health', (_request, response) => {
    response.status(200).json({ ok: true });
  });

  return app;
}

import express from 'express';

export function createApp() {
  const app = express();

  app.get('/api/health', (_request, response) => {
    response.status(200).json({ ok: true });
  });

  return app;
}

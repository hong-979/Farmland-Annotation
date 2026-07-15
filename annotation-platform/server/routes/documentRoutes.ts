import { Router } from 'express';

import type { DatabaseProvider } from '../db/database.js';
import { createRequireAuth } from '../middleware/requireAuth.js';
import { readStoredBuffer } from '../storage/fileStore.js';

type DocumentRoutesOptions = {
  databaseProvider: DatabaseProvider;
  environment?: NodeJS.ProcessEnv;
};

export function createDocumentRoutes({
  databaseProvider,
  environment = process.env,
}: DocumentRoutesOptions) {
  const router = Router();
  const requireAuth = createRequireAuth(databaseProvider, environment);

  router.get('/:id/pdf', requireAuth, (request, response) => {
    const rawDocumentId = Array.isArray(request.params.id)
      ? request.params.id[0]
      : request.params.id;
    const documentId = Number.parseInt(rawDocumentId ?? '', 10);

    if (!Number.isInteger(documentId)) {
      response.status(400).json({ error: '文档参数不正确。' });
      return;
    }

    const database = databaseProvider.getDatabase();
    const document = database
      .prepare(
        `
          SELECT id, pdf_file_path AS pdfFilePath
          FROM documents
          WHERE id = ?
          LIMIT 1
        `,
      )
      .get(documentId) as { id: number; pdfFilePath: string } | undefined;

    if (!document) {
      response.status(404).json({ error: '未找到对应文档。' });
      return;
    }

    if (request.authenticatedUser?.role === 'annotator') {
      const ownedClaim = database
        .prepare(
          `
            SELECT id
            FROM tasks
            WHERE document_id = ? AND claimed_by = ? AND status = 'claimed'
            LIMIT 1
          `,
        )
        .get(documentId, request.authenticatedUser.id) as { id: number } | undefined;

      if (!ownedClaim) {
        response.status(403).json({ error: '当前账号无权读取该 PDF。' });
        return;
      }
    }

    response.type('application/pdf').status(200).send(
      readStoredBuffer(document.pdfFilePath, environment),
    );
  });

  return router;
}

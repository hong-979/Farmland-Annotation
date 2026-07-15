import { Router } from 'express';
import multer from 'multer';

import { hashPassword } from '../auth/passwords.js';
import type { DatabaseProvider } from '../db/database.js';
import { createRequireAuth, createRequireRole } from '../middleware/requireAuth.js';
import { exportDocument, type ExportMode } from '../services/exportDocument.js';
import { importDocument } from '../services/importDocument.js';

type AdminRoutesOptions = {
  databaseProvider: DatabaseProvider;
  environment?: NodeJS.ProcessEnv;
};

const upload = multer({
  storage: multer.memoryStorage(),
});

export function createAdminRoutes({
  databaseProvider,
  environment = process.env,
}: AdminRoutesOptions) {
  const router = Router();
  const requireAuth = createRequireAuth(databaseProvider, environment);
  const requireAdmin = createRequireRole('admin');

  router.use(requireAuth, requireAdmin);

  router.post('/users', (request, response) => {
    const username = normalizeText(request.body?.username);
    const password = normalizeText(request.body?.password);
    const displayName = normalizeText(request.body?.displayName);

    if (!username || !password || !displayName) {
      response.status(400).json({
        error: '\u7528\u6237\u540d\u3001\u5bc6\u7801\u548c\u663e\u793a\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a\u3002',
      });
      return;
    }

    const database = databaseProvider.getDatabase();

    const existingUser = database
      .prepare(`SELECT id FROM users WHERE username = ? LIMIT 1`)
      .get(username) as { id: number } | undefined;

    if (existingUser) {
      response.status(409).json({
        error: '\u7528\u6237\u540d\u5df2\u5b58\u5728\uff0c\u8bf7\u66f4\u6362\u540e\u91cd\u8bd5\u3002',
      });
      return;
    }

    const result = database
      .prepare(
        `
          INSERT INTO users (username, password_hash, role, display_name, status)
          VALUES (?, ?, 'annotator', ?, 'active')
        `,
      )
      .run(username, hashPassword(password), displayName);

    response.status(201).json({
      user: {
        id: Number(result.lastInsertRowid),
        username,
        displayName,
        role: 'annotator',
        status: 'active',
      },
    });
  });

  router.get('/users', (_request, response) => {
    const database = databaseProvider.getDatabase();
    const users = database
      .prepare(
        `
          SELECT
            id,
            username,
            display_name AS displayName,
            role,
            status,
            created_at AS createdAt
          FROM users
          ORDER BY id ASC
        `,
      )
      .all();

    response.status(200).json({ users });
  });

  router.patch('/users/:id/status', (request, response) => {
    const userId = Number.parseInt(request.params.id, 10);
    const status = request.body?.status;

    if (!Number.isInteger(userId) || (status !== 'active' && status !== 'disabled')) {
      response.status(400).json({
        error: '\u8d26\u53f7\u72b6\u6001\u53c2\u6570\u4e0d\u6b63\u786e\u3002',
      });
      return;
    }

    const database = databaseProvider.getDatabase();

    if (status === 'disabled') {
      const claimedTask = database
        .prepare(
          `
            SELECT id
            FROM tasks
            WHERE claimed_by = ? AND status = 'claimed'
            LIMIT 1
          `,
        )
        .get(userId) as { id: number } | undefined;

      if (claimedTask) {
        response.status(409).json({
          error: '\u8be5\u6807\u6ce8\u5458\u4ecd\u6301\u6709\u672a\u63d0\u4ea4\u4efb\u52a1\uff0c\u8bf7\u5148\u56de\u6536\u4efb\u52a1\u540e\u518d\u505c\u7528\u3002',
        });
        return;
      }
    }

    const result = database
      .prepare(`UPDATE users SET status = ? WHERE id = ?`)
      .run(status, userId);

    if (result.changes === 0) {
      response.status(404).json({ error: '\u672a\u627e\u5230\u5bf9\u5e94\u8d26\u53f7\u3002' });
      return;
    }

    const user = database
      .prepare(
        `
          SELECT id, username, display_name AS displayName, role, status
          FROM users
          WHERE id = ?
          LIMIT 1
        `,
      )
      .get(userId);

    response.status(200).json({ user });
  });

  router.post(
    '/documents',
    upload.fields([
      { name: 'jsonFile', maxCount: 1 },
      { name: 'pdfFile', maxCount: 1 },
    ]),
    (request, response) => {
      const title = normalizeText(request.body?.title);
      const files = (request as typeof request & {
        files?: Record<string, Array<{ originalname: string; buffer: Buffer }>>;
      }).files as
        | Record<string, Array<{ originalname: string; buffer: Buffer }>>
        | undefined;
      const jsonFile = files?.jsonFile?.[0];
      const pdfFile = files?.pdfFile?.[0];

      if (!title || !jsonFile || !pdfFile) {
        response.status(400).json({
          error: '\u8bf7\u540c\u65f6\u4e0a\u4f20\u6807\u9898\u3001JSON \u548c PDF \u6587\u4ef6\u3002',
        });
        return;
      }

      const database = databaseProvider.getDatabase();
      const createdBy = request.authenticatedUser?.id;

      if (!createdBy) {
        response.status(401).json({ error: '\u5f53\u524d\u767b\u5f55\u72b6\u6001\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u3002' });
        return;
      }

      const result = importDocument({
        database,
        environment,
        title,
        jsonName: jsonFile.originalname,
        jsonBytes: jsonFile.buffer,
        pdfName: pdfFile.originalname,
        pdfBytes: pdfFile.buffer,
        createdBy,
      });

      if (!result.ok) {
        response.status(400).json({
          error: result.errors[0]?.message ?? '\u6587\u4ef6\u5bfc\u5165\u5931\u8d25\u3002',
          issues: result.errors,
        });
        return;
      }

      response.status(201).json({
        document: result.document,
      });
    },
  );

  router.post('/tasks/:taskId/reclaim', (request, response) => {
    const taskId = Number.parseInt(request.params.taskId, 10);

    if (!Number.isInteger(taskId)) {
      response.status(400).json({ error: '\u4efb\u52a1\u53c2\u6570\u4e0d\u6b63\u786e\u3002' });
      return;
    }

    const database = databaseProvider.getDatabase();
    const task = database
      .prepare(
        `
          SELECT id, status, claimed_by AS claimedBy, current_payload_json AS currentPayloadJson
          FROM tasks
          WHERE id = ?
          LIMIT 1
        `,
      )
      .get(taskId) as
      | {
          id: number;
          status: string;
          claimedBy: number | null;
          currentPayloadJson: string;
        }
      | undefined;

    if (!task) {
      response.status(404).json({ error: '\u672a\u627e\u5230\u5bf9\u5e94\u4efb\u52a1\u3002' });
      return;
    }

    if (task.status !== 'claimed' || task.claimedBy === null) {
      response.status(409).json({
        error: '\u53ea\u6709\u5df2\u9886\u53d6\u7684\u4efb\u52a1\u624d\u80fd\u56de\u6536\u3002',
      });
      return;
    }

    database
      .prepare(
        `
          UPDATE tasks
          SET
            status = 'pending',
            claimed_by = NULL,
            claimed_at = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .run(taskId);

    database
      .prepare(
        `
          INSERT INTO task_history (task_id, actor_user_id, action_type, snapshot_json)
          VALUES (?, ?, 'reclaim', ?)
        `,
      )
      .run(taskId, request.authenticatedUser!.id, task.currentPayloadJson);

    response.status(200).json({
      task: {
        id: taskId,
        status: 'pending',
        claimedBy: null,
      },
    });
  });

  router.post('/documents/:id/export', (request, response) => {
    const documentId = Number.parseInt(request.params.id, 10);
    const mode = request.body?.mode as ExportMode;

    if (!Number.isInteger(documentId) || (mode !== 'partial' && mode !== 'final')) {
      response.status(400).json({
        error: '\u5bfc\u51fa\u53c2\u6570\u4e0d\u6b63\u786e\u3002',
      });
      return;
    }

    const result = exportDocument({
      database: databaseProvider.getDatabase(),
      environment,
      documentId,
      mode,
    });

    if (!result.ok) {
      response.status(result.status).json({ error: result.error });
      return;
    }

    response.status(200).json(result.payload);
  });

  return router;
}

function normalizeText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

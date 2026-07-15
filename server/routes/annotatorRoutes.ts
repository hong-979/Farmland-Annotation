import { Router } from 'express';

import type { DatabaseProvider } from '../db/database.js';
import { createRequireAuth, createRequireRole } from '../middleware/requireAuth.js';

type AnnotatorRoutesOptions = {
  databaseProvider: DatabaseProvider;
  environment?: NodeJS.ProcessEnv;
};

type TaskRecord = {
  id: number;
  documentId: number;
  taskIndex: number;
  label: string | null;
  reviewPoint: string;
  status: string;
  claimedBy: number | null;
  currentPayloadJson: string;
};

type DocumentSummary = {
  id: number;
  title: string;
  taskCount: number;
};

type ClaimedDocumentSession = {
  document: DocumentSummary;
  tasks: Array<ReturnType<typeof withPayload>>;
};

export function createAnnotatorRoutes({
  databaseProvider,
  environment = process.env,
}: AnnotatorRoutesOptions) {
  const router = Router();
  const requireAuth = createRequireAuth(databaseProvider, environment);
  const requireAnnotator = createRequireRole('annotator');

  router.use(requireAuth, requireAnnotator);

  router.post('/tasks/claim-next', (request, response) => {
    const database = databaseProvider.getDatabase();
    const userId = request.authenticatedUser!.id;
    const currentSession = findCurrentClaimedDocumentSession(database, userId);

    if (currentSession) {
      response.status(409).json({
        error: '当前已有未提交文件，请先完成后再领取下一份。',
      });
      return;
    }

    const pendingDocument = findNextPendingDocument(database);

    if (!pendingDocument) {
      response.status(404).json({
        error: '当前没有可领取的待处理文件。',
      });
      return;
    }

    const claimResult = database
      .prepare(
        `
          UPDATE tasks
          SET
            status = 'claimed',
            claimed_by = ?,
            claimed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE document_id = ? AND status = 'pending'
        `,
      )
      .run(userId, pendingDocument.id);

    if (claimResult.changes === 0) {
      response.status(409).json({
        error: '文件已被其他标注员领取，请刷新后重试。',
      });
      return;
    }

    const claimedSession = getClaimedDocumentSession(database, pendingDocument.id, userId);

    if (!claimedSession) {
      response.status(500).json({
        error: '文件领取成功后读取详情失败，请重试。',
      });
      return;
    }

    const insertHistoryStatement = database.prepare(
      `
        INSERT INTO task_history (task_id, actor_user_id, action_type, snapshot_json)
        VALUES (?, ?, 'claim', ?)
      `,
    );

    for (const task of claimedSession.tasks) {
      insertHistoryStatement.run(task.id, userId, JSON.stringify(task.payload));
    }

    response.status(200).json({
      session: serializeDocumentSession(claimedSession),
    });
  });

  router.get('/tasks/current', (request, response) => {
    const database = databaseProvider.getDatabase();
    const currentSession = findCurrentClaimedDocumentSession(
      database,
      request.authenticatedUser!.id,
    );

    response.status(200).json({
      session: currentSession ? serializeDocumentSession(currentSession) : null,
    });
  });

  router.get('/tasks/:taskId', (request, response) => {
    const taskId = Number.parseInt(request.params.taskId, 10);

    if (!Number.isInteger(taskId)) {
      response.status(400).json({ error: '任务参数不正确。' });
      return;
    }

    const database = databaseProvider.getDatabase();
    const task = getTaskForAnnotator(database, taskId, request.authenticatedUser!.id);

    if (!task) {
      response.status(404).json({ error: '未找到当前任务。' });
      return;
    }

    response.status(200).json({ task: serializeTask(task) });
  });

  router.put('/tasks/:taskId/draft', (request, response) => {
    const taskId = Number.parseInt(request.params.taskId, 10);
    const payload = request.body?.payload;

    if (!Number.isInteger(taskId) || !isRecord(payload)) {
      response.status(400).json({ error: '草稿参数不正确。' });
      return;
    }

    const database = databaseProvider.getDatabase();
    const task = getTaskForAnnotator(database, taskId, request.authenticatedUser!.id);

    if (!task || task.status !== 'claimed') {
      response.status(409).json({
        error: '任务状态已变化，当前草稿不能再保存。',
      });
      return;
    }

    database
      .prepare(
        `
          UPDATE tasks
          SET current_payload_json = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .run(JSON.stringify(payload), taskId);

    response.status(200).json({ ok: true });
  });

  router.post('/tasks/:taskId/submit', (request, response) => {
    const taskId = Number.parseInt(request.params.taskId, 10);
    const payload = request.body?.payload;

    if (!Number.isInteger(taskId) || !isRecord(payload)) {
      response.status(400).json({ error: '提交参数不正确。' });
      return;
    }

    const database = databaseProvider.getDatabase();
    const task = getTaskForAnnotator(database, taskId, request.authenticatedUser!.id);

    if (!task || task.status !== 'claimed') {
      response.status(409).json({
        error: '任务状态已变化，当前提交不能再执行。',
      });
      return;
    }

    const validationError = validateSubmitPayload(payload);

    if (validationError) {
      response.status(400).json({ error: validationError });
      return;
    }

    const payloadJson = JSON.stringify(payload);
    database
      .prepare(
        `
          UPDATE tasks
          SET
            current_payload_json = ?,
            status = 'submitted',
            submitted_by = ?,
            submitted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .run(payloadJson, request.authenticatedUser!.id, taskId);

    database
      .prepare(
        `
          INSERT INTO task_history (task_id, actor_user_id, action_type, snapshot_json)
          VALUES (?, ?, 'submit', ?)
        `,
      )
      .run(taskId, request.authenticatedUser!.id, payloadJson);

    response.status(200).json({
      task: {
        id: taskId,
        status: 'submitted',
      },
    });
  });

  return router;
}

function findNextPendingDocument(database: ReturnType<DatabaseProvider['getDatabase']>) {
  return database
    .prepare(
      `
        SELECT
          documents.id,
          documents.title,
          documents.task_count AS taskCount
        FROM documents
        WHERE EXISTS (
          SELECT 1
          FROM tasks
          WHERE tasks.document_id = documents.id
            AND tasks.status = 'pending'
        )
          AND NOT EXISTS (
            SELECT 1
            FROM tasks
            WHERE tasks.document_id = documents.id
              AND tasks.status <> 'pending'
          )
        ORDER BY documents.id ASC
        LIMIT 1
      `,
    )
    .get() as DocumentSummary | undefined;
}

function findCurrentClaimedDocumentSession(
  database: ReturnType<DatabaseProvider['getDatabase']>,
  userId: number,
) {
  const document = database
    .prepare(
      `
        SELECT
          documents.id,
          documents.title,
          documents.task_count AS taskCount
        FROM documents
        INNER JOIN tasks ON tasks.document_id = documents.id
        WHERE tasks.claimed_by = ? AND tasks.status = 'claimed'
        GROUP BY documents.id
        ORDER BY documents.id ASC
        LIMIT 1
      `,
    )
    .get(userId) as DocumentSummary | undefined;

  if (!document) {
    return null;
  }

  return getClaimedDocumentSession(database, document.id, userId);
}

function getClaimedDocumentSession(
  database: ReturnType<DatabaseProvider['getDatabase']>,
  documentId: number,
  userId: number,
) {
  const document = database
    .prepare(
      `
        SELECT
          id,
          title,
          task_count AS taskCount
        FROM documents
        WHERE id = ?
        LIMIT 1
      `,
    )
    .get(documentId) as DocumentSummary | undefined;

  if (!document) {
    return null;
  }

  const tasks = database
    .prepare(
      `
        SELECT
          id,
          document_id AS documentId,
          task_index AS taskIndex,
          label,
          review_point AS reviewPoint,
          status,
          claimed_by AS claimedBy,
          current_payload_json AS currentPayloadJson
        FROM tasks
        WHERE document_id = ? AND claimed_by = ? AND status = 'claimed'
        ORDER BY task_index ASC
      `,
    )
    .all(documentId, userId) as TaskRecord[];

  if (tasks.length === 0) {
    return null;
  }

  return {
    document,
    tasks: tasks.map(withPayload),
  } satisfies ClaimedDocumentSession;
}

function getTaskForAnnotator(
  database: ReturnType<DatabaseProvider['getDatabase']>,
  taskId: number,
  userId: number,
) {
  const task = database
    .prepare(
      `
        SELECT
          id,
          document_id AS documentId,
          task_index AS taskIndex,
          label,
          review_point AS reviewPoint,
          status,
          claimed_by AS claimedBy,
          current_payload_json AS currentPayloadJson
        FROM tasks
        WHERE id = ? AND claimed_by = ?
        LIMIT 1
      `,
    )
    .get(taskId, userId) as TaskRecord | undefined;

  return task ? withPayload(task) : null;
}

function withPayload(task: TaskRecord) {
  return {
    ...task,
    payload: JSON.parse(task.currentPayloadJson) as Record<string, unknown>,
  };
}

function serializeTask(task: ReturnType<typeof withPayload>) {
  return {
    id: task.id,
    documentId: task.documentId,
    taskIndex: task.taskIndex,
    label: task.label,
    reviewPoint: task.reviewPoint,
    status: task.status,
    claimedBy: task.claimedBy,
    payload: task.payload,
  };
}

function serializeDocumentSession(session: ClaimedDocumentSession) {
  return {
    document: {
      id: session.document.id,
      title: session.document.title,
      taskCount: session.document.taskCount,
    },
    tasks: session.tasks.map(serializeTask),
  };
}

function validateSubmitPayload(payload: Record<string, unknown>) {
  if (typeof payload.verification_status !== 'string' || payload.verification_status.trim() === '') {
    return '提交前必须选择判断状态。';
  }

  const evidenceFragments = Array.isArray(payload.evidence_fragments)
    ? payload.evidence_fragments
    : [];
  const judgmentBasis =
    typeof payload.judgment_basis === 'string' ? payload.judgment_basis.trim() : '';

  if (payload.verification_status === '[错误]') {
    if (evidenceFragments.length === 0 || judgmentBasis.length === 0) {
      return '判断为错误时，至少需要一条证据并填写判断依据。';
    }
  }

  for (const evidence of evidenceFragments) {
    if (!isRecord(evidence)) {
      return '证据列表格式不正确。';
    }

    const pageNumber = evidence.page_number;
    const normalizedPage =
      typeof pageNumber === 'number'
        ? pageNumber
        : typeof pageNumber === 'string'
          ? Number.parseInt(pageNumber, 10)
          : Number.NaN;

    if (!Number.isInteger(normalizedPage) || normalizedPage <= 0) {
      return '证据页码必须是正整数。';
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

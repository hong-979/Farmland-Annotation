import type { DatabaseSync } from 'node:sqlite';

import { readStoredText } from '../storage/fileStore.js';

export type ExportMode = 'partial' | 'final';

type ExportDocumentInput = {
  database: DatabaseSync;
  environment?: NodeJS.ProcessEnv;
  documentId: number;
  mode: ExportMode;
};

export function exportDocument({
  database,
  environment = process.env,
  documentId,
  mode,
}: ExportDocumentInput) {
  const document = database
    .prepare(
      `
        SELECT id, json_file_path AS jsonFilePath
        FROM documents
        WHERE id = ?
        LIMIT 1
      `,
    )
    .get(documentId) as { id: number; jsonFilePath: string } | undefined;

  if (!document) {
    return {
      ok: false as const,
      status: 404,
      error: '\u672a\u627e\u5230\u5bf9\u5e94\u6587\u6863\u3002',
    };
  }

  const tasks = database
    .prepare(
      `
        SELECT task_index AS taskIndex, current_payload_json AS currentPayloadJson, status
        FROM tasks
        WHERE document_id = ?
        ORDER BY task_index ASC
      `,
    )
    .all(documentId) as Array<{
      taskIndex: number;
      currentPayloadJson: string;
      status: string;
    }>;

  if (mode === 'final' && tasks.some((task) => task.status !== 'submitted')) {
    return {
      ok: false as const,
      status: 409,
      error: '\u6587\u6863\u5c1a\u672a\u5168\u90e8\u63d0\u4ea4\uff0c\u6682\u65f6\u4e0d\u80fd\u5bfc\u51fa\u5b8c\u6574\u7ed3\u679c\u3002',
    };
  }

  const sourceDocument = JSON.parse(
    readStoredText(document.jsonFilePath, environment),
  ) as Record<string, unknown>;

  return {
    ok: true as const,
    payload: {
      ...sourceDocument,
      output: tasks.map((task) => JSON.parse(task.currentPayloadJson)),
    },
  };
}

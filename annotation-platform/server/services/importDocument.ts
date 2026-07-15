import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import { saveUpload } from '../storage/fileStore.js';

type ImportDocumentInput = {
  database: DatabaseSync;
  environment?: NodeJS.ProcessEnv;
  title: string;
  jsonName: string;
  jsonBytes: Buffer;
  pdfName: string;
  pdfBytes: Buffer;
  createdBy: number;
};

export function importDocument({
  database,
  environment = process.env,
  title,
  jsonName,
  jsonBytes,
  pdfName,
  pdfBytes,
  createdBy,
}: ImportDocumentInput) {
  const parsed = parseAnnotationJson(
    jsonBytes.toString('utf8'),
  );

  if (!parsed.ok) {
    return {
      ok: false as const,
      errors: parsed.errors,
    };
  }

  const storedJson = saveUpload({
    environment,
    kind: 'json',
    originalName: jsonName,
    bytes: jsonBytes,
  });
  const storedPdf = saveUpload({
    environment,
    kind: 'pdf',
    originalName: pdfName,
    bytes: pdfBytes,
  });

  const insertDocumentResult = database
    .prepare(
      `
        INSERT INTO documents (
          title,
          json_file_path,
          pdf_file_path,
          source_json_name,
          source_pdf_name,
          task_count,
          created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      title,
      storedJson.relativePath,
      storedPdf.relativePath,
      jsonName,
      pdfName,
      parsed.document.tasks.length,
      createdBy,
    );

  const documentId = Number(insertDocumentResult.lastInsertRowid);
  const insertTaskStatement = database.prepare(
    `
      INSERT INTO tasks (
        document_id,
        task_index,
        label,
        review_point,
        original_payload_json,
        current_payload_json,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `,
  );

  for (const task of parsed.document.tasks) {
    const payloadJson = JSON.stringify(task.raw);
    insertTaskStatement.run(
      documentId,
      task.index,
      task.label,
      task.reviewPoint,
      payloadJson,
      payloadJson,
    );
  }

  return {
    ok: true as const,
    document: {
      id: documentId,
      title,
      taskCount: parsed.document.tasks.length,
      sourceJsonName: jsonName,
      sourcePdfName: pdfName,
    },
  };
}

type ParsedTask = {
  index: number;
  label: string | null;
  reviewPoint: string;
  raw: Record<string, unknown>;
};

function parseAnnotationJson(text: string) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false as const,
      errors: [{ message: '\u65e0\u6cd5\u89e3\u6790 JSON \u6587\u4ef6\uff0c\u8bf7\u68c0\u67e5\u6587\u4ef6\u5185\u5bb9\u3002' }],
    };
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.output)) {
    return {
      ok: false as const,
      errors: [{ message: 'JSON \u9876\u5c42\u5fc5\u987b\u5305\u542b output \u6570\u7ec4\u3002' }],
    };
  }

  const tasks: ParsedTask[] = [];

  for (const [index, entry] of parsed.output.entries()) {
    if (!isRecord(entry)) {
      return {
        ok: false as const,
        errors: [{ message: `output[${index}] \u5fc5\u987b\u662f\u5bf9\u8c61\u3002` }],
      };
    }

    const reviewPoint = typeof entry.review_point === 'string' ? entry.review_point.trim() : '';

    if (!reviewPoint) {
      return {
        ok: false as const,
        errors: [{ message: `output[${index}].review_point \u4e0d\u80fd\u4e3a\u7a7a\u3002` }],
      };
    }

    tasks.push({
      index,
      label: typeof entry.label === 'string' ? entry.label : null,
      reviewPoint,
      raw: JSON.parse(JSON.stringify(entry)) as Record<string, unknown>,
    });
  }

  return {
    ok: true as const,
    document: {
      sourceName: randomUUID(),
      tasks,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

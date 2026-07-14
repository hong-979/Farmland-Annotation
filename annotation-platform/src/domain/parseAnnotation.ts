import type {
  AnnotationDocument,
  AnnotationTask,
  EvidenceFragment,
  JsonRecord,
  ParseResult,
  ValidationIssue,
  VerificationStatus,
} from './types';

const STATUS_MAP: Record<string, Exclude<VerificationStatus, null>> = {
  '[正确]': 'correct',
  正确: 'correct',
  '[错误]': 'incorrect',
  错误: 'incorrect',
  '[未涉及]': 'not_applicable',
  未涉及: 'not_applicable',
};

export function parseAnnotationJson(
  text: string,
  sourceName: string,
  fingerprint: string,
): ParseResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      errors: [
        createIssue('error', 'json.syntax', '$', 'JSON 解析失败，请检查文件格式是否完整且符合 JSON 语法。'),
      ],
    };
  }

  if (!isJsonRecord(parsed)) {
    return {
      ok: false,
      errors: [createIssue('error', 'root.type', '$', '导入文件的根节点必须是对象。')],
    };
  }

  if (!Array.isArray(parsed.output)) {
    return {
      ok: false,
      errors: [createIssue('error', 'root.output', '$.output', '导入文件缺少 output 数组，请确认导出结构后重试。')],
    };
  }

  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const tasks: AnnotationTask[] = [];

  parsed.output.forEach((entry, taskIndex) => {
    const path = `$.output[${taskIndex}]`;

    if (!isJsonRecord(entry)) {
      errors.push(
        createIssue('error', 'task.type', path, 'output 数组中的任务必须是对象。', taskIndex),
      );
      return;
    }

    const reviewPoint = readRequiredText(entry.review_point);
    if (reviewPoint === null) {
      errors.push(
        createIssue(
          'error',
          'task.review_point',
          `${path}.review_point`,
          '任务缺少 review_point，请补充审查要点后重新导入。',
          taskIndex,
        ),
      );
      return;
    }

    const missingOptionalFields: string[] = [];

    const label = readOptionalText(entry.label, 'label', missingOptionalFields);
    const verificationStatus = readVerificationStatus(
      entry.verification_status,
      missingOptionalFields,
    );
    const judgmentBasis = readOptionalText(
      entry.judgment_basis,
      'judgment_basis',
      missingOptionalFields,
      '',
    ) ?? '';

    const evidenceSource = Array.isArray(entry.evidence_fragments) ? entry.evidence_fragments : [];
    if (!Array.isArray(entry.evidence_fragments)) {
      missingOptionalFields.push('evidence_fragments');
    }

    const evidenceFragments = evidenceSource.map((evidence, evidenceIndex) =>
      normalizeEvidence(evidence, taskIndex, evidenceIndex),
    );
    const pageNumbers = [...new Set(
      evidenceFragments
        .map((evidence) => evidence.pageNumber)
        .filter((pageNumber): pageNumber is number => pageNumber !== null),
    )].sort((left, right) => left - right);

    if (missingOptionalFields.length > 0) {
      warnings.push(
        createIssue(
          'warning',
          'task.optional_fields',
          path,
          `任务缺少可选字段：${missingOptionalFields.join('、')}。已按安全默认值处理。`,
          taskIndex,
        ),
      );
    }

    tasks.push({
      index: taskIndex,
      label,
      reviewPoint,
      verificationStatus,
      evidenceFragments,
      judgmentBasis,
      pageNumbers,
      raw: cloneRecord(entry),
    });
  });

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  const document: AnnotationDocument = {
    sourceName,
    fingerprint,
    rawRoot: cloneRecord(parsed),
    originalTasks: tasks.map(cloneTask),
    tasks: tasks.map(cloneTask),
  };

  return {
    ok: true,
    document,
    warnings,
  };
}

function normalizeEvidence(
  evidence: unknown,
  taskIndex: number,
  evidenceIndex: number,
): EvidenceFragment {
  const record = isJsonRecord(evidence) ? evidence : {};

  return {
    id: `task-${taskIndex}-evidence-${evidenceIndex}`,
    pageNumber: normalizePositiveInteger(record.page_number),
    originalText: typeof record.original_text === 'string' ? record.original_text : '',
    evidenceRole: typeof record.evidence_role === 'string' ? record.evidence_role : '',
    raw: cloneRecord(record),
  };
}

function readRequiredText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readOptionalText(
  value: unknown,
  fieldName: string,
  missingFields: string[],
  fallback: string | null = null,
): string | null {
  if (typeof value !== 'string') {
    missingFields.push(fieldName);
    return fallback;
  }

  return value;
}

function readVerificationStatus(
  value: unknown,
  missingFields: string[],
): VerificationStatus {
  if (typeof value !== 'string') {
    missingFields.push('verification_status');
    return null;
  }

  return STATUS_MAP[value.trim()] ?? null;
}

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value.trim(), 10);
    return parsed > 0 ? parsed : null;
  }

  return null;
}

function createIssue(
  severity: ValidationIssue['severity'],
  code: string,
  path: string,
  message: string,
  taskIndex?: number,
): ValidationIssue {
  return taskIndex === undefined
    ? { severity, code, path, message }
    : { severity, code, path, message, taskIndex };
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneRecord(record: JsonRecord): JsonRecord {
  return JSON.parse(JSON.stringify(record)) as JsonRecord;
}

function cloneTask(task: AnnotationTask): AnnotationTask {
  return {
    ...task,
    evidenceFragments: task.evidenceFragments.map((fragment) => ({
      ...fragment,
      raw: cloneRecord(fragment.raw),
    })),
    pageNumbers: [...task.pageNumbers],
    raw: cloneRecord(task.raw),
  };
}

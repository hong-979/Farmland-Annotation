import type {
  AnnotationDocument,
  AnnotationTask,
  DraftPayload,
  EvidenceFragment,
  JsonRecord,
  ParseFailure,
  ParseResult,
  ParseSuccess,
  TaskListStatus,
  ValidationIssue,
  VerificationStatus,
} from '../src/domain/types';
import { validRawDocument, validRawText } from './fixtures';
import { describe, expect, it } from 'vitest';

const raw: JsonRecord = { preserved: true };
const verificationStatus: VerificationStatus = 'incorrect';
const taskListStatus: TaskListStatus = 'modified';

const validationIssue: ValidationIssue = {
  severity: 'warning',
  code: 'synthetic-warning',
  path: 'output[0].verification_status',
  message: 'synthetic warning',
  taskIndex: 0,
};

const evidenceFragment: EvidenceFragment = {
  id: 'task-0-evidence-0',
  pageNumber: 2,
  originalText: '测试证据文本',
  evidenceRole: '直接冲突',
  raw: validRawDocument.output[0].evidence_fragments[0],
};

const annotationTask: AnnotationTask = {
  index: 0,
  label: '水资源',
  reviewPoint: '核对可供水量是否包含计算过程。',
  verificationStatus,
  evidenceFragments: [evidenceFragment],
  judgmentBasis: '已有结果缺少计算过程。',
  pageNumbers: [2],
  raw: validRawDocument.output[0],
};

const annotationDocument: AnnotationDocument = {
  sourceName: 'synthetic.json',
  fingerprint: 'synthetic-fingerprint',
  rawRoot: validRawDocument,
  originalTasks: [annotationTask],
  tasks: [annotationTask],
};

const parseSuccess: ParseSuccess = {
  ok: true,
  document: annotationDocument,
  warnings: [validationIssue],
};

const parseFailure: ParseFailure = {
  ok: false,
  errors: [validationIssue],
};

const successResult: ParseResult = parseSuccess;
const failureResult: ParseResult = parseFailure;

const draftPayload: DraftPayload = {
  fingerprint: 'synthetic-fingerprint',
  sourceName: 'synthetic.json',
  tasks: [annotationTask],
  currentTaskIndex: 0,
  savedAt: '2026-07-14T00:00:00.000Z',
};

// @ts-expect-error VerificationStatus must remain a closed union.
const invalidVerificationStatus: VerificationStatus = 'pending';
// @ts-expect-error TaskListStatus must remain a closed union.
const invalidTaskListStatus: TaskListStatus = 'done';
const invalidValidationIssueSeverity: ValidationIssue = {
  ...validationIssue,
  // @ts-expect-error ValidationIssue.severity must remain 'error' | 'warning'.
  severity: 'info',
};
const impossibleParseSuccess: ParseSuccess = {
  // @ts-expect-error ParseSuccess.ok must remain the true discriminant.
  ok: false,
  document: annotationDocument,
  warnings: [validationIssue],
};
const impossibleParseFailure: ParseFailure = {
  // @ts-expect-error ParseFailure.ok must remain the false discriminant.
  ok: true,
  errors: [validationIssue],
};
const invalidDraftPayload: DraftPayload = {
  ...draftPayload,
  // @ts-expect-error DraftPayload.savedAt must be a string timestamp.
  savedAt: 123,
};
void invalidVerificationStatus;
void invalidTaskListStatus;
void invalidValidationIssueSeverity;
void impossibleParseSuccess;
void impossibleParseFailure;
void invalidDraftPayload;

describe('domain contracts', () => {
  it('accepts representative objects for the canonical contracts', () => {
    expect(raw).toEqual({ preserved: true });
    expect(taskListStatus).toBe('modified');
    expect(annotationTask.verificationStatus).toBe('incorrect');
    expect(annotationDocument.tasks).toHaveLength(1);
    expect(successResult.ok).toBe(true);
    expect(failureResult.ok).toBe(false);
    expect(draftPayload.savedAt).toBe('2026-07-14T00:00:00.000Z');
  });

  it('exports a complete synthetic raw document fixture', () => {
    expect(validRawDocument).toMatchObject({
      project_id: 'synthetic-project',
      output: [
        {
          label: '水资源',
          review_point: '核对可供水量是否包含计算过程。',
          verification_status: '[错误]',
          judgment_basis: '已有结果缺少计算过程。',
          page_numbers: [2],
          upstream_task_id: 'task-1',
        },
      ],
      root_extension: { keep: true },
    });
    expect(validRawDocument.output[0].evidence_fragments).toEqual([
      {
        page_number: '2',
        original_text: '测试证据文本',
        evidence_role: '直接冲突',
        upstream_note: 'preserve me',
      },
    ]);
    expect(validRawText).toBe(JSON.stringify(validRawDocument));
  });
});

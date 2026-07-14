export type JsonRecord = Record<string, unknown>;
export type VerificationStatus = 'correct' | 'incorrect' | 'not_applicable' | null;
export type TaskListStatus = 'unprocessed' | 'confirmed' | 'modified' | 'incomplete';

export interface EvidenceFragment {
  id: string;
  pageNumber: number | null;
  originalText: string;
  evidenceRole: string;
  raw: JsonRecord;
}

export interface AnnotationTask {
  index: number;
  label: string | null;
  reviewPoint: string;
  verificationStatus: VerificationStatus;
  evidenceFragments: EvidenceFragment[];
  judgmentBasis: string;
  pageNumbers: number[];
  raw: JsonRecord;
}

export interface AnnotationDocument {
  sourceName: string;
  fingerprint: string;
  rawRoot: JsonRecord;
  originalTasks: AnnotationTask[];
  tasks: AnnotationTask[];
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  path: string;
  message: string;
  taskIndex?: number;
}

export interface ParseSuccess {
  ok: true;
  document: AnnotationDocument;
  warnings: ValidationIssue[];
}

export interface ParseFailure {
  ok: false;
  errors: ValidationIssue[];
}

export type ParseResult = ParseSuccess | ParseFailure;

export interface DraftPayload {
  fingerprint: string;
  sourceName: string;
  tasks: AnnotationTask[];
  currentTaskIndex: number;
  savedAt: string;
}

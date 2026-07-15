import type { AnnotationDocument, AnnotationTask, JsonRecord } from './types';

const statusOutput = {
  correct: '[正确]',
  incorrect: '[错误]',
  not_applicable: '[未涉及]',
} as const;

function taskToRaw(task: AnnotationTask): JsonRecord {
  return {
    ...structuredClone(task.raw),
    verification_status: task.verificationStatus === null ? '' : statusOutput[task.verificationStatus],
    evidence_fragments: task.evidenceFragments.map((evidence) => ({
      ...structuredClone(evidence.raw),
      page_number: evidence.pageNumber === null ? '' : String(evidence.pageNumber),
      original_text: evidence.originalText,
      evidence_role: evidence.evidenceRole,
    })),
    judgment_basis: task.judgmentBasis,
    page_numbers: [...task.pageNumbers],
  };
}

export function buildExportObject(document: AnnotationDocument): JsonRecord {
  return {
    ...structuredClone(document.rawRoot),
    output: document.tasks.map(taskToRaw),
  };
}

export function serializeExport(document: AnnotationDocument): string {
  const text = JSON.stringify(buildExportObject(document), null, 2);
  JSON.parse(text);
  return text;
}

export function buildExportFileName(sourceName: string, partial: boolean, date: Date): string {
  const base = sourceName.replace(/\.json$/i, '');
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}`;
  return `${base}_专家标注_${partial ? 'partial_' : ''}${stamp}.json`;
}

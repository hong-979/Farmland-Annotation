import type { AnnotationTask, TaskListStatus, ValidationIssue } from './types';

export function validateTask(task: AnnotationTask, pdfPageCount: number | null): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (task.verificationStatus === null) {
    issues.push({
      severity: 'error',
      code: 'task.decision_required',
      path: `tasks[${task.index}].verificationStatus`,
      message: '请选择专家判断。',
      taskIndex: task.index,
    });
  }

  if (task.verificationStatus === 'incorrect' && task.evidenceFragments.length === 0) {
    issues.push({
      severity: 'error',
      code: 'task.evidence_required',
      path: `tasks[${task.index}].evidenceFragments`,
      message: '判断为错误时至少需要一条证据。',
      taskIndex: task.index,
    });
  }

  if (task.verificationStatus === 'incorrect' && task.judgmentBasis.trim() === '') {
    issues.push({
      severity: 'error',
      code: 'task.basis_required',
      path: `tasks[${task.index}].judgmentBasis`,
      message: '判断为错误时必须填写判断依据。',
      taskIndex: task.index,
    });
  }

  task.evidenceFragments.forEach((evidence, evidenceIndex) => {
    const path = `tasks[${task.index}].evidenceFragments[${evidenceIndex}].pageNumber`;

    if (evidence.pageNumber === null || !Number.isInteger(evidence.pageNumber) || evidence.pageNumber < 1) {
      issues.push({
        severity: 'error',
        code: 'evidence.page_invalid',
        path,
        message: '证据页码必须是正整数。',
        taskIndex: task.index,
      });
      return;
    }

    if (pdfPageCount !== null && evidence.pageNumber > pdfPageCount) {
      issues.push({
        severity: 'error',
        code: 'evidence.page_out_of_range',
        path,
        message: `证据页码不能超过 PDF 总页数 ${pdfPageCount}。`,
        taskIndex: task.index,
      });
    }
  });

  return issues;
}

function editableSnapshot(task: AnnotationTask) {
  return {
    verificationStatus: task.verificationStatus,
    evidenceFragments: task.evidenceFragments.map(({ pageNumber, originalText, evidenceRole }) => ({
      pageNumber,
      originalText,
      evidenceRole,
    })),
    judgmentBasis: task.judgmentBasis,
  };
}

export function deriveTaskListStatus(
  current: AnnotationTask,
  original: AnnotationTask,
  pdfPageCount: number | null,
): TaskListStatus {
  if (current.verificationStatus === null) {
    return 'unprocessed';
  }

  if (validateTask(current, pdfPageCount).length > 0) {
    return 'incomplete';
  }

  return JSON.stringify(editableSnapshot(current)) === JSON.stringify(editableSnapshot(original))
    ? 'confirmed'
    : 'modified';
}

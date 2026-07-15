import { describe, expect, it } from 'vitest';
import { deriveTaskListStatus, validateTask } from '../../src/domain/validateTask';
import type { AnnotationTask } from '../../src/domain/types';

const task = (overrides: Partial<AnnotationTask> = {}): AnnotationTask => ({
  index: 0,
  label: null,
  reviewPoint: '审查要点',
  verificationStatus: null,
  evidenceFragments: [],
  judgmentBasis: '',
  pageNumbers: [],
  raw: { review_point: '审查要点' },
  ...overrides,
});

const evidence = (overrides: Partial<AnnotationTask['evidenceFragments'][number]> = {}) => ({
  id: 'e1',
  pageNumber: 1,
  originalText: '证据原文',
  evidenceRole: '支持',
  raw: {},
  ...overrides,
});

describe('validateTask', () => {
  it('requires a decision', () => {
    expect(validateTask(task(), 10)).toEqual([
      {
        code: 'task.decision_required',
        path: 'tasks[0].verificationStatus',
        severity: 'error',
        taskIndex: 0,
        message: '请选择专家判断。',
      },
    ]);
  });

  it('requires evidence and basis for an incorrect decision', () => {
    expect(validateTask(task({ verificationStatus: 'incorrect' }), 10)).toEqual([
      {
        code: 'task.evidence_required',
        path: 'tasks[0].evidenceFragments',
        severity: 'error',
        taskIndex: 0,
        message: '判断为错误时至少需要一条证据。',
      },
      {
        code: 'task.basis_required',
        path: 'tasks[0].judgmentBasis',
        severity: 'error',
        taskIndex: 0,
        message: '判断为错误时必须填写判断依据。',
      },
    ]);
  });

  it('rejects an evidence page beyond the loaded PDF', () => {
    expect(
      validateTask(task({ verificationStatus: 'correct', evidenceFragments: [evidence({ pageNumber: 11 })] }), 10),
    ).toEqual([
      {
        code: 'evidence.page_out_of_range',
        path: 'tasks[0].evidenceFragments[0].pageNumber',
        severity: 'error',
        taskIndex: 0,
        message: '证据页码不能超过 PDF 总页数 10。',
      },
    ]);
  });

  it.each([
    ['null', null],
    ['non-integer', 1.5],
    ['zero', 0],
    ['negative', -1],
  ])('rejects %s evidence page numbers as invalid', (_label, pageNumber) => {
    expect(
      validateTask(task({ verificationStatus: 'correct', evidenceFragments: [evidence({ pageNumber })] }), 10),
    ).toEqual([
      {
        code: 'evidence.page_invalid',
        path: 'tasks[0].evidenceFragments[0].pageNumber',
        severity: 'error',
        taskIndex: 0,
        message: '证据页码必须是正整数。',
      },
    ]);
  });

  it('rejects whitespace-only judgment basis for an incorrect decision', () => {
    expect(
      validateTask(
        task({
          verificationStatus: 'incorrect',
          evidenceFragments: [evidence()],
          judgmentBasis: '   \n\t  ',
        }),
        10,
      ),
    ).toEqual([
      {
        code: 'task.basis_required',
        path: 'tasks[0].judgmentBasis',
        severity: 'error',
        taskIndex: 0,
        message: '判断为错误时必须填写判断依据。',
      },
    ]);
  });

  it('does not reject a positive evidence page number when PDF page count is unknown', () => {
    expect(
      validateTask(task({ verificationStatus: 'correct', evidenceFragments: [evidence({ pageNumber: 999 })] }), null),
    ).toEqual([]);
  });
});

describe('deriveTaskListStatus', () => {
  it('returns unprocessed when the decision is missing', () => {
    expect(deriveTaskListStatus(task(), task(), 10)).toBe('unprocessed');
  });

  it('returns incomplete when the task has validation errors', () => {
    const current = task({ verificationStatus: 'incorrect' });
    const original = task({ verificationStatus: 'correct' });
    expect(deriveTaskListStatus(current, original, 10)).toBe('incomplete');
  });

  it('returns confirmed when editable fields are unchanged and validation passes', () => {
    const original = task({
      verificationStatus: 'correct',
      evidenceFragments: [evidence()],
      judgmentBasis: '依据',
    });
    const current = task({
      verificationStatus: 'correct',
      evidenceFragments: [evidence()],
      judgmentBasis: '依据',
    });
    expect(deriveTaskListStatus(current, original, 10)).toBe('confirmed');
  });

  it('returns modified when editable fields differ and validation passes', () => {
    const original = task({ verificationStatus: 'correct' });
    const current = task({ verificationStatus: 'not_applicable' });
    expect(deriveTaskListStatus(current, original, 10)).toBe('modified');
  });

  it('ignores non-editable field changes when editable fields are unchanged', () => {
    const original = task({
      verificationStatus: 'correct',
      evidenceFragments: [evidence()],
      judgmentBasis: '依据',
      label: '标签 A',
      reviewPoint: '审查要点 A',
      pageNumbers: [1],
      raw: { review_point: '审查要点 A', marker: 'original' },
    });
    const current = task({
      verificationStatus: 'correct',
      evidenceFragments: [evidence({ id: 'e2' })],
      judgmentBasis: '依据',
      label: '标签 B',
      reviewPoint: '审查要点 B',
      pageNumbers: [3, 4],
      raw: { review_point: '审查要点 B', marker: 'changed' },
    });
    expect(deriveTaskListStatus(current, original, 10)).toBe('confirmed');
  });
});

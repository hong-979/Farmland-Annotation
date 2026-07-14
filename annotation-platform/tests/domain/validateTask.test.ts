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

describe('validateTask', () => {
  it('requires a decision', () => {
    expect(validateTask(task(), 10).map((issue) => issue.code)).toContain('task.decision_required');
  });

  it('requires evidence and basis for an incorrect decision', () => {
    const codes = validateTask(task({ verificationStatus: 'incorrect' }), 10).map(
      (issue) => issue.code,
    );
    expect(codes).toEqual(expect.arrayContaining(['task.evidence_required', 'task.basis_required']));
  });

  it('rejects an evidence page beyond the loaded PDF', () => {
    const evidence = { id: 'e1', pageNumber: 11, originalText: 'x', evidenceRole: '支持', raw: {} };
    expect(validateTask(task({ verificationStatus: 'correct', evidenceFragments: [evidence] }), 10)[0].code).toBe(
      'evidence.page_out_of_range',
    );
  });
});

describe('deriveTaskListStatus', () => {
  it('returns modified only when editable fields differ and validation passes', () => {
    const original = task({ verificationStatus: 'correct' });
    const current = task({ verificationStatus: 'not_applicable' });
    expect(deriveTaskListStatus(current, original, 10)).toBe('modified');
  });
});

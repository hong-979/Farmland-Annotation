import { describe, expect, it } from 'vitest';
import { annotationReducer } from '../../src/state/annotationReducer';
import type { AnnotationAction } from '../../src/state/annotationReducer';
import type { AnnotationTask, EvidenceFragment } from '../../src/domain/types';

const evidence = (overrides: Partial<EvidenceFragment> = {}): EvidenceFragment => ({
  id: 'evidence-1',
  pageNumber: 2,
  originalText: '原文证据',
  evidenceRole: '直接证据',
  raw: { upstream_note: 'preserve me' },
  ...overrides,
});

const task = (overrides: Partial<AnnotationTask> = {}): AnnotationTask => ({
  index: 0,
  label: '任务',
  reviewPoint: '核对任务',
  verificationStatus: 'correct',
  evidenceFragments: [evidence()],
  judgmentBasis: '原始依据',
  pageNumbers: [2],
  raw: { upstream_task_id: 'task-1' },
  ...overrides,
});

const invalidPageNumbers = [
  0,
  -1,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  Number.MAX_SAFE_INTEGER + 1,
];

const stableTaskActionCases = (
  taskIndex: number,
): Array<{
  name: string;
  action: AnnotationAction;
  assertChangedTask(changedTask: AnnotationTask): void;
}> => [
  {
    name: 'set-status',
    action: { type: 'set-status', taskIndex, status: 'incorrect' },
    assertChangedTask: (changedTask) =>
      expect(changedTask.verificationStatus).toBe('incorrect'),
  },
  {
    name: 'set-basis',
    action: { type: 'set-basis', taskIndex, value: '稳定任务依据' },
    assertChangedTask: (changedTask) =>
      expect(changedTask.judgmentBasis).toBe('稳定任务依据'),
  },
  {
    name: 'add-evidence',
    action: {
      type: 'add-evidence',
      taskIndex,
      evidence: evidence({ id: 'added-evidence', pageNumber: 4 }),
    },
    assertChangedTask: (changedTask) =>
      expect(changedTask.evidenceFragments.map((item) => item.id)).toContain('added-evidence'),
  },
  {
    name: 'update-evidence',
    action: {
      type: 'update-evidence',
      taskIndex,
      evidenceId: 'evidence-1',
      patch: { originalText: '稳定任务的新原文' },
    },
    assertChangedTask: (changedTask) =>
      expect(changedTask.evidenceFragments[0].originalText).toBe('稳定任务的新原文'),
  },
  {
    name: 'remove-evidence',
    action: { type: 'remove-evidence', taskIndex, evidenceId: 'evidence-1' },
    assertChangedTask: (changedTask) => expect(changedTask.evidenceFragments).toEqual([]),
  },
];

describe('annotationReducer', () => {
  it.each(stableTaskActionCases(10))(
    'targets a task at array position zero by stable index for $name',
    ({ action, assertChangedTask }) => {
      const tasks = [task({ index: 10 })];

      const next = annotationReducer(tasks, action);

      expect(next).not.toBe(tasks);
      assertChangedTask(next[0]);
    },
  );

  it('edits only the matching stable task after tasks are reordered', () => {
    const tasks = [
      task({ index: 20, judgmentBasis: '任务二十' }),
      task({ index: 10, judgmentBasis: '任务十' }),
    ];

    const next = annotationReducer(tasks, {
      type: 'set-basis',
      taskIndex: 10,
      value: '只修改任务十',
    });

    expect(next[0]).toBe(tasks[0]);
    expect(next[0].judgmentBasis).toBe('任务二十');
    expect(next[1].judgmentBasis).toBe('只修改任务十');
  });

  it.each(stableTaskActionCases(0))(
    'returns the original list when $name targets a missing stable index',
    ({ action }) => {
      const tasks = [task({ index: 10 })];

      expect(annotationReducer(tasks, action)).toBe(tasks);
    },
  );

  it.each(stableTaskActionCases(1))(
    'returns the original list when $name targets a duplicate stable index',
    ({ action }) => {
      const tasks = [task({ index: 1 }), task({ index: 1 })];

      expect(annotationReducer(tasks, action)).toBe(tasks);
    },
  );

  it.each([-1, 1, 0.5, Number.NaN])(
    'returns the original task list for invalid task index %s',
    (taskIndex) => {
      const tasks = [task({ pageNumbers: [99] })];

      const next = annotationReducer(tasks, {
        type: 'set-status',
        taskIndex,
        status: 'incorrect',
      });

      expect(next).toBe(tasks);
      expect(tasks[0].pageNumbers).toEqual([99]);
    },
  );

  it('adds evidence without mutating the input task list', () => {
    const tasks = [task()];
    const next = annotationReducer(tasks, {
      type: 'add-evidence',
      taskIndex: 0,
      evidence: evidence({ id: 'evidence-2', pageNumber: 4, originalText: '新增证据' }),
    });

    expect(next).not.toBe(tasks);
    expect(next[0].evidenceFragments).toHaveLength(2);
    expect(next[0].pageNumbers).toEqual([2, 4]);
    expect(tasks[0].evidenceFragments).toHaveLength(1);
    expect(tasks[0].pageNumbers).toEqual([2]);
  });

  it.each(invalidPageNumbers)('ignores invalid page number %s when adding evidence', (pageNumber) => {
    const tasks = [task()];

    const next = annotationReducer(tasks, {
      type: 'add-evidence',
      taskIndex: 0,
      evidence: evidence({ id: 'evidence-2', pageNumber }),
    });

    expect(next[0].pageNumbers).toEqual([2]);
  });

  it('clones added evidence so later caller mutations do not affect reducer state', () => {
    const tasks = [task()];
    const addedEvidence = evidence({
      id: 'evidence-2',
      pageNumber: 4,
      originalText: '新增证据',
      raw: { upstream_note: 'original raw note' },
    });

    const next = annotationReducer(tasks, {
      type: 'add-evidence',
      taskIndex: 0,
      evidence: addedEvidence,
    });

    addedEvidence.pageNumber = 9;
    addedEvidence.originalText = 'mutated outside reducer';
    addedEvidence.raw.upstream_note = 'mutated raw note';

    expect(next[0].evidenceFragments[1]).toEqual(
      expect.objectContaining({
        id: 'evidence-2',
        pageNumber: 4,
        originalText: '新增证据',
        raw: expect.objectContaining({ upstream_note: 'original raw note' }),
      }),
    );
    expect(next[0].pageNumbers).toEqual([2, 4]);
  });

  it('returns the original task list when updating an unknown evidence id', () => {
    const tasks = [task({ pageNumbers: [99] })];

    const next = annotationReducer(tasks, {
      type: 'update-evidence',
      taskIndex: 0,
      evidenceId: 'missing',
      patch: { pageNumber: 5 },
    });

    expect(next).toBe(tasks);
    expect(tasks[0].pageNumbers).toEqual([99]);
  });

  it.each(invalidPageNumbers)('ignores invalid page number %s when updating evidence', (pageNumber) => {
    const tasks = [
      task({
        evidenceFragments: [
          evidence({ id: 'target', pageNumber: 4 }),
          evidence({ id: 'valid', pageNumber: 2 }),
        ],
        pageNumbers: [2, 4],
      }),
    ];

    const next = annotationReducer(tasks, {
      type: 'update-evidence',
      taskIndex: 0,
      evidenceId: 'target',
      patch: { pageNumber },
    });

    expect(next[0].pageNumbers).toEqual([2]);
  });

  it('updates evidence immutably and recalculates sorted distinct pages', () => {
    const tasks = [
      task({
        evidenceFragments: [
          evidence({ id: 'evidence-1', pageNumber: 5 }),
          evidence({ id: 'evidence-2', pageNumber: 2 }),
        ],
        pageNumbers: [2, 5],
      }),
    ];

    const next = annotationReducer(tasks, {
      type: 'update-evidence',
      taskIndex: 0,
      evidenceId: 'evidence-1',
      patch: { pageNumber: 2, originalText: '改写证据' },
    });

    expect(next).not.toBe(tasks);
    expect(next[0].evidenceFragments[0].pageNumber).toBe(2);
    expect(next[0].evidenceFragments[0].originalText).toBe('改写证据');
    expect(next[0].pageNumbers).toEqual([2]);
    expect(tasks[0].evidenceFragments[0].pageNumber).toBe(5);
    expect(tasks[0].evidenceFragments[0].originalText).toBe('原文证据');
    expect(tasks[0].pageNumbers).toEqual([2, 5]);
  });

  it('recalculates page numbers from sorted distinct positive non-null evidence pages', () => {
    const tasks = [
      task({
        evidenceFragments: [
          evidence({ id: 'negative', pageNumber: -1 }),
          evidence({ id: 'zero', pageNumber: 0 }),
          evidence({ id: 'null', pageNumber: null }),
          evidence({ id: 'five', pageNumber: 5 }),
          evidence({ id: 'two-a', pageNumber: 2 }),
          evidence({ id: 'two-b', pageNumber: 2 }),
        ],
        pageNumbers: [99],
      }),
    ];

    const next = annotationReducer(tasks, {
      type: 'update-evidence',
      taskIndex: 0,
      evidenceId: 'five',
      patch: { originalText: 'changed' },
    });

    expect(next[0].pageNumbers).toEqual([2, 5]);
  });

  it('returns the original task list when removing an unknown evidence id', () => {
    const tasks = [task({ pageNumbers: [99] })];

    const next = annotationReducer(tasks, {
      type: 'remove-evidence',
      taskIndex: 0,
      evidenceId: 'missing',
    });

    expect(next).toBe(tasks);
    expect(tasks[0].pageNumbers).toEqual([99]);
  });

  it('removes evidence without mutating the original evidence array', () => {
    const tasks = [
      task({
        evidenceFragments: [
          evidence({ id: 'evidence-1', pageNumber: 2 }),
          evidence({ id: 'evidence-2', pageNumber: 4 }),
        ],
        pageNumbers: [2, 4],
      }),
    ];

    const next = annotationReducer(tasks, {
      type: 'remove-evidence',
      taskIndex: 0,
      evidenceId: 'evidence-2',
    });

    expect(next).not.toBe(tasks);
    expect(next[0].evidenceFragments).toHaveLength(1);
    expect(next[0].pageNumbers).toEqual([2]);
    expect(tasks[0].evidenceFragments).toHaveLength(2);
    expect(tasks[0].pageNumbers).toEqual([2, 4]);
  });

  it('replaces tasks with a deep clone', () => {
    const replacement = [task({ judgmentBasis: '替换依据' })];
    const next = annotationReducer([], { type: 'replace-tasks', tasks: replacement });

    expect(next).toEqual(replacement);
    expect(next).not.toBe(replacement);
    expect(next[0]).not.toBe(replacement[0]);

    next[0].judgmentBasis = 'mutated';
    expect(replacement[0].judgmentBasis).toBe('替换依据');
  });

  it('sets status and basis on the targeted task only', () => {
    const tasks = [task(), task({ index: 1, reviewPoint: '第二项', judgmentBasis: '保持不变' })];

    const withStatus = annotationReducer(tasks, {
      type: 'set-status',
      taskIndex: 0,
      status: 'incorrect',
    });
    const withBasis = annotationReducer(withStatus, {
      type: 'set-basis',
      taskIndex: 0,
      value: '新的判断依据',
    });

    expect(withBasis[0].verificationStatus).toBe('incorrect');
    expect(withBasis[0].judgmentBasis).toBe('新的判断依据');
    expect(withBasis[1]).toBe(tasks[1]);
  });
});

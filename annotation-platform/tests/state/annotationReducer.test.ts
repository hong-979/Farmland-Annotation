import { describe, expect, it } from 'vitest';
import { annotationReducer } from '../../src/state/annotationReducer';
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

describe('annotationReducer', () => {
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

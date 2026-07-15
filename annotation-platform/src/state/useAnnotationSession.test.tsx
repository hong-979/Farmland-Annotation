import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AnnotationDocument, AnnotationTask, DraftPayload } from '../domain/types';
import type { DraftRepository } from '../storage/draftRepository';
import { useAnnotationSession } from './useAnnotationSession';

function task(index: number, reviewPoint = `任务 ${index}`): AnnotationTask {
  return {
    index,
    label: `标签 ${index}`,
    reviewPoint,
    verificationStatus: null,
    evidenceFragments: [],
    judgmentBasis: '',
    pageNumbers: [],
    raw: { stable: index },
  };
}

function annotationDocument(tasks = [task(10), task(30)]): AnnotationDocument {
  return {
    sourceName: 'synthetic.json',
    fingerprint: 'fingerprint-synthetic',
    rawRoot: { output: [] },
    originalTasks: structuredClone(tasks),
    tasks,
  };
}

function repository(save = vi.fn().mockResolvedValue(undefined)): DraftRepository {
  return {
    save,
    load: vi.fn().mockResolvedValue(null),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useAnnotationSession', () => {
  it('dispatches by stable task.index and exposes current and all validation issues', () => {
    const document = annotationDocument();
    const { result } = renderHook(() =>
      useAnnotationSession({ document, pdfPageCount: 2, repository: repository() }),
    );

    expect(result.current.currentTask.index).toBe(10);
    expect(result.current.issues).toHaveLength(1);
    expect(result.current.allIssues).toHaveLength(2);

    act(() => {
      result.current.dispatch({ type: 'set-status', taskIndex: 30, status: 'correct' });
      result.current.selectTask(1);
    });

    expect(result.current.currentTaskIndex).toBe(1);
    expect(result.current.currentTask.index).toBe(30);
    expect(result.current.currentTask.verificationStatus).toBe('correct');
    expect(result.current.issues).toEqual([]);
    expect(document.tasks[1].verificationStatus).toBeNull();
  });

  it('does not save on import, then debounces edits and task selection into an exact draft payload', async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const document = annotationDocument();
    const { result } = renderHook(() =>
      useAnnotationSession({ document, pdfPageCount: 9, repository: repository(save) }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(save).not.toHaveBeenCalled();

    act(() => {
      result.current.dispatch({ type: 'set-status', taskIndex: 10, status: 'correct' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(399);
    });
    expect(save).not.toHaveBeenCalled();

    act(() => result.current.selectTask(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(399);
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(save).toHaveBeenCalledTimes(1);
    const payload = save.mock.calls[0][0] as DraftPayload;
    expect(Object.keys(payload).sort()).toEqual(
      ['currentTaskIndex', 'fingerprint', 'savedAt', 'sourceName', 'tasks'].sort(),
    );
    expect(payload).toEqual(expect.objectContaining({
      fingerprint: 'fingerprint-synthetic',
      sourceName: 'synthetic.json',
      currentTaskIndex: 1,
      savedAt: expect.any(String),
    }));
    expect(payload.tasks[0].verificationStatus).toBe('correct');
    expect(JSON.stringify(payload)).not.toMatch(/pdf|blob|canvas|bytes/i);
    expect(result.current.draftState).toBe('saved');
  });

  it('reports autosave failures without throwing into the caller', async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockRejectedValue(new Error('quota exceeded'));
    const { result } = renderHook(() =>
      useAnnotationSession({
        document: annotationDocument(),
        pdfPageCount: null,
        repository: repository(save),
      }),
    );

    act(() => {
      result.current.dispatch({ type: 'set-status', taskIndex: 10, status: 'correct' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(result.current.draftState).toBe('error');
  });

  it('restores a normalized draft immutably and always supplies a currentTask for empty tasks', () => {
    const { result } = renderHook(() =>
      useAnnotationSession({
        document: annotationDocument(),
        pdfPageCount: null,
        repository: repository(),
      }),
    );
    const restoredTasks = [task(10, '已恢复')];

    act(() => result.current.restoreDraft({
      fingerprint: 'fingerprint-synthetic',
      sourceName: 'synthetic.json',
      tasks: restoredTasks,
      currentTaskIndex: 99,
      savedAt: new Date().toISOString(),
    }));

    expect(result.current.currentTaskIndex).toBe(0);
    expect(result.current.currentTask.reviewPoint).toBe('已恢复');
    expect(result.current.document.tasks).not.toBe(restoredTasks);

    act(() => result.current.restoreDraft({
      fingerprint: 'fingerprint-synthetic',
      sourceName: 'synthetic.json',
      tasks: [],
      currentTaskIndex: Number.NaN,
      savedAt: new Date().toISOString(),
    }));

    expect(result.current.currentTask).toBeDefined();
    expect(result.current.currentTaskIndex).toBe(0);
    expect(result.current.issues).toEqual([]);
  });
});

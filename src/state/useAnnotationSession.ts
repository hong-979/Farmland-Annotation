import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  AnnotationDocument,
  AnnotationTask,
  DraftPayload,
  ValidationIssue,
} from '../domain/types';
import { validateTask } from '../domain/validateTask';
import type { DraftRepository } from '../storage/draftRepository';
import { annotationReducer, type AnnotationAction } from './annotationReducer';

export interface AnnotationSession {
  document: AnnotationDocument;
  currentTaskIndex: number;
  currentTask: AnnotationTask;
  issues: ValidationIssue[];
  allIssues: ValidationIssue[];
  draftState: 'idle' | 'saving' | 'saved' | 'error';
  dispatch(action: AnnotationAction): void;
  selectTask(index: number): void;
  saveAndNext(): void;
  restoreDraft(payload: DraftPayload): void;
}

export interface AnnotationSessionOptions {
  document: AnnotationDocument;
  pdfPageCount: number | null;
  repository?: DraftRepository;
}

const EMPTY_TASK: AnnotationTask = {
  index: -1,
  label: null,
  reviewPoint: '',
  verificationStatus: null,
  evidenceFragments: [],
  judgmentBasis: '',
  pageNumbers: [],
  raw: {},
};

function normalizeIndex(index: number, taskCount: number): number {
  if (taskCount === 0) return 0;
  const normalized = Number.isFinite(index) ? Math.trunc(index) : 0;
  return Math.min(Math.max(normalized, 0), taskCount - 1);
}

export function useAnnotationSession({
  document: importedDocument,
  pdfPageCount,
  repository,
}: AnnotationSessionOptions): AnnotationSession {
  const [working, setWorking] = useState(() => ({
    tasks: structuredClone(importedDocument.tasks),
    currentTaskIndex: 0,
    revision: 0,
  }));
  const [draftState, setDraftState] = useState<AnnotationSession['draftState']>('idle');
  const saveGeneration = useRef(0);
  const { tasks } = working;
  const document = useMemo(
    () => ({ ...importedDocument, tasks }),
    [importedDocument, tasks],
  );
  const allIssues = useMemo(
    () => tasks.flatMap((task) => validateTask(task, pdfPageCount)),
    [pdfPageCount, tasks],
  );
  const normalizedIndex = normalizeIndex(working.currentTaskIndex, tasks.length);
  const currentTask = tasks[normalizedIndex] ?? EMPTY_TASK;
  const issues = allIssues.filter((issue) => issue.taskIndex === currentTask.index);

  useEffect(() => {
    if (working.revision === 0 || repository === undefined) return;

    const generation = saveGeneration.current + 1;
    saveGeneration.current = generation;
    const timer = window.setTimeout(() => {
      setDraftState('saving');
      const payload: DraftPayload = {
        fingerprint: importedDocument.fingerprint,
        sourceName: importedDocument.sourceName,
        tasks: structuredClone(working.tasks),
        currentTaskIndex: normalizeIndex(working.currentTaskIndex, working.tasks.length),
        savedAt: new Date().toISOString(),
      };

      void repository.save(payload).then(
        () => {
          if (saveGeneration.current === generation) setDraftState('saved');
        },
        () => {
          if (saveGeneration.current === generation) setDraftState('error');
        },
      );
    }, 400);

    return () => {
      window.clearTimeout(timer);
      if (saveGeneration.current === generation) saveGeneration.current += 1;
    };
  }, [importedDocument.fingerprint, importedDocument.sourceName, repository, working]);

  const dispatch = useCallback((action: AnnotationAction) => {
    setWorking((current) => {
      const nextTasks = annotationReducer(current.tasks, action);
      return nextTasks === current.tasks
        ? current
        : { ...current, tasks: nextTasks, revision: current.revision + 1 };
    });
  }, []);

  const selectTask = useCallback((index: number) => {
    setWorking((current) => {
      const nextIndex = normalizeIndex(index, current.tasks.length);
      return nextIndex === current.currentTaskIndex
        ? current
        : { ...current, currentTaskIndex: nextIndex, revision: current.revision + 1 };
    });
  }, []);

  const saveAndNext = useCallback(() => {
    setWorking((current) => ({
      ...current,
      currentTaskIndex: normalizeIndex(current.currentTaskIndex + 1, current.tasks.length),
      revision: current.revision + 1,
    }));
  }, []);

  const restoreDraft = useCallback((payload: DraftPayload) => {
    setWorking((current) => ({
      tasks: structuredClone(payload.tasks),
      currentTaskIndex: normalizeIndex(payload.currentTaskIndex, payload.tasks.length),
      revision: current.revision,
    }));
  }, []);

  return {
    document,
    currentTaskIndex: normalizedIndex,
    currentTask,
    issues,
    allIssues,
    draftState,
    dispatch,
    selectTask,
    saveAndNext,
    restoreDraft,
  };
}

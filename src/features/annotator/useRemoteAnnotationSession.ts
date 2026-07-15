import { useEffect, useMemo, useState } from 'react';

import {
  saveAnnotatorDraft,
  submitAnnotatorTask,
  type AnnotatorDocumentSession,
} from '../../api/annotatorApi';
import { fetchDocumentPdfFile } from '../../api/documentApi';
import { validateTask } from '../../domain/validateTask';
import type { DraftPayload, ValidationIssue } from '../../domain/types';
import { openPdfDocument, type PdfDocumentAdapter } from '../../pdf/pdfAdapter';
import { useAnnotationSession } from '../../state/useAnnotationSession';
import type { DraftRepository } from '../../storage/draftRepository';
import { buildRemoteAnnotationDocument, buildRemoteTaskPayload } from './remoteTaskMapper';

export function useRemoteAnnotationSession(
  remoteSession: AnnotatorDocumentSession,
  options: {
    onSubmitted(): void;
  },
) {
  const [pdfDocument, setPdfDocument] = useState<PdfDocumentAdapter | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const document = useMemo(
    () => buildRemoteAnnotationDocument(remoteSession),
    [remoteSession],
  );
  const taskIdByIndex = useMemo(
    () => new Map(remoteSession.tasks.map((task) => [task.taskIndex, task.id])),
    [remoteSession.tasks],
  );
  const repository = useMemo<DraftRepository>(
    () => ({
      load: async () => null,
      save: async (payload: DraftPayload) => {
        for (const task of payload.tasks) {
          const remoteTaskId = taskIdByIndex.get(task.index);
          if (!remoteTaskId) {
            continue;
          }

          await saveAnnotatorDraft(remoteTaskId, buildRemoteTaskPayload(task));
        }
      },
      remove: async () => undefined,
    }),
    [taskIdByIndex],
  );
  const session = useAnnotationSession({
    document,
    pdfPageCount: pdfDocument?.pageCount ?? null,
    repository,
  });

  useEffect(() => {
    let cancelled = false;
    let loadedDocument: PdfDocumentAdapter | null = null;

    setPdfDocument((previous) => {
      if (previous) {
        void previous.destroy();
      }
      return null;
    });

    void (async () => {
      try {
        const pdfFile = await fetchDocumentPdfFile(remoteSession.document.id);
        loadedDocument = await openPdfDocument(pdfFile);

        if (cancelled) {
          await loadedDocument.destroy();
          return;
        }

        setPdfDocument(loadedDocument);
        setPdfError(null);
      } catch (error) {
        if (!cancelled) {
          setPdfError(error instanceof Error ? error.message : 'PDF 打开失败，请稍后重试。');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (loadedDocument) {
        void loadedDocument.destroy();
      }
    };
  }, [remoteSession.document.id]);

  async function submitCurrentDocument() {
    const blockingIssues = session.document.tasks.flatMap((task, arrayIndex) =>
      validateTask(task, pdfDocument?.pageCount ?? null)
        .filter((issue) => issue.severity === 'error')
        .map((issue) => ({ issue, arrayIndex })),
    );

    if (blockingIssues.length > 0) {
      session.selectTask(blockingIssues[0].arrayIndex);
      const error = new Error(blockingIssues[0].issue.message) as Error & {
        validationIssues?: ValidationIssue[];
      };
      error.validationIssues = blockingIssues.map(({ issue }) => issue);
      throw error;
    }

    setSubmitting(true);

    try {
      for (const task of session.document.tasks) {
        const remoteTaskId = taskIdByIndex.get(task.index);
        if (!remoteTaskId) {
          throw new Error(`Remote task mapping missing for task index ${task.index}.`);
        }

        await submitAnnotatorTask(remoteTaskId, buildRemoteTaskPayload(task));
      }

      options.onSubmitted();
    } finally {
      setSubmitting(false);
    }
  }

  return {
    session,
    pdfDocument,
    pdfError,
    submitting,
    submitCurrentDocument,
  };
}

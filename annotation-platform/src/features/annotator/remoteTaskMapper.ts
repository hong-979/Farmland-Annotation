import type {
  AnnotatorDocumentSession,
  AnnotatorTaskRecord,
} from '../../api/annotatorApi';
import { parseAnnotationJson } from '../../domain/parseAnnotation';
import type { AnnotationDocument, AnnotationTask } from '../../domain/types';

const STATUS_OUTPUT = {
  correct: '[正确]',
  incorrect: '[错误]',
  not_applicable: '[未涉及]',
} as const;

export function buildRemoteAnnotationDocument(
  remoteSession: AnnotatorDocumentSession,
): AnnotationDocument {
  const tasks = remoteSession.tasks.map((task) => normalizeTask(task));

  return {
    sourceName: `${remoteSession.document.title}.json`,
    fingerprint: `remote-document-${remoteSession.document.id}`,
    rawRoot: {
      output: remoteSession.tasks.map((task) => structuredClone(task.payload)),
    },
    originalTasks: tasks.map(cloneTask),
    tasks: tasks.map(cloneTask),
  };
}

export function buildRemoteTaskPayload(task: AnnotationTask): Record<string, unknown> {
  return {
    ...structuredClone(task.raw),
    verification_status:
      task.verificationStatus === null ? '' : STATUS_OUTPUT[task.verificationStatus],
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

function normalizeTask(remoteTask: AnnotatorTaskRecord): AnnotationTask {
  const parsed = parseAnnotationJson(
    JSON.stringify({ output: [remoteTask.payload] }),
    `remote-task-${remoteTask.id}.json`,
    `remote-task-${remoteTask.id}`,
  );

  if (!parsed.ok || parsed.document.tasks.length !== 1) {
    throw new Error('远程任务数据无法解析，请联系管理员检查原始 JSON。');
  }

  const [parsedTask] = parsed.document.tasks;
  return {
    ...cloneTask(parsedTask),
    index: remoteTask.taskIndex,
    label: remoteTask.label,
    reviewPoint: remoteTask.reviewPoint,
  };
}

function cloneTask(task: AnnotationTask): AnnotationTask {
  return {
    ...task,
    evidenceFragments: task.evidenceFragments.map((fragment) => ({
      ...fragment,
      raw: structuredClone(fragment.raw),
    })),
    pageNumbers: [...task.pageNumbers],
    raw: structuredClone(task.raw),
  };
}

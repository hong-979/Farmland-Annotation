import type {
  AnnotationTask,
  EvidenceFragment,
  VerificationStatus,
} from '../domain/types';

export type AnnotationAction =
  | { type: 'set-status'; taskIndex: number; status: VerificationStatus }
  | { type: 'set-basis'; taskIndex: number; value: string }
  | { type: 'add-evidence'; taskIndex: number; evidence: EvidenceFragment }
  | {
      type: 'update-evidence';
      taskIndex: number;
      evidenceId: string;
      patch: Partial<Pick<EvidenceFragment, 'pageNumber' | 'originalText' | 'evidenceRole'>>;
    }
  | { type: 'remove-evidence'; taskIndex: number; evidenceId: string }
  | { type: 'replace-tasks'; tasks: AnnotationTask[] };

const recalculatePages = (task: AnnotationTask): AnnotationTask => ({
  ...task,
  pageNumbers: [
    ...new Set(
      task.evidenceFragments.flatMap((evidence) =>
        evidence.pageNumber !== null && evidence.pageNumber > 0 ? [evidence.pageNumber] : [],
      ),
    ),
  ].sort((left, right) => left - right),
});

export function annotationReducer(tasks: AnnotationTask[], action: AnnotationAction): AnnotationTask[] {
  if (action.type === 'replace-tasks') {
    return structuredClone(action.tasks);
  }

  return tasks.map((task, index) => {
    if (index !== action.taskIndex) {
      return task;
    }

    if (action.type === 'set-status') {
      return { ...task, verificationStatus: action.status };
    }

    if (action.type === 'set-basis') {
      return { ...task, judgmentBasis: action.value };
    }

    if (action.type === 'add-evidence') {
      return recalculatePages({
        ...task,
        evidenceFragments: [...task.evidenceFragments, structuredClone(action.evidence)],
      });
    }

    if (action.type === 'update-evidence') {
      return recalculatePages({
        ...task,
        evidenceFragments: task.evidenceFragments.map((item) =>
          item.id === action.evidenceId ? { ...item, ...action.patch } : item,
        ),
      });
    }

    return recalculatePages({
      ...task,
      evidenceFragments: task.evidenceFragments.filter((item) => item.id !== action.evidenceId),
    });
  });
}

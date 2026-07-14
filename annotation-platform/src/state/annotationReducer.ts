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
        evidence.pageNumber !== null &&
        Number.isSafeInteger(evidence.pageNumber) &&
        evidence.pageNumber > 0
          ? [evidence.pageNumber]
          : [],
      ),
    ),
  ].sort((left, right) => left - right),
});

const taskAtIndex = (tasks: AnnotationTask[], taskIndex: number): AnnotationTask | undefined =>
  Number.isInteger(taskIndex) && taskIndex >= 0 && taskIndex < tasks.length
    ? tasks[taskIndex]
    : undefined;

const replaceTaskAtIndex = (
  tasks: AnnotationTask[],
  taskIndex: number,
  nextTask: AnnotationTask,
): AnnotationTask[] => tasks.map((task, index) => (index === taskIndex ? nextTask : task));

function assertNever(action: never): never {
  throw new Error(`Unhandled annotation action: ${JSON.stringify(action)}`);
}

export function annotationReducer(tasks: AnnotationTask[], action: AnnotationAction): AnnotationTask[] {
  switch (action.type) {
    case 'replace-tasks':
      return structuredClone(action.tasks);

    case 'set-status': {
      const task = taskAtIndex(tasks, action.taskIndex);
      return task === undefined
        ? tasks
        : replaceTaskAtIndex(tasks, action.taskIndex, {
            ...task,
            verificationStatus: action.status,
          });
    }

    case 'set-basis': {
      const task = taskAtIndex(tasks, action.taskIndex);
      return task === undefined
        ? tasks
        : replaceTaskAtIndex(tasks, action.taskIndex, {
            ...task,
            judgmentBasis: action.value,
          });
    }

    case 'add-evidence': {
      const task = taskAtIndex(tasks, action.taskIndex);
      return task === undefined
        ? tasks
        : replaceTaskAtIndex(
            tasks,
            action.taskIndex,
            recalculatePages({
              ...task,
              evidenceFragments: [...task.evidenceFragments, structuredClone(action.evidence)],
            }),
          );
    }

    case 'update-evidence': {
      const task = taskAtIndex(tasks, action.taskIndex);
      if (
        task === undefined ||
        !task.evidenceFragments.some((item) => item.id === action.evidenceId)
      ) {
        return tasks;
      }

      return replaceTaskAtIndex(
        tasks,
        action.taskIndex,
        recalculatePages({
          ...task,
          evidenceFragments: task.evidenceFragments.map((item) =>
            item.id === action.evidenceId ? { ...item, ...action.patch } : item,
          ),
        }),
      );
    }

    case 'remove-evidence': {
      const task = taskAtIndex(tasks, action.taskIndex);
      if (
        task === undefined ||
        !task.evidenceFragments.some((item) => item.id === action.evidenceId)
      ) {
        return tasks;
      }

      return replaceTaskAtIndex(
        tasks,
        action.taskIndex,
        recalculatePages({
          ...task,
          evidenceFragments: task.evidenceFragments.filter((item) => item.id !== action.evidenceId),
        }),
      );
    }

    default:
      return assertNever(action);
  }
}

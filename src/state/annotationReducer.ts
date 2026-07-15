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

interface TaskLocation {
  arrayIndex: number;
  task: AnnotationTask;
}

const locateTaskByStableIndex = (
  tasks: AnnotationTask[],
  taskIndex: number,
): TaskLocation | undefined => {
  if (!Number.isSafeInteger(taskIndex) || taskIndex < 0) {
    return undefined;
  }

  let match: TaskLocation | undefined;
  for (let arrayIndex = 0; arrayIndex < tasks.length; arrayIndex += 1) {
    const task = tasks[arrayIndex];
    if (task.index !== taskIndex) {
      continue;
    }
    if (match !== undefined) {
      return undefined;
    }
    match = { arrayIndex, task };
  }

  return match;
};

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
      const location = locateTaskByStableIndex(tasks, action.taskIndex);
      return location === undefined
        ? tasks
        : replaceTaskAtIndex(tasks, location.arrayIndex, {
            ...location.task,
            verificationStatus: action.status,
          });
    }

    case 'set-basis': {
      const location = locateTaskByStableIndex(tasks, action.taskIndex);
      return location === undefined
        ? tasks
        : replaceTaskAtIndex(tasks, location.arrayIndex, {
            ...location.task,
            judgmentBasis: action.value,
          });
    }

    case 'add-evidence': {
      const location = locateTaskByStableIndex(tasks, action.taskIndex);
      return location === undefined
        ? tasks
        : replaceTaskAtIndex(
            tasks,
            location.arrayIndex,
            recalculatePages({
              ...location.task,
              evidenceFragments: [
                ...location.task.evidenceFragments,
                structuredClone(action.evidence),
              ],
            }),
          );
    }

    case 'update-evidence': {
      const location = locateTaskByStableIndex(tasks, action.taskIndex);
      if (
        location === undefined ||
        !location.task.evidenceFragments.some((item) => item.id === action.evidenceId)
      ) {
        return tasks;
      }

      return replaceTaskAtIndex(
        tasks,
        location.arrayIndex,
        recalculatePages({
          ...location.task,
          evidenceFragments: location.task.evidenceFragments.map((item) =>
            item.id === action.evidenceId ? { ...item, ...action.patch } : item,
          ),
        }),
      );
    }

    case 'remove-evidence': {
      const location = locateTaskByStableIndex(tasks, action.taskIndex);
      if (
        location === undefined ||
        !location.task.evidenceFragments.some((item) => item.id === action.evidenceId)
      ) {
        return tasks;
      }

      return replaceTaskAtIndex(
        tasks,
        location.arrayIndex,
        recalculatePages({
          ...location.task,
          evidenceFragments: location.task.evidenceFragments.filter(
            (item) => item.id !== action.evidenceId,
          ),
        }),
      );
    }

    default:
      return assertNever(action);
  }
}

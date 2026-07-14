import type { AnnotationTask, ValidationIssue } from '../domain/types';
import type { AnnotationAction } from '../state/annotationReducer';
import { EvidenceEditor } from './EvidenceEditor';

interface AnnotationPanelProps {
  task: AnnotationTask;
  issues: ValidationIssue[];
  onAction(action: AnnotationAction): void;
  onJumpToPage(page: number): void;
  onSaveAndNext(): void;
}

const decisions = [
  { label: '正确', value: 'correct' },
  { label: '错误', value: 'incorrect' },
  { label: '未涉及', value: 'not_applicable' },
] as const;

function issuesAtPath(issues: ValidationIssue[], taskIndex: number, path: string) {
  return issues.filter((issue) => issue.taskIndex === taskIndex && issue.path === path);
}

function IssueMessages({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) {
    return null;
  }

  return (
    <ul>
      {issues.map((issue) => (
        <li key={`${issue.code}:${issue.path}:${issue.message}`}>{issue.message}</li>
      ))}
    </ul>
  );
}

export function AnnotationPanel({
  task,
  issues,
  onAction,
  onJumpToPage,
  onSaveAndNext,
}: AnnotationPanelProps) {
  const statusIssues = issuesAtPath(
    issues,
    task.index,
    `tasks[${task.index}].verificationStatus`,
  );
  const basisIssues = issuesAtPath(
    issues,
    task.index,
    `tasks[${task.index}].judgmentBasis`,
  );
  const hasCurrentTaskError = issues.some(
    (issue) => issue.taskIndex === task.index && issue.severity === 'error',
  );

  return (
    <section aria-label="专家标注">
      {task.label !== null ? <p>{task.label}</p> : null}
      <article aria-label="审查要点">
        <h2>审查要点</h2>
        <p>{task.reviewPoint}</p>
      </article>
      <fieldset>
        <legend>专家判断</legend>
        {decisions.map((decision) => (
          <label key={decision.value}>
            <input
              type="radio"
              name={`task-${task.index}-verification-status`}
              value={decision.value}
              checked={task.verificationStatus === decision.value}
              onChange={() =>
                onAction({
                  type: 'set-status',
                  taskIndex: task.index,
                  status: decision.value,
                })
              }
            />
            {decision.label}
          </label>
        ))}
        <IssueMessages issues={statusIssues} />
      </fieldset>
      <div>
        <label>
          判断依据
          <textarea
            value={task.judgmentBasis}
            onChange={(event) =>
              onAction({ type: 'set-basis', taskIndex: task.index, value: event.target.value })
            }
          />
        </label>
        <IssueMessages issues={basisIssues} />
      </div>
      <EvidenceEditor
        taskIndex={task.index}
        evidence={task.evidenceFragments}
        issues={issues}
        onAction={onAction}
        onJumpToPage={onJumpToPage}
      />
      <button type="button" disabled={hasCurrentTaskError} onClick={onSaveAndNext}>
        保存并下一条
      </button>
    </section>
  );
}

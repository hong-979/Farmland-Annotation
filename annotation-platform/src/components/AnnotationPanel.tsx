import { useId } from 'react';

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

function IssueMessages({ issues, id }: { issues: ValidationIssue[]; id: string }) {
  if (issues.length === 0) {
    return null;
  }

  return (
    <ul className="form-issues" id={id}>
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
  const radioGroupId = useId();
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
  const statusIssueListId = `${radioGroupId}-status-issues`;
  const basisIssueListId = `${radioGroupId}-basis-issues`;
  const statusDescribedBy = statusIssues.length > 0 ? statusIssueListId : undefined;
  const basisDescribedBy = basisIssues.length > 0 ? basisIssueListId : undefined;
  const statusInvalid = statusIssues.some((issue) => issue.severity === 'error');
  const basisInvalid = basisIssues.some((issue) => issue.severity === 'error');

  return (
    <section className="annotation-panel" aria-label="专家标注">
      <header className="annotation-panel__header">
        <div>
          <p className="annotation-panel__eyebrow">当前审核点</p>
          <h2 className="annotation-panel__title">{task.label ?? '未分组'}</h2>
        </div>
        <button
          className="secondary-button"
          type="button"
          disabled={hasCurrentTaskError}
          onClick={onSaveAndNext}
        >
          保存并下一条
        </button>
      </header>

      <article className="annotation-card" aria-label="审查要点">
        <p className="annotation-card__label">审查要点</p>
        <p className="annotation-card__content">{task.reviewPoint}</p>
      </article>

      <fieldset
        className="annotation-section"
        aria-describedby={statusDescribedBy}
        aria-invalid={statusInvalid ? true : undefined}
      >
        <legend>专家判断</legend>
        <div className="annotation-decision-grid">
          {decisions.map((decision) => (
            <label key={decision.value} className="decision-card">
              <input
                type="radio"
                name={`${radioGroupId}-task-${task.index}-verification-status`}
                value={decision.value}
                checked={task.verificationStatus === decision.value}
                aria-describedby={statusDescribedBy}
                aria-invalid={statusInvalid ? true : undefined}
                onChange={() =>
                  onAction({
                    type: 'set-status',
                    taskIndex: task.index,
                    status: decision.value,
                  })
                }
              />
              <span>{decision.label}</span>
            </label>
          ))}
        </div>
        <IssueMessages issues={statusIssues} id={statusIssueListId} />
      </fieldset>

      <section className="annotation-section">
        <label className="field" htmlFor={`${radioGroupId}-basis`}>
          <span>判断依据</span>
          <textarea
            id={`${radioGroupId}-basis`}
            className="annotation-textarea"
            value={task.judgmentBasis}
            aria-describedby={basisDescribedBy}
            aria-invalid={basisInvalid ? true : undefined}
            onChange={(event) =>
              onAction({ type: 'set-basis', taskIndex: task.index, value: event.target.value })
            }
          />
        </label>
        <IssueMessages issues={basisIssues} id={basisIssueListId} />
      </section>

      <EvidenceEditor
        taskIndex={task.index}
        evidence={task.evidenceFragments}
        issues={issues}
        onAction={onAction}
        onJumpToPage={onJumpToPage}
      />
    </section>
  );
}

import { useId } from 'react';

import type { EvidenceFragment, ValidationIssue } from '../domain/types';
import type { AnnotationAction } from '../state/annotationReducer';

interface EvidenceEditorProps {
  taskIndex: number;
  evidence: EvidenceFragment[];
  issues: ValidationIssue[];
  onAction(action: AnnotationAction): void;
  onJumpToPage(page: number): void;
}

function parsePageNumber(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const pageNumber = Number(normalized);
  return Number.isSafeInteger(pageNumber) && pageNumber > 0 ? pageNumber : null;
}

function isValidPageNumber(pageNumber: number | null): pageNumber is number {
  return Number.isSafeInteger(pageNumber) && pageNumber !== null && pageNumber > 0;
}

function issuesAtPath(
  issues: ValidationIssue[],
  taskIndex: number,
  evidenceIndex: number,
  field: 'pageNumber' | 'originalText' | 'evidenceRole',
) {
  const path = `tasks[${taskIndex}].evidenceFragments[${evidenceIndex}].${field}`;
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

interface EvidenceRowProps {
  taskIndex: number;
  fragment: EvidenceFragment;
  evidenceIndex: number;
  issues: ValidationIssue[];
  onAction(action: AnnotationAction): void;
  onJumpToPage(page: number): void;
}

function EvidenceRow({
  taskIndex,
  fragment,
  evidenceIndex,
  issues,
  onAction,
  onJumpToPage,
}: EvidenceRowProps) {
  const fieldIdPrefix = useId();
  const sequence = evidenceIndex + 1;
  const pageId = `${fieldIdPrefix}-page`;
  const textId = `${fieldIdPrefix}-text`;
  const roleId = `${fieldIdPrefix}-role`;
  const pageIssueListId = `${fieldIdPrefix}-page-issues`;
  const textIssueListId = `${fieldIdPrefix}-text-issues`;
  const roleIssueListId = `${fieldIdPrefix}-role-issues`;
  const pageIssues = issuesAtPath(issues, taskIndex, evidenceIndex, 'pageNumber');
  const textIssues = issuesAtPath(issues, taskIndex, evidenceIndex, 'originalText');
  const roleIssues = issuesAtPath(issues, taskIndex, evidenceIndex, 'evidenceRole');
  const pageNumber = fragment.pageNumber;

  return (
    <fieldset className="evidence-card">
      <legend>证据 {sequence}</legend>
      <div className="evidence-card__grid">
        <div className="field">
          <label htmlFor={pageId}>证据 {sequence} 页码</label>
          <div className="evidence-page-row">
            <input
              id={pageId}
              type="text"
              inputMode="numeric"
              value={fragment.pageNumber ?? ''}
              aria-describedby={pageIssues.length > 0 ? pageIssueListId : undefined}
              aria-invalid={pageIssues.some((issue) => issue.severity === 'error') ? true : undefined}
              onChange={(event) =>
                onAction({
                  type: 'update-evidence',
                  taskIndex,
                  evidenceId: fragment.id,
                  patch: { pageNumber: parsePageNumber(event.target.value) },
                })
              }
            />
            {isValidPageNumber(pageNumber) ? (
              <button
                className="secondary-button"
                type="button"
                onClick={() => onJumpToPage(pageNumber)}
              >
                跳转到第 {pageNumber} 页
              </button>
            ) : null}
          </div>
          <IssueMessages issues={pageIssues} id={pageIssueListId} />
        </div>

        <div className="field">
          <label htmlFor={roleId}>证据 {sequence} 作用</label>
          <input
            id={roleId}
            type="text"
            value={fragment.evidenceRole}
            aria-describedby={roleIssues.length > 0 ? roleIssueListId : undefined}
            aria-invalid={roleIssues.some((issue) => issue.severity === 'error') ? true : undefined}
            onChange={(event) =>
              onAction({
                type: 'update-evidence',
                taskIndex,
                evidenceId: fragment.id,
                patch: { evidenceRole: event.target.value },
              })
            }
          />
          <IssueMessages issues={roleIssues} id={roleIssueListId} />
        </div>
      </div>

      <div className="field">
        <label htmlFor={textId}>证据 {sequence} 原文</label>
        <textarea
          id={textId}
          className="annotation-textarea annotation-textarea--evidence"
          value={fragment.originalText}
          aria-describedby={textIssues.length > 0 ? textIssueListId : undefined}
          aria-invalid={textIssues.some((issue) => issue.severity === 'error') ? true : undefined}
          onChange={(event) =>
            onAction({
              type: 'update-evidence',
              taskIndex,
              evidenceId: fragment.id,
              patch: { originalText: event.target.value },
            })
          }
        />
        <IssueMessages issues={textIssues} id={textIssueListId} />
      </div>

      <div className="evidence-card__actions">
        <button
          className="secondary-button"
          type="button"
          onClick={() =>
            onAction({ type: 'remove-evidence', taskIndex, evidenceId: fragment.id })
          }
        >
          删除证据 {sequence}
        </button>
      </div>
    </fieldset>
  );
}

export function EvidenceEditor({
  taskIndex,
  evidence,
  issues,
  onAction,
  onJumpToPage,
}: EvidenceEditorProps) {
  const evidenceIssueListId = useId();
  const evidenceIssues = issues.filter(
    (issue) =>
      issue.taskIndex === taskIndex &&
      issue.path === `tasks[${taskIndex}].evidenceFragments`,
  );

  const addEvidence = () => {
    const newEvidence: EvidenceFragment = {
      id: crypto.randomUUID(),
      pageNumber: null,
      originalText: '',
      evidenceRole: '',
      raw: {},
    };
    onAction({ type: 'add-evidence', taskIndex, evidence: newEvidence });
  };

  return (
    <section className="annotation-section" aria-label="证据编辑">
      <div className="annotation-section__header">
        <div>
          <h2>证据</h2>
          <p>按页码、原文和作用逐条补充，方便复核与导出。</p>
        </div>
        <button className="primary-button" type="button" onClick={addEvidence}>
          新增证据
        </button>
      </div>
      <IssueMessages issues={evidenceIssues} id={evidenceIssueListId} />
      <div className="evidence-list">
        {evidence.map((fragment, evidenceIndex) => (
          <EvidenceRow
            key={fragment.id}
            taskIndex={taskIndex}
            fragment={fragment}
            evidenceIndex={evidenceIndex}
            issues={issues}
            onAction={onAction}
            onJumpToPage={onJumpToPage}
          />
        ))}
      </div>
    </section>
  );
}

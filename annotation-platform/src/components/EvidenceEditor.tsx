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

export function EvidenceEditor({
  taskIndex,
  evidence,
  issues,
  onAction,
  onJumpToPage,
}: EvidenceEditorProps) {
  const fieldIdPrefix = useId();
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
    <section aria-label="证据编辑">
      <h2>证据</h2>
      <IssueMessages issues={evidenceIssues} />
      {evidence.map((fragment, evidenceIndex) => {
        const sequence = evidenceIndex + 1;
        const pageId = `${fieldIdPrefix}-evidence-${evidenceIndex}-page`;
        const textId = `${fieldIdPrefix}-evidence-${evidenceIndex}-text`;
        const roleId = `${fieldIdPrefix}-evidence-${evidenceIndex}-role`;
        const pageIssues = issuesAtPath(issues, taskIndex, evidenceIndex, 'pageNumber');
        const textIssues = issuesAtPath(issues, taskIndex, evidenceIndex, 'originalText');
        const roleIssues = issuesAtPath(issues, taskIndex, evidenceIndex, 'evidenceRole');
        const pageNumber = fragment.pageNumber;

        return (
          <fieldset key={fragment.id}>
            <legend>证据 {sequence}</legend>
            <div>
              <label htmlFor={pageId}>证据 {sequence} 页码</label>
              <input
                id={pageId}
                type="text"
                inputMode="numeric"
                value={fragment.pageNumber ?? ''}
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
                <button type="button" onClick={() => onJumpToPage(pageNumber)}>
                  跳转到第 {pageNumber} 页
                </button>
              ) : null}
              <IssueMessages issues={pageIssues} />
            </div>
            <div>
              <label htmlFor={textId}>证据 {sequence} 原文</label>
              <textarea
                id={textId}
                value={fragment.originalText}
                onChange={(event) =>
                  onAction({
                    type: 'update-evidence',
                    taskIndex,
                    evidenceId: fragment.id,
                    patch: { originalText: event.target.value },
                  })
                }
              />
              <IssueMessages issues={textIssues} />
            </div>
            <div>
              <label htmlFor={roleId}>证据 {sequence} 作用</label>
              <input
                id={roleId}
                type="text"
                value={fragment.evidenceRole}
                onChange={(event) =>
                  onAction({
                    type: 'update-evidence',
                    taskIndex,
                    evidenceId: fragment.id,
                    patch: { evidenceRole: event.target.value },
                  })
                }
              />
              <IssueMessages issues={roleIssues} />
            </div>
            <button
              type="button"
              onClick={() =>
                onAction({ type: 'remove-evidence', taskIndex, evidenceId: fragment.id })
              }
            >
              删除证据 {sequence}
            </button>
          </fieldset>
        );
      })}
      <button type="button" onClick={addEvidence}>新增证据</button>
    </section>
  );
}

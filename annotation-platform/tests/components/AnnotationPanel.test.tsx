import { useReducer } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnnotationPanel } from '../../src/components/AnnotationPanel';
import type { AnnotationTask, ValidationIssue } from '../../src/domain/types';
import { annotationReducer } from '../../src/state/annotationReducer';
import type { AnnotationAction } from '../../src/state/annotationReducer';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const task = (overrides: Partial<AnnotationTask> = {}): AnnotationTask => ({
  index: 0,
  label: '水资源',
  reviewPoint: '核对可供水量是否包含计算过程。',
  verificationStatus: null,
  evidenceFragments: [],
  judgmentBasis: '',
  pageNumbers: [],
  raw: {},
  ...overrides,
});

const issue = (overrides: Partial<ValidationIssue> = {}): ValidationIssue => ({
  severity: 'error',
  code: 'synthetic.issue',
  path: 'tasks[0].verificationStatus',
  message: '请选择专家判断。',
  taskIndex: 0,
  ...overrides,
});

function renderPanel(
  currentTask: AnnotationTask = task(),
  issues: ValidationIssue[] = [],
) {
  const onAction = vi.fn<(action: AnnotationAction) => void>();
  const onJumpToPage = vi.fn<(page: number) => void>();
  const onSaveAndNext = vi.fn<() => void>();

  const view = render(
    <AnnotationPanel
      task={currentTask}
      issues={issues}
      onAction={onAction}
      onJumpToPage={onJumpToPage}
      onSaveAndNext={onSaveAndNext}
    />,
  );

  return { ...view, onAction, onJumpToPage, onSaveAndNext };
}

function StatefulPanel({ initialTask }: { initialTask: AnnotationTask }) {
  const [tasks, dispatch] = useReducer(annotationReducer, [initialTask]);

  return (
    <AnnotationPanel
      task={tasks[0]}
      issues={[]}
      onAction={dispatch}
      onJumpToPage={vi.fn()}
      onSaveAndNext={vi.fn()}
    />
  );
}

describe('AnnotationPanel', () => {
  it('renders label conditionally and review point as read-only content', () => {
    const { rerender } = renderPanel();

    expect(screen.getByText('水资源')).toBeInTheDocument();
    const reviewPoint = screen.getByRole('article', { name: '审查要点' });
    expect(within(reviewPoint).getByText('核对可供水量是否包含计算过程。')).toBeInTheDocument();
    expect(screen.queryByLabelText('修改审查要点')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('水资源')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('核对可供水量是否包含计算过程。')).not.toBeInTheDocument();

    rerender(
      <AnnotationPanel
        task={task({ label: null })}
        issues={[]}
        onAction={vi.fn()}
        onJumpToPage={vi.fn()}
        onSaveAndNext={vi.fn()}
      />,
    );

    expect(screen.queryByText('水资源')).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: '审查要点' })).toBeInTheDocument();
  });

  it('emits exact actions for all three decisions and the judgment basis', async () => {
    const user = userEvent.setup();
    const { onAction } = renderPanel();

    await user.click(screen.getByRole('radio', { name: '正确' }));
    await user.click(screen.getByRole('radio', { name: '错误' }));
    await user.click(screen.getByRole('radio', { name: '未涉及' }));
    fireEvent.change(screen.getByRole('textbox', { name: '判断依据' }), {
      target: { value: '计算过程缺失。' },
    });

    expect(onAction).toHaveBeenNthCalledWith(1, {
      type: 'set-status',
      taskIndex: 0,
      status: 'correct',
    });
    expect(onAction).toHaveBeenNthCalledWith(2, {
      type: 'set-status',
      taskIndex: 0,
      status: 'incorrect',
    });
    expect(onAction).toHaveBeenNthCalledWith(3, {
      type: 'set-status',
      taskIndex: 0,
      status: 'not_applicable',
    });
    expect(onAction).toHaveBeenNthCalledWith(4, {
      type: 'set-basis',
      taskIndex: 0,
      value: '计算过程缺失。',
    });
    expect(onAction).toHaveBeenCalledTimes(4);
  });

  it('keeps radio groups isolated across panel instances with the same task index', async () => {
    const user = userEvent.setup();

    render(
      <>
        <section aria-label="面板一">
          <StatefulPanel initialTask={task({ label: '面板一' })} />
        </section>
        <section aria-label="面板二">
          <StatefulPanel initialTask={task({ label: '面板二' })} />
        </section>
      </>,
    );

    const firstPanel = screen.getByRole('region', { name: '面板一' });
    const secondPanel = screen.getByRole('region', { name: '面板二' });
    const firstCorrect = within(firstPanel).getByRole('radio', { name: '正确' });
    const secondIncorrect = within(secondPanel).getByRole('radio', { name: '错误' });

    expect(firstCorrect).not.toHaveAttribute('name', secondIncorrect.getAttribute('name'));
    await user.click(firstCorrect);
    await user.click(secondIncorrect);
    expect(firstCorrect).toBeChecked();
    expect(secondIncorrect).toBeChecked();
  });

  it('completes a stateful edit cycle for a stable task index at array position zero', async () => {
    const user = userEvent.setup();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000010');
    render(
      <StatefulPanel
        initialTask={task({ index: 10, evidenceFragments: [], judgmentBasis: '' })}
      />,
    );

    const incorrect = screen.getByRole('radio', { name: '错误' });
    await user.click(incorrect);
    expect(incorrect).toBeChecked();

    fireEvent.change(screen.getByRole('textbox', { name: '判断依据' }), {
      target: { value: '状态化判断依据' },
    });
    expect(screen.getByRole('textbox', { name: '判断依据' })).toHaveValue('状态化判断依据');

    await user.click(screen.getByRole('button', { name: '新增证据' }));
    expect(screen.getByRole('group', { name: '证据 1' })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: '证据 1 页码' }), {
      target: { value: '6' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '证据 1 原文' }), {
      target: { value: '新增后的证据原文' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '证据 1 作用' }), {
      target: { value: '直接支持' },
    });

    expect(screen.getByRole('textbox', { name: '证据 1 页码' })).toHaveValue('6');
    expect(screen.getByRole('textbox', { name: '证据 1 原文' })).toHaveValue('新增后的证据原文');
    expect(screen.getByRole('textbox', { name: '证据 1 作用' })).toHaveValue('直接支持');
    expect(screen.getByRole('button', { name: '跳转到第 6 页' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '删除证据 1' }));
    expect(screen.queryByRole('group', { name: '证据 1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: '证据 1 页码' })).not.toBeInTheDocument();
  });

  it('adds, edits, jumps to, and removes evidence with exact actions', async () => {
    const user = userEvent.setup();
    const randomUUID = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValue('00000000-0000-4000-8000-000000000009');
    const currentTask = task({
      index: 7,
      evidenceFragments: [
        {
          id: 'evidence-1',
          pageNumber: 2,
          originalText: '原始证据文本',
          evidenceRole: '直接支持',
          raw: { preserve: true },
        },
      ],
    });
    const { onAction, onJumpToPage } = renderPanel(currentTask);

    expect(randomUUID).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '新增证据' }));
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenNthCalledWith(1, {
      type: 'add-evidence',
      taskIndex: 7,
      evidence: {
        id: '00000000-0000-4000-8000-000000000009',
        pageNumber: null,
        originalText: '',
        evidenceRole: '',
        raw: {},
      },
    });

    fireEvent.change(screen.getByRole('textbox', { name: '证据 1 页码' }), {
      target: { value: ' 12 ' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '证据 1 原文' }), {
      target: { value: '更新后的原文' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '证据 1 作用' }), {
      target: { value: '直接冲突' },
    });

    expect(onAction).toHaveBeenNthCalledWith(2, {
      type: 'update-evidence',
      taskIndex: 7,
      evidenceId: 'evidence-1',
      patch: { pageNumber: 12 },
    });
    expect(onAction).toHaveBeenNthCalledWith(3, {
      type: 'update-evidence',
      taskIndex: 7,
      evidenceId: 'evidence-1',
      patch: { originalText: '更新后的原文' },
    });
    expect(onAction).toHaveBeenNthCalledWith(4, {
      type: 'update-evidence',
      taskIndex: 7,
      evidenceId: 'evidence-1',
      patch: { evidenceRole: '直接冲突' },
    });

    await user.click(screen.getByRole('button', { name: '跳转到第 2 页' }));
    expect(onJumpToPage).toHaveBeenCalledWith(2);

    await user.click(screen.getByRole('button', { name: '删除证据 1' }));
    expect(onAction).toHaveBeenNthCalledWith(5, {
      type: 'remove-evidence',
      taskIndex: 7,
      evidenceId: 'evidence-1',
    });
    expect(onAction).toHaveBeenCalledTimes(5);
  });

  it('maps every invalid page text to null and hides jumps for invalid current pages', () => {
    const invalidPageText = ['', '   ', '0', '-1', '1.5', '1e2', '9007199254740992'];
    const currentTask = task({
      evidenceFragments: [
        {
          id: 'invalid-page',
          pageNumber: 5,
          originalText: '',
          evidenceRole: '',
          raw: {},
        },
      ],
    });
    const { rerender, onAction, onJumpToPage, onSaveAndNext } = renderPanel(currentTask);
    const pageInput = screen.getByRole('textbox', { name: '证据 1 页码' });

    invalidPageText.forEach((value) => {
      onAction.mockClear();
      fireEvent.change(pageInput, { target: { value } });
      expect(onAction).toHaveBeenCalledWith({
        type: 'update-evidence',
        taskIndex: 0,
        evidenceId: 'invalid-page',
        patch: { pageNumber: null },
      });
    });

    rerender(
      <AnnotationPanel
        task={{
          ...currentTask,
          evidenceFragments: [{ ...currentTask.evidenceFragments[0], pageNumber: 0 }],
        }}
        issues={[]}
        onAction={onAction}
        onJumpToPage={onJumpToPage}
        onSaveAndNext={onSaveAndNext}
      />,
    );
    expect(screen.queryByRole('button', { name: /跳转到第/ })).not.toBeInTheDocument();
  });

  it('shows validation beside the exact task, evidence index, and affected field', () => {
    const currentTask = task({
      index: 3,
      evidenceFragments: [
        {
          id: 'first-evidence',
          pageNumber: 1,
          originalText: '第一条',
          evidenceRole: '支持',
          raw: {},
        },
        {
          id: 'second-evidence',
          pageNumber: null,
          originalText: '第二条',
          evidenceRole: '冲突',
          raw: {},
        },
      ],
    });
    renderPanel(currentTask, [
      issue({
        path: 'tasks[3].verificationStatus',
        taskIndex: 3,
        message: '当前判断必填',
      }),
      issue({
        severity: 'warning',
        path: 'tasks[3].judgmentBasis',
        taskIndex: 3,
        message: '当前依据提示',
      }),
      issue({
        path: 'tasks[3].evidenceFragments',
        taskIndex: 3,
        message: '当前任务至少需要一条证据',
      }),
      issue({
        path: 'tasks[3].evidenceFragments[0].originalText',
        taskIndex: 3,
        message: '第一条原文错误',
      }),
      issue({
        path: 'tasks[3].evidenceFragments[1].pageNumber',
        taskIndex: 3,
        message: '第二条页码错误',
      }),
      issue({
        path: 'tasks[4].verificationStatus',
        taskIndex: 4,
        message: '其他任务判断错误',
      }),
      issue({
        path: 'tasks[4].evidenceFragments[0].originalText',
        taskIndex: 4,
        message: '其他任务证据错误',
      }),
    ]);

    expect(within(screen.getByRole('group', { name: '专家判断' })).getByText('当前判断必填')).toBeInTheDocument();
    const basisField = screen.getByRole('textbox', { name: '判断依据' }).closest('div');
    expect(basisField).not.toBeNull();
    expect(within(basisField as HTMLElement).getByText('当前依据提示')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: '证据编辑' })).getByText(
        '当前任务至少需要一条证据',
      ),
    ).toBeInTheDocument();

    const firstEvidence = screen.getByRole('group', { name: '证据 1' });
    const secondEvidence = screen.getByRole('group', { name: '证据 2' });
    expect(within(firstEvidence).getByText('第一条原文错误')).toBeInTheDocument();
    expect(within(firstEvidence).queryByText('第二条页码错误')).not.toBeInTheDocument();
    expect(within(secondEvidence).getByText('第二条页码错误')).toBeInTheDocument();
    expect(within(secondEvidence).queryByText('第一条原文错误')).not.toBeInTheDocument();
    expect(screen.queryByText('其他任务判断错误')).not.toBeInTheDocument();
    expect(screen.queryByText('其他任务证据错误')).not.toBeInTheDocument();
  });

  it('associates exact task and evidence issues with fields and marks only errors invalid', () => {
    const currentTask = task({
      index: 3,
      evidenceFragments: [
        {
          id: 'evidence-private-id',
          pageNumber: 2,
          originalText: '证据原文',
          evidenceRole: '支持',
          raw: {},
        },
      ],
    });
    renderPanel(currentTask, [
      issue({ path: 'tasks[3].verificationStatus', taskIndex: 3, message: '判断错误' }),
      issue({
        severity: 'warning',
        path: 'tasks[3].judgmentBasis',
        taskIndex: 3,
        message: '依据警告',
      }),
      issue({
        path: 'tasks[3].evidenceFragments[0].pageNumber',
        taskIndex: 3,
        message: '页码错误',
      }),
      issue({
        severity: 'warning',
        path: 'tasks[3].evidenceFragments[0].originalText',
        taskIndex: 3,
        message: '原文警告',
      }),
      issue({
        path: 'tasks[3].evidenceFragments[0].evidenceRole',
        taskIndex: 3,
        message: '作用错误',
      }),
    ]);

    const correctRadio = screen.getByRole('radio', { name: '正确' });
    const basis = screen.getByRole('textbox', { name: '判断依据' });
    const page = screen.getByRole('textbox', { name: '证据 1 页码' });
    const originalText = screen.getByRole('textbox', { name: '证据 1 原文' });
    const evidenceRole = screen.getByRole('textbox', { name: '证据 1 作用' });
    const describedFields = [correctRadio, basis, page, originalText, evidenceRole];

    describedFields.forEach((field) => {
      const issueListId = field.getAttribute('aria-describedby');
      expect(issueListId).not.toBeNull();
      expect(document.getElementById(issueListId as string)).not.toBeNull();
    });
    expect(new Set(describedFields.map((field) => field.getAttribute('aria-describedby'))).size).toBe(5);
    expect(document.getElementById(correctRadio.getAttribute('aria-describedby') as string)).toHaveTextContent('判断错误');
    expect(document.getElementById(basis.getAttribute('aria-describedby') as string)).toHaveTextContent('依据警告');
    expect(document.getElementById(page.getAttribute('aria-describedby') as string)).toHaveTextContent('页码错误');
    expect(document.getElementById(originalText.getAttribute('aria-describedby') as string)).toHaveTextContent('原文警告');
    expect(document.getElementById(evidenceRole.getAttribute('aria-describedby') as string)).toHaveTextContent('作用错误');

    expect(correctRadio).toHaveAttribute('aria-invalid', 'true');
    expect(page).toHaveAttribute('aria-invalid', 'true');
    expect(evidenceRole).toHaveAttribute('aria-invalid', 'true');
    expect(basis).not.toHaveAttribute('aria-invalid');
    expect(originalText).not.toHaveAttribute('aria-invalid');
    describedFields.forEach((field) =>
      expect(field.id).not.toContain('evidence-private-id'),
    );
  });

  it('keeps a keyed evidence row input and issue-list id stable after a preceding deletion', () => {
    const first = {
      id: 'first-private-id',
      pageNumber: 1,
      originalText: '第一条',
      evidenceRole: '支持',
      raw: {},
    };
    const second = {
      id: 'second-private-id',
      pageNumber: 2,
      originalText: '第二条',
      evidenceRole: '冲突',
      raw: {},
    };
    const currentTask = task({ index: 3, evidenceFragments: [first, second] });
    const { rerender, onAction, onJumpToPage, onSaveAndNext } = renderPanel(currentTask, [
      issue({
        path: 'tasks[3].evidenceFragments[1].pageNumber',
        taskIndex: 3,
        message: '第二条页码错误',
      }),
    ]);
    const secondPageBefore = screen.getByRole('textbox', { name: '证据 2 页码' });
    const inputIdBefore = secondPageBefore.id;
    const issueListIdBefore = secondPageBefore.getAttribute('aria-describedby');

    rerender(
      <AnnotationPanel
        task={{ ...currentTask, evidenceFragments: [second] }}
        issues={[
          issue({
            path: 'tasks[3].evidenceFragments[0].pageNumber',
            taskIndex: 3,
            message: '第二条页码错误',
          }),
        ]}
        onAction={onAction}
        onJumpToPage={onJumpToPage}
        onSaveAndNext={onSaveAndNext}
      />,
    );

    const secondPageAfter = screen.getByRole('textbox', { name: '证据 1 页码' });
    expect(secondPageAfter.id).toBe(inputIdBefore);
    expect(secondPageAfter.getAttribute('aria-describedby')).toBe(issueListIdBefore);
    expect(inputIdBefore).not.toContain('second-private-id');
    expect(issueListIdBefore).not.toContain('second-private-id');
  });

  it('disables save only for a current-task error and otherwise saves the next task', async () => {
    const user = userEvent.setup();
    const currentTask = task({ index: 3 });
    const { rerender, onAction, onJumpToPage, onSaveAndNext } = renderPanel(currentTask, [
      issue({ severity: 'warning', taskIndex: 3, message: '当前任务警告' }),
      issue({ taskIndex: 4, path: 'tasks[4].verificationStatus', message: '其他任务错误' }),
    ]);

    const enabledSave = screen.getByRole('button', { name: '保存并下一条' });
    expect(enabledSave).toBeEnabled();
    await user.click(enabledSave);
    expect(onSaveAndNext).toHaveBeenCalledTimes(1);

    rerender(
      <AnnotationPanel
        task={currentTask}
        issues={[issue({ taskIndex: 3, path: 'tasks[3].verificationStatus' })]}
        onAction={onAction}
        onJumpToPage={onJumpToPage}
        onSaveAndNext={onSaveAndNext}
      />,
    );

    expect(screen.getByRole('button', { name: '保存并下一条' })).toBeDisabled();
  });
});

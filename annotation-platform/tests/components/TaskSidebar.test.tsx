import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskSidebar } from '../../src/components/TaskSidebar';
import type { AnnotationTask } from '../../src/domain/types';

afterEach(cleanup);

function task(overrides: Partial<AnnotationTask> = {}): AnnotationTask {
  return {
    index: 0,
    label: null,
    reviewPoint: '核对灌溉水源是否满足设计要求',
    verificationStatus: null,
    evidenceFragments: [],
    judgmentBasis: '',
    pageNumbers: [],
    raw: {},
    ...overrides,
  };
}

describe('TaskSidebar', () => {
  it('shows the task count, current selection, review summaries, and navigates on click', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const originalTasks = [
      task({ index: 0 }),
      task({ index: 1, reviewPoint: '检查田间道路布置是否完整', verificationStatus: 'correct' }),
    ];
    const tasks = [
      originalTasks[0],
      task({ index: 1, reviewPoint: originalTasks[1].reviewPoint, verificationStatus: 'not_applicable' }),
    ];

    render(
      <TaskSidebar
        tasks={tasks}
        originalTasks={originalTasks}
        currentTaskIndex={0}
        pdfPageCount={20}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText('任务 1 / 2')).toBeInTheDocument();
    expect(screen.getByText('核对灌溉水源是否满足设计要求')).toBeInTheDocument();
    expect(screen.getByText('检查田间道路布置是否完整')).toBeInTheDocument();
    expect(screen.getByText('已修改')).toBeInTheDocument();

    const firstTask = screen.getByRole('button', { name: /第 1 条/ });
    expect(firstTask).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /第 2 条/ })).not.toHaveAttribute('aria-current');

    await user.click(screen.getByRole('button', { name: /第 2 条/ }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('maps every derived task-list status to exactly one Chinese label', () => {
    const originalTasks = [
      task({ index: 0 }),
      task({ index: 1, verificationStatus: 'correct' }),
      task({ index: 2, verificationStatus: 'correct' }),
      task({ index: 3, verificationStatus: 'correct' }),
    ];
    const tasks = [
      task({ index: 0 }),
      task({ index: 1, verificationStatus: 'correct' }),
      task({ index: 2, verificationStatus: 'not_applicable' }),
      task({ index: 3, verificationStatus: 'incorrect' }),
    ];

    render(
      <TaskSidebar
        tasks={tasks}
        originalTasks={originalTasks}
        currentTaskIndex={0}
        pdfPageCount={20}
        onSelect={vi.fn()}
      />,
    );

    const expectedStatuses = ['未处理', '已确认', '已修改', '信息不完整'];
    screen.getAllByRole('button', { name: /第 \d+ 条/ }).forEach((button, index) => {
      const matchingStatuses = expectedStatuses.filter((status) =>
        within(button).queryByText(status),
      );
      expect(matchingStatuses).toEqual([expectedStatuses[index]]);
    });
  });

  it('uses the loaded PDF page count when deriving incomplete status', () => {
    const original = task({
      verificationStatus: 'correct',
      evidenceFragments: [
        {
          id: 'evidence-1',
          pageNumber: 12,
          originalText: '合成测试证据',
          evidenceRole: '支持',
          raw: {},
        },
      ],
    });

    render(
      <TaskSidebar
        tasks={[original]}
        originalTasks={[original]}
        currentTaskIndex={0}
        pdfPageCount={10}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('信息不完整')).toBeInTheDocument();
    expect(screen.queryByText('已确认')).not.toBeInTheDocument();
  });

  it('uses the current task as a safe baseline when the original task is missing', () => {
    const current = task({ verificationStatus: 'correct' });

    expect(() =>
      render(
        <TaskSidebar
          tasks={[current]}
          originalTasks={[]}
          currentTaskIndex={0}
          pdfPageCount={20}
          onSelect={vi.fn()}
        />,
      ),
    ).not.toThrow();
    expect(screen.getByText('已确认')).toBeInTheDocument();
  });

  it('matches original tasks by stable task index when arrays have different orders', () => {
    const tasks = [
      task({ index: 10, reviewPoint: '任务十', verificationStatus: 'not_applicable' }),
      task({ index: 20, reviewPoint: '任务二十', verificationStatus: 'not_applicable' }),
    ];
    const originalTasks = [
      task({ index: 20, reviewPoint: '任务二十', verificationStatus: 'not_applicable' }),
      task({ index: 10, reviewPoint: '任务十', verificationStatus: 'correct' }),
    ];

    render(
      <TaskSidebar
        tasks={tasks}
        originalTasks={originalTasks}
        currentTaskIndex={0}
        pdfPageCount={20}
        onSelect={vi.fn()}
      />,
    );

    expect(within(screen.getByRole('button', { name: /第 1 条/ })).getByText('已修改')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /第 2 条/ })).getByText('已确认')).toBeInTheDocument();
  });

  it.each([
    ['negative', -1, '任务 1 / 2', 0],
    ['past the end', 2, '任务 2 / 2', 1],
    ['non-integer', 1.8, '任务 2 / 2', 1],
    ['NaN', Number.NaN, '任务 1 / 2', 0],
    ['infinity', Number.POSITIVE_INFINITY, '任务 1 / 2', 0],
  ])(
    'normalizes a %s current task index to one legal active task',
    (_case, currentTaskIndex, expectedCount, expectedActiveIndex) => {
      const tasks = [task({ index: 0 }), task({ index: 1 })];

      render(
        <TaskSidebar
          tasks={tasks}
          originalTasks={tasks}
          currentTaskIndex={currentTaskIndex}
          pdfPageCount={null}
          onSelect={vi.fn()}
        />,
      );

      expect(screen.getByText(expectedCount)).toBeInTheDocument();
      const taskButtons = screen.getAllByRole('button', { name: /第 \d+ 条/ });
      expect(taskButtons.filter((button) => button.hasAttribute('aria-current'))).toEqual([
        taskButtons[expectedActiveIndex],
      ]);
    },
  );

  it('renders an empty-list count without task buttons', () => {
    render(
      <TaskSidebar
        tasks={[]}
        originalTasks={[]}
        currentTaskIndex={0}
        pdfPageCount={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('任务 0 / 0')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

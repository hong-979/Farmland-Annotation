import { deriveTaskListStatus } from '../domain/validateTask';
import type { AnnotationTask, TaskListStatus } from '../domain/types';

interface TaskSidebarProps {
  tasks: AnnotationTask[];
  originalTasks: AnnotationTask[];
  currentTaskIndex: number;
  pdfPageCount: number | null;
  onSelect(index: number): void;
}

const statusLabels: Record<TaskListStatus, string> = {
  unprocessed: '未处理',
  confirmed: '已确认',
  modified: '已修改',
  incomplete: '信息不完整',
};

export function TaskSidebar({
  tasks,
  originalTasks,
  currentTaskIndex,
  pdfPageCount,
  onSelect,
}: TaskSidebarProps) {
  const currentNumber = tasks.length === 0 ? 0 : currentTaskIndex + 1;

  return (
    <nav className="task-sidebar" aria-label="标注任务导航">
      <p className="task-sidebar__count">任务 {currentNumber} / {tasks.length}</p>
      <ol className="task-sidebar__list">
        {tasks.map((task, index) => {
          const status = deriveTaskListStatus(task, originalTasks[index], pdfPageCount);

          return (
            <li key={task.index}>
              <button
                type="button"
                className="task-sidebar__task"
                aria-current={index === currentTaskIndex ? 'true' : undefined}
                onClick={() => onSelect(index)}
              >
                <span className="task-sidebar__task-number">第 {index + 1} 条</span>
                <span className="task-sidebar__summary" title={task.reviewPoint}>
                  {task.reviewPoint}
                </span>
                <span className={`task-sidebar__status task-sidebar__status--${status}`}>
                  {statusLabels[status]}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

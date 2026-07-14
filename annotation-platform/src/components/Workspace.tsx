import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

interface WorkspaceProps {
  toolbar: ReactNode;
  sidebar: ReactNode;
  pdfPanel: ReactNode;
  annotationPanel: ReactNode;
}

const narrowWorkspaceQuery = '(max-width: 1179px)';
const taskListId = 'workspace-task-list';

function isNarrowWorkspace() {
  return typeof window.matchMedia === 'function' && window.matchMedia(narrowWorkspaceQuery).matches;
}

export function Workspace({ toolbar, sidebar, pdfPanel, annotationPanel }: WorkspaceProps) {
  const [narrow, setNarrow] = useState(isNarrowWorkspace);
  const [tasksOpen, setTasksOpen] = useState(false);
  const tasksVisible = !narrow || tasksOpen;

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia(narrowWorkspaceQuery);
    const handleChange = (event: MediaQueryListEvent) => setNarrow(event.matches);
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return (
    <div className="workspace">
      <header className="workspace__toolbar">
        <button
          type="button"
          className="workspace__task-toggle"
          aria-controls={taskListId}
          aria-expanded={tasksOpen}
          hidden={!narrow}
          onClick={() => setTasksOpen((open) => !open)}
        >
          {tasksOpen ? '隐藏任务列表' : '显示任务列表'}
        </button>
        {toolbar}
      </header>
      <aside
        id={taskListId}
        className="workspace__tasks"
        aria-label="标注任务列表"
        hidden={!tasksVisible}
      >
        {sidebar}
      </aside>
      <section className="workspace__pdf" aria-label="PDF 原文">
        {pdfPanel}
      </section>
      <section className="workspace__annotation" aria-label="专家标注表单">
        {annotationPanel}
      </section>
    </div>
  );
}

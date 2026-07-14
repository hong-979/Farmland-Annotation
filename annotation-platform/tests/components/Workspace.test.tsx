import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Workspace } from '../../src/components/Workspace';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function useNarrowViewport(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function renderWorkspace() {
  return render(
    <Workspace
      toolbar={<span>工作区工具</span>}
      sidebar={<span>任务列表内容</span>}
      pdfPanel={<span>PDF 内容</span>}
      annotationPanel={<span>标注表单内容</span>}
    />,
  );
}

describe('Workspace', () => {
  it('renders the approved semantic workspace regions on desktop', () => {
    useNarrowViewport(false);

    renderWorkspace();

    expect(screen.getByRole('banner')).toHaveTextContent('工作区工具');
    expect(screen.getByRole('complementary', { name: '标注任务列表' })).toHaveTextContent(
      '任务列表内容',
    );
    expect(screen.getByRole('region', { name: 'PDF 原文' })).toHaveTextContent('PDF 内容');
    expect(screen.getByRole('region', { name: '专家标注表单' })).toHaveTextContent(
      '标注表单内容',
    );
    expect(screen.queryByRole('button', { name: /任务列表/ })).not.toBeInTheDocument();
  });

  it('toggles only the task list in a viewport below 1180px', async () => {
    useNarrowViewport(true);
    const user = userEvent.setup();

    renderWorkspace();

    const toggle = screen.getByRole('button', { name: '显示任务列表' });
    const controlledId = toggle.getAttribute('aria-controls');
    const taskRegion = controlledId === null ? null : document.getElementById(controlledId);
    expect(taskRegion).not.toBeNull();
    expect(taskRegion).toHaveAttribute('aria-label', '标注任务列表');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', taskRegion?.id);
    expect(taskRegion).not.toBeVisible();
    expect(screen.getByRole('region', { name: 'PDF 原文' })).toBeVisible();
    expect(screen.getByRole('region', { name: '专家标注表单' })).toBeVisible();

    await user.click(toggle);

    expect(screen.getByRole('button', { name: '隐藏任务列表' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(taskRegion).toBeVisible();
    expect(screen.getByRole('region', { name: 'PDF 原文' })).toBeVisible();
    expect(screen.getByRole('region', { name: '专家标注表单' })).toBeVisible();
  });
});

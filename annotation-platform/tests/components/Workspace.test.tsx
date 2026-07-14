import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Workspace } from '../../src/components/Workspace';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function useViewport(initialMatches: boolean) {
  let matches = initialMatches;
  let changeListener: ((event: MediaQueryListEvent) => void) | null = null;
  const addEventListener = vi.fn(
    (eventName: string, listener: (event: MediaQueryListEvent) => void) => {
      if (eventName === 'change') {
        changeListener = listener;
      }
    },
  );
  const removeEventListener = vi.fn(
    (eventName: string, listener: (event: MediaQueryListEvent) => void) => {
      if (eventName === 'change' && changeListener === listener) {
        changeListener = null;
      }
    },
  );
  const mediaQuery = {
    get matches() {
      return matches;
    },
    media: '(max-width: 1179px)',
    onchange: null,
    addEventListener,
    removeEventListener,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };

  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => mediaQuery),
  );

  return {
    addEventListener,
    removeEventListener,
    getChangeListener: () => changeListener,
    change(nextMatches: boolean) {
      matches = nextMatches;
      changeListener?.({ matches: nextMatches, media: mediaQuery.media } as MediaQueryListEvent);
    },
  };
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
    useViewport(false);

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
    useViewport(true);
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

  it('gives each workspace instance a unique task-list control relationship', () => {
    useViewport(true);

    render(
      <>
        <Workspace
          toolbar={<span>工具一</span>}
          sidebar={<span>任务一</span>}
          pdfPanel={<span>PDF 一</span>}
          annotationPanel={<span>表单一</span>}
        />
        <Workspace
          toolbar={<span>工具二</span>}
          sidebar={<span>任务二</span>}
          pdfPanel={<span>PDF 二</span>}
          annotationPanel={<span>表单二</span>}
        />
      </>,
    );

    const toggles = screen.getAllByRole('button', { name: '显示任务列表' });
    const controlledIds = toggles.map((toggle) => toggle.getAttribute('aria-controls'));
    expect(new Set(controlledIds).size).toBe(2);

    toggles.forEach((toggle) => {
      const localTaskRegion = toggle.closest('.workspace')?.querySelector('aside');
      expect(localTaskRegion).not.toBeNull();
      expect(toggle).toHaveAttribute('aria-controls', localTaskRegion?.id);
    });
  });

  it('responds to viewport changes, toggles both ways, and removes its listener on unmount', async () => {
    const viewport = useViewport(false);
    const user = userEvent.setup();
    const { unmount } = renderWorkspace();
    const taskRegion = screen.getByRole('complementary', { name: '标注任务列表' });

    expect(screen.queryByRole('button', { name: /任务列表/ })).not.toBeInTheDocument();
    expect(taskRegion).toBeVisible();

    act(() => viewport.change(true));

    const toggle = screen.getByRole('button', { name: '显示任务列表' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(taskRegion).not.toBeVisible();

    await user.click(toggle);
    expect(screen.getByRole('button', { name: '隐藏任务列表' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(taskRegion).toBeVisible();

    await user.click(screen.getByRole('button', { name: '隐藏任务列表' }));
    expect(screen.getByRole('button', { name: '显示任务列表' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(taskRegion).not.toBeVisible();

    act(() => viewport.change(false));
    expect(screen.queryByRole('button', { name: /任务列表/ })).not.toBeInTheDocument();
    expect(taskRegion).toBeVisible();

    const subscribedListener = viewport.getChangeListener();
    expect(viewport.addEventListener).toHaveBeenCalledWith('change', subscribedListener);
    unmount();
    expect(viewport.removeEventListener).toHaveBeenCalledWith('change', subscribedListener);
    expect(viewport.getChangeListener()).toBeNull();
  });
});

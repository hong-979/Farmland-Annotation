import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfPanel } from '../../src/pdf/PdfPanel';
import type {
  PdfDocumentAdapter,
  PdfRenderHandle,
} from '../../src/pdf/pdfAdapter';

const pdfjsMocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  workerOptions: { workerSrc: '' },
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: pdfjsMocks.workerOptions,
  getDocument: pdfjsMocks.getDocument,
}));

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function resolvedHandle(): PdfRenderHandle {
  return { promise: Promise.resolve(), cancel: vi.fn() };
}

function fakeDocument(
  pageCount = 10,
  renderPage: PdfDocumentAdapter['renderPage'] = vi.fn(() => resolvedHandle()),
): PdfDocumentAdapter {
  return {
    pageCount,
    renderPage,
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}

function controlledRender() {
  const completion = deferred<void>();
  let cancelled = false;
  const cancel = vi.fn(() => {
    cancelled = true;
    completion.reject(new Error('Rendering cancelled'));
  });
  return {
    handle: { promise: completion.promise, cancel } satisfies PdfRenderHandle,
    completion,
    get cancelled() {
      return cancelled;
    },
  };
}

function conflictCheckingDocument(pageCount = 10) {
  let activeCanvas: HTMLCanvasElement | null = null;
  let conflicts = 0;
  const renders: Array<ReturnType<typeof controlledRender>> = [];
  const renderPage = vi.fn<PdfDocumentAdapter['renderPage']>((canvas) => {
    if (activeCanvas === canvas) {
      conflicts += 1;
    }
    const render = controlledRender();
    activeCanvas = canvas;
    const originalCancel = render.handle.cancel;
    render.handle.cancel = vi.fn(() => {
      if (activeCanvas === canvas) {
        activeCanvas = null;
      }
      originalCancel();
    });
    void render.handle.promise.catch(() => undefined);
    renders.push(render);
    return render.handle;
  });
  return {
    document: fakeDocument(pageCount, renderPage),
    renderPage,
    renders,
    get conflicts() {
      return conflicts;
    },
  };
}

describe('PdfPanel', () => {
  it('renders page one at scale one initially and exposes status outputs', async () => {
    const document = fakeDocument();
    render(<PdfPanel document={document} requestedPage={1} />);

    expect(screen.getByRole('status', { name: '页码状态' })).toHaveTextContent('第 1 / 10 页');
    expect(screen.getByRole('status', { name: '缩放状态' })).toHaveTextContent('缩放 100%');
    await waitFor(() =>
      expect(document.renderPage).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), 1, 1),
    );
  });

  it('navigates with previous and next while enforcing both page boundaries', async () => {
    const user = userEvent.setup();
    const document = fakeDocument(2);
    render(<PdfPanel document={document} requestedPage={1} />);

    const previous = screen.getByRole('button', { name: '上一页' });
    const next = screen.getByRole('button', { name: '下一页' });
    expect(previous).toBeDisabled();
    await user.click(next);
    expect(screen.getByRole('status', { name: '页码状态' })).toHaveTextContent('第 2 / 2 页');
    expect(next).toBeDisabled();
    await user.click(previous);
    expect(previous).toBeDisabled();
  });

  it('accepts direct pages and ignores or clamps illegal direct input', () => {
    const document = fakeDocument();
    render(<PdfPanel document={document} requestedPage={1} />);
    const input = screen.getByRole('spinbutton', { name: '页码' });

    fireEvent.change(input, { target: { value: '4' } });
    expect(screen.getByRole('status', { name: '页码状态' })).toHaveTextContent('第 4 / 10 页');
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByRole('status', { name: '页码状态' })).toHaveTextContent('第 4 / 10 页');
    fireEvent.change(input, { target: { value: '99' } });
    expect(screen.getByRole('status', { name: '页码状态' })).toHaveTextContent('第 10 / 10 页');
    fireEvent.change(input, { target: { value: '-3' } });
    expect(screen.getByRole('status', { name: '页码状态' })).toHaveTextContent('第 1 / 10 页');
  });

  it('enforces zoom boundaries and uses a stable fit-width fallback', async () => {
    const user = userEvent.setup();
    const document = fakeDocument();
    render(<PdfPanel document={document} requestedPage={1} />);
    const zoomOut = screen.getByRole('button', { name: '缩小' });
    const zoomIn = screen.getByRole('button', { name: '放大' });

    await user.click(zoomOut);
    await user.click(zoomOut);
    expect(screen.getByRole('status', { name: '缩放状态' })).toHaveTextContent('缩放 50%');
    expect(zoomOut).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '适应宽度' }));
    expect(screen.getByRole('status', { name: '缩放状态' })).toHaveTextContent('缩放 100%');
    for (let index = 0; index < 10; index += 1) {
      await user.click(zoomIn);
    }
    expect(screen.getByRole('status', { name: '缩放状态' })).toHaveTextContent('缩放 300%');
    expect(zoomIn).toBeDisabled();
  });

  it('computes fit width from a real non-zero region and clamps the result', async () => {
    const user = userEvent.setup();
    const document = fakeDocument();
    render(<PdfPanel document={document} requestedPage={1} />);
    const canvas = screen.getByRole('img', { name: 'PDF 第 1 页' }) as HTMLCanvasElement;
    const region = canvas.parentElement as HTMLDivElement;
    Object.defineProperty(region, 'clientWidth', { configurable: true, value: 225 });

    await user.click(screen.getByRole('button', { name: '适应宽度' }));
    expect(screen.getByRole('status', { name: '缩放状态' })).toHaveTextContent('缩放 75%');

    Object.defineProperty(region, 'clientWidth', { configurable: true, value: 1200 });
    await user.click(screen.getByRole('button', { name: '适应宽度' }));
    expect(screen.getByRole('status', { name: '缩放状态' })).toHaveTextContent('缩放 300%');
  });

  it('follows external requested-page changes and clamps them', async () => {
    const document = fakeDocument();
    const { rerender } = render(<PdfPanel document={document} requestedPage={1} />);
    rerender(<PdfPanel document={document} requestedPage={8} />);
    expect(screen.getByRole('status', { name: '页码状态' })).toHaveTextContent('第 8 / 10 页');
    rerender(<PdfPanel document={document} requestedPage={80} />);
    expect(screen.getByRole('status', { name: '页码状态' })).toHaveTextContent('第 10 / 10 页');
    await waitFor(() =>
      expect(document.renderPage).toHaveBeenLastCalledWith(expect.any(HTMLCanvasElement), 10, 1),
    );
  });

  it('cancels the StrictMode probe render before rendering on the same canvas again', async () => {
    const fake = conflictCheckingDocument();
    render(
      <StrictMode>
        <PdfPanel document={fake.document} requestedPage={1} />
      </StrictMode>,
    );

    await waitFor(() => expect(fake.renderPage).toHaveBeenCalledTimes(2));
    expect(fake.renders[0].handle.cancel).toHaveBeenCalledTimes(1);
    expect(fake.conflicts).toBe(0);
  });

  it('cancels active same-canvas work during rapid page and scale changes', async () => {
    const user = userEvent.setup();
    const fake = conflictCheckingDocument();
    render(<PdfPanel document={fake.document} requestedPage={1} />);
    await waitFor(() => expect(fake.renderPage).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: '下一页' }));
    await waitFor(() => expect(fake.renderPage).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole('button', { name: '放大' }));
    await waitFor(() => expect(fake.renderPage).toHaveBeenCalledTimes(3));

    expect(fake.renders[0].handle.cancel).toHaveBeenCalledTimes(1);
    expect(fake.renders[1].handle.cancel).toHaveBeenCalledTimes(1);
    expect(fake.conflicts).toBe(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('cancels active renders when replacing the document and unmounting', async () => {
    const first = conflictCheckingDocument();
    const second = conflictCheckingDocument(3);
    const { rerender, unmount } = render(
      <PdfPanel document={first.document} requestedPage={8} />,
    );
    await waitFor(() => expect(first.renderPage).toHaveBeenCalledTimes(1));

    rerender(<PdfPanel document={second.document} requestedPage={8} />);
    await waitFor(() => expect(second.renderPage).toHaveBeenCalledTimes(1));
    expect(first.renders[0].handle.cancel).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status', { name: '页码状态' })).toHaveTextContent('第 3 / 3 页');

    unmount();
    expect(second.renders[0].handle.cancel).toHaveBeenCalledTimes(1);
    expect(first.conflicts + second.conflicts).toBe(0);
  });

  it('prevents an old success from painting after a newer success', async () => {
    const paints: number[] = [];
    const controlled: Array<{
      completion: ReturnType<typeof deferred<void>>;
      handle: PdfRenderHandle;
    }> = [];
    const renderPage = vi.fn<PdfDocumentAdapter['renderPage']>((_canvas, page) => {
      const completion = deferred<void>();
      let cancelled = false;
      const handle: PdfRenderHandle = {
        promise: completion.promise,
        cancel: vi.fn(() => { cancelled = true; }),
      };
      void completion.promise
        .then(() => {
          if (!cancelled) paints.push(page);
        })
        .catch(() => undefined);
      controlled.push({ completion, handle });
      return handle;
    });
    const document = fakeDocument(10, renderPage);
    const { rerender } = render(<PdfPanel document={document} requestedPage={1} />);
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(1));
    rerender(<PdfPanel document={document} requestedPage={2} />);
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(2));

    await act(async () => controlled[1].completion.resolve());
    await act(async () => controlled[0].completion.resolve());
    expect(controlled[0].handle.cancel).toHaveBeenCalledTimes(1);
    expect(paints).toEqual([2]);
  });

  it('announces a render failure and clears it after that target later succeeds', async () => {
    const retry = controlledRender();
    const renderPage = vi
      .fn<PdfDocumentAdapter['renderPage']>()
      .mockReturnValueOnce({
        promise: Promise.reject(new Error('synthetic render failure')),
        cancel: vi.fn(),
      })
      .mockReturnValueOnce(resolvedHandle())
      .mockReturnValueOnce(retry.handle);
    const document = fakeDocument(10, renderPage);
    render(<PdfPanel document={document} requestedPage={1} />);

    const message = await screen.findByRole('alert');
    expect(message).toHaveTextContent('PDF 页面渲染失败，请重试或切换页面。');
    await userEvent.click(screen.getByRole('button', { name: '下一页' }));
    await userEvent.click(screen.getByRole('button', { name: '上一页' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await act(async () => retry.completion.resolve());
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it.each([0, -2, Number.NaN, Number.POSITIVE_INFINITY])(
    'shows a non-rendering empty state for invalid pageCount %s',
    async (pageCount) => {
      const document = fakeDocument(pageCount);
      render(<PdfPanel document={document} requestedPage={1} />);

      expect(screen.getByRole('alert')).toHaveTextContent('PDF 文档没有可显示的页面。');
      expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();
      expect(screen.getByRole('spinbutton', { name: '页码' })).toBeDisabled();
      await act(async () => Promise.resolve());
      expect(document.renderPage).not.toHaveBeenCalled();
    },
  );
});

describe('openPdfDocument', () => {
  beforeEach(() => {
    pdfjsMocks.getDocument.mockReset();
  });

  it('configures the worker URL, reads only the supplied file, awaits rendering, and destroys', async () => {
    const renderCompletion = deferred<void>();
    const renderTask = { promise: renderCompletion.promise, cancel: vi.fn() };
    const renderPage = vi.fn().mockReturnValue(renderTask);
    const getPage = vi.fn().mockResolvedValue({
      getViewport: vi.fn().mockReturnValue({ width: 120.2, height: 239.1 }),
      render: renderPage,
    });
    const destroy = vi.fn().mockResolvedValue(undefined);
    pdfjsMocks.getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 4, getPage }),
      destroy,
    });
    const bytes = new ArrayBuffer(12);
    const file = new File(['synthetic bytes'], 'synthetic.pdf');
    const arrayBuffer = vi.fn().mockResolvedValue(bytes);
    Object.defineProperty(file, 'arrayBuffer', { value: arrayBuffer });
    const canvas = document.createElement('canvas');
    const context = {} as CanvasRenderingContext2D;
    vi.spyOn(canvas, 'getContext').mockReturnValue(context);
    const { openPdfDocument } = await import('../../src/pdf/pdfAdapter');

    const adapter = await openPdfDocument(file);
    const handle = adapter.renderPage(canvas, 2, 1.5);
    let settled = false;
    void handle.promise.then(() => { settled = true; });
    await waitFor(() => expect(renderPage).toHaveBeenCalled());
    expect(settled).toBe(false);
    renderCompletion.resolve();
    await handle.promise;
    await adapter.destroy();

    expect(pdfjsMocks.workerOptions.workerSrc).toContain('pdf.worker.min.mjs');
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
    expect(pdfjsMocks.getDocument).toHaveBeenCalledWith({ data: bytes });
    expect(adapter.pageCount).toBe(4);
    expect(getPage).toHaveBeenCalledWith(2);
    expect(canvas.width).toBe(121);
    expect(canvas.height).toBe(240);
    expect(renderPage).toHaveBeenCalledWith(expect.objectContaining({ canvas, canvasContext: context }));
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('cancels and settles the previous render before reusing the same canvas', async () => {
    const firstCompletion = deferred<void>();
    const firstTask = { promise: firstCompletion.promise, cancel: vi.fn() };
    const secondTask = { promise: Promise.resolve(), cancel: vi.fn() };
    const firstPageRender = vi.fn().mockReturnValue(firstTask);
    const secondPageRender = vi.fn().mockReturnValue(secondTask);
    const getPage = vi.fn(async (page: number) => ({
      getViewport: () => ({ width: 10, height: 10 }),
      render: page === 1 ? firstPageRender : secondPageRender,
    }));
    pdfjsMocks.getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 2, getPage }),
      destroy: vi.fn(),
    });
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
    const { openPdfDocument } = await import('../../src/pdf/pdfAdapter');
    const adapter = await openPdfDocument(new File([], 'synthetic.pdf'));

    const first = adapter.renderPage(canvas, 1, 1);
    await waitFor(() => expect(firstPageRender).toHaveBeenCalledTimes(1));
    const second = adapter.renderPage(canvas, 2, 1);
    expect(firstTask.cancel).toHaveBeenCalledTimes(1);
    expect(secondPageRender).not.toHaveBeenCalled();

    firstCompletion.reject(new Error('Rendering cancelled'));
    await expect(first.promise).rejects.toThrow('Rendering cancelled');
    await second.promise;
    expect(secondPageRender).toHaveBeenCalledTimes(1);
  });

  it('propagates page-loading failures through the render handle promise', async () => {
    const failure = new Error('synthetic page load failure');
    pdfjsMocks.getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 1, getPage: vi.fn().mockRejectedValue(failure) }),
      destroy: vi.fn(),
    });
    const { openPdfDocument } = await import('../../src/pdf/pdfAdapter');
    const adapter = await openPdfDocument(new File([], 'synthetic.pdf'));

    await expect(
      adapter.renderPage(document.createElement('canvas'), 1, 1).promise,
    ).rejects.toBe(failure);
  });

  it('rejects with a Chinese error when the canvas context is unavailable', async () => {
    const renderPage = vi.fn();
    pdfjsMocks.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn().mockResolvedValue({
          getViewport: vi.fn().mockReturnValue({ width: 1, height: 1 }),
          render: renderPage,
        }),
      }),
      destroy: vi.fn(),
    });
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(null);
    const { openPdfDocument } = await import('../../src/pdf/pdfAdapter');
    const adapter = await openPdfDocument(new File([], 'synthetic.pdf'));

    await expect(adapter.renderPage(canvas, 1, 1).promise).rejects.toThrow(
      '无法获取 PDF 画布上下文',
    );
    expect(renderPage).not.toHaveBeenCalled();
  });
});

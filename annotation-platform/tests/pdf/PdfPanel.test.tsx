import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfPanel } from '../../src/pdf/PdfPanel';
import type { PdfDocumentAdapter } from '../../src/pdf/pdfAdapter';

const pdfjsMocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  workerOptions: { workerSrc: '' },
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: pdfjsMocks.workerOptions,
  getDocument: pdfjsMocks.getDocument,
}));

afterEach(cleanup);

function fakeDocument(
  pageCount = 10,
  renderPage: PdfDocumentAdapter['renderPage'] = vi.fn().mockResolvedValue(undefined),
): PdfDocumentAdapter {
  return {
    pageCount,
    renderPage,
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('PdfPanel', () => {
  it('renders page one at scale one initially', async () => {
    const document = fakeDocument();

    render(<PdfPanel document={document} requestedPage={1} />);

    expect(screen.getByText('第 1 / 10 页')).toBeInTheDocument();
    await waitFor(() =>
      expect(document.renderPage).toHaveBeenCalledWith(
        expect.any(HTMLCanvasElement),
        1,
        1,
      ),
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
    expect(screen.getByText('第 2 / 2 页')).toBeInTheDocument();
    expect(next).toBeDisabled();

    await user.click(previous);
    expect(screen.getByText('第 1 / 2 页')).toBeInTheDocument();
    expect(previous).toBeDisabled();
  });

  it('accepts direct pages and ignores or clamps illegal direct input', async () => {
    const document = fakeDocument();
    render(<PdfPanel document={document} requestedPage={1} />);
    const input = screen.getByRole('spinbutton', { name: '页码' });

    fireEvent.change(input, { target: { value: '4' } });
    expect(screen.getByText('第 4 / 10 页')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByText('第 4 / 10 页')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '99' } });
    expect(screen.getByText('第 10 / 10 页')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '-3' } });
    expect(screen.getByText('第 1 / 10 页')).toBeInTheDocument();
  });

  it('enforces zoom boundaries and resets to a stable fit-width fallback', async () => {
    const user = userEvent.setup();
    const document = fakeDocument();
    render(<PdfPanel document={document} requestedPage={1} />);

    const zoomOut = screen.getByRole('button', { name: '缩小' });
    const zoomIn = screen.getByRole('button', { name: '放大' });
    await user.click(zoomOut);
    await user.click(zoomOut);
    expect(screen.getByText('缩放 50%')).toBeInTheDocument();
    expect(zoomOut).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '适应宽度' }));
    expect(screen.getByText('缩放 100%')).toBeInTheDocument();

    for (let index = 0; index < 10; index += 1) {
      await user.click(zoomIn);
    }
    expect(screen.getByText('缩放 300%')).toBeInTheDocument();
    expect(zoomIn).toBeDisabled();
    await waitFor(() =>
      expect(document.renderPage).toHaveBeenLastCalledWith(
        expect.any(HTMLCanvasElement),
        1,
        3,
      ),
    );
  });

  it('follows external requested-page changes and clamps them', async () => {
    const document = fakeDocument();
    const { rerender } = render(<PdfPanel document={document} requestedPage={1} />);

    rerender(<PdfPanel document={document} requestedPage={8} />);
    expect(screen.getByText('第 8 / 10 页')).toBeInTheDocument();

    rerender(<PdfPanel document={document} requestedPage={80} />);
    expect(screen.getByText('第 10 / 10 页')).toBeInTheDocument();
    await waitFor(() =>
      expect(document.renderPage).toHaveBeenLastCalledWith(
        expect.any(HTMLCanvasElement),
        10,
        1,
      ),
    );
  });

  it('announces an actionable Chinese message when rendering fails', async () => {
    const document = fakeDocument(
      10,
      vi.fn().mockRejectedValue(new Error('synthetic render failure')),
    );
    render(<PdfPanel document={document} requestedPage={1} />);

    const message = await screen.findByRole('alert');
    expect(message).toHaveAttribute('aria-live', 'polite');
    expect(message).toHaveTextContent('PDF 页面渲染失败，请重试或切换页面。');
  });

  it('does not let an old rejection overwrite a newer successful render', async () => {
    const oldRender = deferred<void>();
    const renderPage = vi
      .fn<PdfDocumentAdapter['renderPage']>()
      .mockImplementationOnce(() => oldRender.promise)
      .mockResolvedValue(undefined);
    const document = fakeDocument(10, renderPage);
    const { rerender } = render(<PdfPanel document={document} requestedPage={1} />);
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(1));

    rerender(<PdfPanel document={document} requestedPage={2} />);
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(2));
    await act(async () => {
      oldRender.reject(new Error('stale failure'));
      await oldRender.promise.catch(() => undefined);
    });

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByText('第 2 / 10 页')).toBeInTheDocument();
  });

  it('clamps the requested page for a replacement document and ignores its old render', async () => {
    const oldRender = deferred<void>();
    const first = fakeDocument(10, vi.fn(() => oldRender.promise));
    const second = fakeDocument(3);
    const { rerender } = render(<PdfPanel document={first} requestedPage={8} />);
    await waitFor(() => expect(first.renderPage).toHaveBeenCalled());

    rerender(<PdfPanel document={second} requestedPage={8} />);
    expect(screen.getByText('第 3 / 3 页')).toBeInTheDocument();
    await waitFor(() =>
      expect(second.renderPage).toHaveBeenCalledWith(
        expect.any(HTMLCanvasElement),
        3,
        1,
      ),
    );

    await act(async () => {
      oldRender.reject(new Error('old document failed'));
      await oldRender.promise.catch(() => undefined);
    });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});

describe('openPdfDocument', () => {
  beforeEach(() => {
    pdfjsMocks.getDocument.mockReset();
  });

  it('opens only the supplied file and delegates page rendering and destruction', async () => {
    const render = vi.fn().mockReturnValue({ promise: Promise.resolve() });
    const getPage = vi.fn().mockResolvedValue({
      getViewport: vi.fn().mockReturnValue({ width: 120.2, height: 239.1 }),
      render,
    });
    const destroy = vi.fn().mockResolvedValue(undefined);
    pdfjsMocks.getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 4, getPage }),
      destroy,
    });
    const file = new File(['synthetic bytes'], 'synthetic.pdf');
    const bytes = new ArrayBuffer(12);
    const arrayBuffer = vi.fn().mockResolvedValue(bytes);
    Object.defineProperty(file, 'arrayBuffer', { value: arrayBuffer });
    const context = {} as CanvasRenderingContext2D;
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(context);
    const { openPdfDocument } = await import('../../src/pdf/pdfAdapter');

    const adapter = await openPdfDocument(file);
    await adapter.renderPage(canvas, 2, 1.5);
    await adapter.destroy();

    expect(arrayBuffer).toHaveBeenCalledTimes(1);
    expect(pdfjsMocks.getDocument).toHaveBeenCalledWith({ data: bytes });
    expect(adapter.pageCount).toBe(4);
    expect(getPage).toHaveBeenCalledWith(2);
    expect(canvas.width).toBe(121);
    expect(canvas.height).toBe(240);
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ canvas, canvasContext: context }));
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('throws a Chinese error when the canvas context is unavailable', async () => {
    const render = vi.fn();
    pdfjsMocks.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn().mockResolvedValue({
          getViewport: vi.fn().mockReturnValue({ width: 1, height: 1 }),
          render,
        }),
      }),
      destroy: vi.fn(),
    });
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(null);
    const { openPdfDocument } = await import('../../src/pdf/pdfAdapter');
    const adapter = await openPdfDocument(new File([], 'synthetic.pdf'));

    await expect(adapter.renderPage(canvas, 1, 1)).rejects.toThrow('无法获取 PDF 画布上下文');
    expect(render).not.toHaveBeenCalled();
  });
});

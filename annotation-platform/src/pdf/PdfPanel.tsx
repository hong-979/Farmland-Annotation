import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { PdfDocumentAdapter } from './pdfAdapter';

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;

export interface PdfPanelProps {
  document: PdfDocumentAdapter;
  requestedPage: number;
}

interface ViewState {
  document: PdfDocumentAdapter;
  requestedPage: number;
  currentPage: number;
  scale: number;
}

interface RenderError {
  document: PdfDocumentAdapter;
  page: number;
  scale: number;
  message: string;
}

function clampPage(page: number, pageCount: number): number {
  const lastPage = Math.max(1, Math.floor(pageCount));
  if (!Number.isFinite(page)) {
    return 1;
  }
  return Math.min(lastPage, Math.max(1, Math.floor(page)));
}

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function PdfPanel({ document, requestedPage }: PdfPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRegionRef = useRef<HTMLDivElement>(null);
  const renderGeneration = useRef(0);
  const [view, setView] = useState<ViewState>(() => ({
    document,
    requestedPage,
    currentPage: clampPage(requestedPage, document.pageCount),
    scale: 1,
  }));
  const [renderError, setRenderError] = useState<RenderError | null>(null);

  if (view.document !== document) {
    setView({
      document,
      requestedPage,
      currentPage: clampPage(requestedPage, document.pageCount),
      scale: 1,
    });
  } else if (view.requestedPage !== requestedPage) {
    setView({
      ...view,
      requestedPage,
      currentPage: clampPage(requestedPage, document.pageCount),
    });
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const generation = renderGeneration.current + 1;
    renderGeneration.current = generation;
    let cancelled = false;

    void Promise.resolve()
      .then(() => document.renderPage(canvas, view.currentPage, view.scale))
      .catch((error: unknown) => {
        if (cancelled || renderGeneration.current !== generation) {
          return;
        }
        const detail = error instanceof Error ? error.message : String(error);
        setRenderError({
          document,
          page: view.currentPage,
          scale: view.scale,
          message: `PDF 页面渲染失败，请重试或切换页面。${detail ? ` ${detail}` : ''}`,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [document, view.currentPage, view.scale]);

  const currentError =
    renderError?.document === document &&
    renderError.page === view.currentPage &&
    renderError.scale === view.scale
      ? renderError
      : null;

  function goToPage(page: number) {
    setView((current) => ({
      ...current,
      currentPage: clampPage(page, document.pageCount),
    }));
  }

  function changeScale(amount: number) {
    setView((current) => ({
      ...current,
      scale: clampScale(current.scale + amount),
    }));
  }

  function handleDirectPage(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.value.trim() === '') {
      return;
    }
    const page = Number(event.target.value);
    if (Number.isFinite(page)) {
      goToPage(page);
    }
  }

  function fitWidth() {
    const canvas = canvasRef.current;
    const availableWidth = canvasRegionRef.current?.clientWidth ?? 0;
    const fittedScale =
      canvas && availableWidth > 0 && canvas.width > 0
        ? clampScale((view.scale * availableWidth) / canvas.width)
        : 1;
    setView((current) => ({ ...current, scale: fittedScale }));
  }

  return (
    <section aria-label="PDF 阅读器">
      <div>
        <button
          type="button"
          disabled={view.currentPage <= 1}
          onClick={() => goToPage(view.currentPage - 1)}
        >
          上一页
        </button>
        <label>
          页码
          <input
            aria-label="页码"
            type="number"
            min={1}
            max={document.pageCount}
            value={view.currentPage}
            onChange={handleDirectPage}
          />
        </label>
        <span>第 {view.currentPage} / {document.pageCount} 页</span>
        <button
          type="button"
          disabled={view.currentPage >= document.pageCount}
          onClick={() => goToPage(view.currentPage + 1)}
        >
          下一页
        </button>
        <button
          type="button"
          disabled={view.scale <= MIN_SCALE}
          onClick={() => changeScale(-SCALE_STEP)}
        >
          缩小
        </button>
        <button
          type="button"
          disabled={view.scale >= MAX_SCALE}
          onClick={() => changeScale(SCALE_STEP)}
        >
          放大
        </button>
        <button type="button" onClick={fitWidth}>适应宽度</button>
        <span>缩放 {Math.round(view.scale * 100)}%</span>
      </div>

      {currentError ? (
        <div role="alert" aria-live="polite">
          {currentError.message}
        </div>
      ) : null}

      <div ref={canvasRegionRef}>
        <canvas ref={canvasRef} aria-label={`PDF 第 ${view.currentPage} 页`} />
      </div>
    </section>
  );
}

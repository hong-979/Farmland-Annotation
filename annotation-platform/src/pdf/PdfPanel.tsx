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

function normalizedPageCount(pageCount: number): number {
  return Number.isFinite(pageCount) && pageCount > 0 ? Math.floor(pageCount) : 0;
}

function clampPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page)) {
    return 1;
  }

  return Math.min(Math.max(pageCount, 1), Math.max(1, Math.floor(page)));
}

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function PdfPanel({ document, requestedPage }: PdfPanelProps) {
  const pageCount = normalizedPageCount(document.pageCount);
  const hasPages = pageCount > 0;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRegionRef = useRef<HTMLDivElement>(null);
  const renderGeneration = useRef(0);
  const [view, setView] = useState<ViewState>(() => ({
    document,
    requestedPage,
    currentPage: clampPage(requestedPage, pageCount),
    scale: 1,
  }));
  const [renderError, setRenderError] = useState<RenderError | null>(null);

  if (view.document !== document) {
    setView({
      document,
      requestedPage,
      currentPage: clampPage(requestedPage, pageCount),
      scale: 1,
    });
  } else if (view.requestedPage !== requestedPage) {
    setView({
      ...view,
      requestedPage,
      currentPage: clampPage(requestedPage, pageCount),
    });
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasPages) {
      return;
    }

    const generation = renderGeneration.current + 1;
    renderGeneration.current = generation;
    let cancelled = false;
    const renderHandle = document.renderPage(canvas, view.currentPage, view.scale);

    void renderHandle.promise.then(
      () => {
        if (!cancelled && renderGeneration.current === generation) {
          setRenderError((current) =>
            current?.document === document &&
            current.page === view.currentPage &&
            current.scale === view.scale
              ? null
              : current,
          );
        }
      },
      (error: unknown) => {
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
      },
    );

    return () => {
      cancelled = true;
      renderHandle.cancel();
    };
  }, [document, hasPages, view.currentPage, view.scale]);

  const currentError =
    renderError?.document === document &&
    renderError.page === view.currentPage &&
    renderError.scale === view.scale
      ? renderError
      : null;

  function goToPage(page: number) {
    setView((current) => ({
      ...current,
      currentPage: clampPage(page, pageCount),
    }));
  }

  function changeScale(amount: number) {
    setView((current) => ({ ...current, scale: clampScale(current.scale + amount) }));
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
    const fittedScale = canvas && availableWidth > 0 && canvas.width > 0
      ? clampScale((view.scale * availableWidth) / canvas.width)
      : 1;
    setView((current) => ({ ...current, scale: fittedScale }));
  }

  return (
    <section className="pdf-panel" aria-label="PDF 阅读器">
      <div className="pdf-toolbar">
        <div className="pdf-toolbar__group">
          <button
            className="secondary-button"
            type="button"
            disabled={!hasPages || view.currentPage <= 1}
            onClick={() => goToPage(view.currentPage - 1)}
          >
            上一页
          </button>
          <label className="pdf-page-input">
            <span>页码</span>
            <input
              aria-label="页码"
              type="number"
              min={1}
              max={hasPages ? pageCount : undefined}
              value={hasPages ? view.currentPage : ''}
              disabled={!hasPages}
              onChange={handleDirectPage}
            />
          </label>
          <output className="pdf-status" role="status" aria-label="页码状态">
            {hasPages ? `第 ${view.currentPage} / ${pageCount} 页` : '无可显示页面'}
          </output>
          <button
            className="secondary-button"
            type="button"
            disabled={!hasPages || view.currentPage >= pageCount}
            onClick={() => goToPage(view.currentPage + 1)}
          >
            下一页
          </button>
        </div>

        <div className="pdf-toolbar__group">
          <button
            className="secondary-button"
            type="button"
            disabled={!hasPages || view.scale <= MIN_SCALE}
            onClick={() => changeScale(-SCALE_STEP)}
          >
            缩小
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={!hasPages || view.scale >= MAX_SCALE}
            onClick={() => changeScale(SCALE_STEP)}
          >
            放大
          </button>
          <button className="secondary-button" type="button" disabled={!hasPages} onClick={fitWidth}>
            适应宽度
          </button>
          <output className="pdf-status" role="status" aria-label="缩放状态">
            缩放 {Math.round(view.scale * 100)}%
          </output>
        </div>
      </div>

      {!hasPages ? (
        <div className="pdf-notice" role="alert" aria-live="polite">PDF 文档没有可显示的页面。</div>
      ) : currentError ? (
        <div className="pdf-notice pdf-notice--error" role="alert" aria-live="polite">
          {currentError.message}
        </div>
      ) : null}

      <div className="pdf-canvas-shell" ref={canvasRegionRef}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={hasPages ? `PDF 第 ${view.currentPage} 页` : 'PDF 无可显示页面'}
        />
      </div>
    </section>
  );
}

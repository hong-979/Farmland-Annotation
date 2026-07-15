import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfRenderHandle {
  promise: Promise<void>;
  cancel(): void;
}

export interface PdfDocumentAdapter {
  pageCount: number;
  renderPage(
    canvas: HTMLCanvasElement,
    pageNumber: number,
    scale: number,
  ): PdfRenderHandle;
  destroy(): Promise<void>;
}

export async function openPdfDocument(file: File): Promise<PdfDocumentAdapter> {
  const data = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data });
  const pdfDocument = await loadingTask.promise;
  const activeRenders = new WeakMap<HTMLCanvasElement, PdfRenderHandle>();

  return {
    pageCount: pdfDocument.numPages,

    renderPage(canvas, pageNumber, scale) {
      const previousRender = activeRenders.get(canvas);
      previousRender?.cancel();
      let cancelled = false;
      let renderTask: ReturnType<Awaited<ReturnType<typeof pdfDocument.getPage>>['render']> | null = null;

      const promise = (async () => {
        await previousRender?.promise.catch(() => undefined);
        if (cancelled) return;

        const page = await pdfDocument.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const canvasContext = canvas.getContext('2d');
        if (!canvasContext) {
          throw new Error('无法获取 PDF 画布上下文，请检查浏览器是否支持 Canvas。');
        }

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        renderTask = page.render({ canvas, canvasContext, viewport });
        if (cancelled) renderTask.cancel();
        await renderTask.promise;
      })();

      const handle: PdfRenderHandle = {
        promise,
        cancel() {
          cancelled = true;
          renderTask?.cancel();
        },
      };
      activeRenders.set(canvas, handle);

      const removeIfCurrent = () => {
        if (activeRenders.get(canvas) === handle) {
          activeRenders.delete(canvas);
        }
      };
      void promise.then(removeIfCurrent, removeIfCurrent);
      return handle;
    },

    async destroy() {
      await loadingTask.destroy();
    },
  };
}

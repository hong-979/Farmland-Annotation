import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfDocumentAdapter {
  pageCount: number;
  renderPage(
    canvas: HTMLCanvasElement,
    pageNumber: number,
    scale: number,
  ): Promise<void>;
  destroy(): Promise<void>;
}

export async function openPdfDocument(file: File): Promise<PdfDocumentAdapter> {
  const data = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data });
  const pdfDocument = await loadingTask.promise;

  return {
    pageCount: pdfDocument.numPages,

    async renderPage(canvas, pageNumber, scale) {
      const page = await pdfDocument.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvasContext = canvas.getContext('2d');

      if (!canvasContext) {
        throw new Error('无法获取 PDF 画布上下文，请检查浏览器是否支持 Canvas。');
      }

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      const renderTask = page.render({ canvas, canvasContext, viewport });
      await renderTask.promise;
    },

    async destroy() {
      await loadingTask.destroy();
    },
  };
}

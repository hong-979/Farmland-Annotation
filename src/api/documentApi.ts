import { HttpError } from './http';

export async function fetchDocumentPdfFile(documentId: number) {
  const response = await fetch(`/api/documents/${documentId}/pdf`, {
    credentials: 'include',
  });

  if (!response.ok) {
    const text = await response.text();
    let message = 'PDF 读取失败，请稍后重试。';

    if (text) {
      try {
        const payload = JSON.parse(text) as { error?: unknown };
        if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
          message = payload.error;
        }
      } catch {
        message = text;
      }
    }

    throw new HttpError(response.status, message, null);
  }

  const blob = await response.blob();
  return new File([blob], `document-${documentId}.pdf`, {
    type: blob.type || 'application/pdf',
  });
}

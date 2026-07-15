import { useState } from 'react';

import { buildExportFileName, serializeExport } from '../domain/exportAnnotation';
import type { AnnotationDocument, ValidationIssue } from '../domain/types';

export type JsonDownload = (text: string, fileName: string) => void;

export function downloadJson(text: string, fileName: string): void {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  let url: string | null = null;

  try {
    url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
  } finally {
    if (url !== null) URL.revokeObjectURL(url);
  }
}

interface ExportActionsProps {
  document: AnnotationDocument;
  allIssues: ValidationIssue[];
  onExportSuccess(text: string): void;
  download?: JsonDownload;
  now?: () => Date;
}

export function ExportActions({
  document,
  allIssues,
  onExportSuccess,
  download = downloadJson,
  now = () => new Date(),
}: ExportActionsProps) {
  const [error, setError] = useState<string | null>(null);
  const completeDisabled = allIssues.some((issue) => issue.severity === 'error');

  function exportDocument(partial: boolean) {
    setError(null);
    try {
      const text = serializeExport(document);
      JSON.parse(text);
      download(text, buildExportFileName(document.sourceName, partial, now()));
      onExportSuccess(text);
    } catch {
      setError('导出失败，请重试；如问题持续，请检查浏览器的下载权限。');
    }
  }

  return (
    <div className="export-actions">
      <button type="button" onClick={() => exportDocument(true)}>
        导出部分结果
      </button>
      <button type="button" disabled={completeDisabled} onClick={() => exportDocument(false)}>
        导出完整结果
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

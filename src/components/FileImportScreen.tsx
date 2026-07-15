import { useState } from 'react';
import type { FormEvent } from 'react';
import type { ValidationIssue } from '../domain/types';

export interface ImportSelection {
  jsonFile: File;
  pdfFile: File;
}

interface FileImportScreenProps {
  busy: boolean;
  issues: ValidationIssue[];
  onImport(selection: ImportSelection): Promise<void>;
}

export function FileImportScreen({ busy, issues, onImport }: FileImportScreenProps) {
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy || jsonFile === null || pdfFile === null) {
      return;
    }

    void onImport({ jsonFile, pdfFile }).catch(() => undefined);
  }

  return (
    <main className="import-shell">
      <section className="import-card" aria-labelledby="import-heading">
        <p className="eyebrow">本地专家工作台</p>
        <h1 id="import-heading">专家标注平台</h1>
        <p className="privacy-note">
          所有文件仅在本机浏览器中处理，不会上传到服务器。
        </p>

        <form onSubmit={handleSubmit}>
          <div className="file-fields">
            <label className="file-field" htmlFor="annotation-json">
              <span>选择标注 JSON</span>
              <input
                id="annotation-json"
                name="annotation-json"
                type="file"
                accept="application/json,.json"
                disabled={busy}
                onChange={(event) => setJsonFile(event.currentTarget.files?.[0] ?? null)}
              />
              {jsonFile ? <span className="selected-file-name">{jsonFile.name}</span> : null}
            </label>

            <label className="file-field" htmlFor="source-pdf">
              <span>选择对应 PDF</span>
              <input
                id="source-pdf"
                name="source-pdf"
                type="file"
                accept="application/pdf,.pdf"
                disabled={busy}
                onChange={(event) => setPdfFile(event.currentTarget.files?.[0] ?? null)}
              />
              {pdfFile ? <span className="selected-file-name">{pdfFile.name}</span> : null}
            </label>
          </div>

          <div className="import-issues" aria-label="导入问题" aria-live="polite">
            {issues.map((issue) => (
              <p key={`${issue.code}:${issue.path}`} className={`import-issue ${issue.severity}`}>
                {issue.message}
              </p>
            ))}
          </div>

          <button
            className="import-submit"
            type="submit"
            disabled={busy || jsonFile === null || pdfFile === null}
          >
            {busy ? '正在导入…' : '进入标注工作台'}
          </button>
        </form>
      </section>
    </main>
  );
}

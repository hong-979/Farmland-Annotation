import { useEffect, useState } from 'react';
import {
  FileImportScreen,
  type ImportSelection,
} from './components/FileImportScreen';
import { parseAnnotationJson } from './domain/parseAnnotation';
import type { AnnotationDocument, ValidationIssue } from './domain/types';
import { readUtf8JsonFile } from './storage/fingerprint';
import './styles.css';

interface FileMetadata {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

interface ImportedAnnotation {
  document: AnnotationDocument;
  pdfUrl: string;
  jsonFile: FileMetadata;
  pdfFile: FileMetadata;
}

const JSON_READ_ISSUE: ValidationIssue = {
  severity: 'error',
  code: 'json.read',
  path: '$',
  message: 'JSON 文件读取失败，请确认文件采用 UTF-8 编码且未损坏，然后重试。',
};

const PDF_URL_ISSUE: ValidationIssue = {
  severity: 'error',
  code: 'pdf.open',
  path: '$',
  message: '无法在浏览器中打开所选 PDF，请重新选择未损坏的 PDF 文件后重试。',
};

const UNKNOWN_IMPORT_ISSUE: ValidationIssue = {
  severity: 'error',
  code: 'import.unknown',
  path: '$',
  message: '导入失败，请检查 JSON 与 PDF 文件后重试。',
};

function App() {
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [importedAnnotation, setImportedAnnotation] = useState<ImportedAnnotation | null>(null);
  const pdfUrl = importedAnnotation?.pdfUrl ?? null;

  useEffect(
    () => () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    },
    [pdfUrl],
  );

  async function handleImport({ jsonFile, pdfFile }: ImportSelection): Promise<void> {
    setBusy(true);
    setIssues([]);

    try {
      let jsonContents: Awaited<ReturnType<typeof readUtf8JsonFile>>;

      try {
        jsonContents = await readUtf8JsonFile(jsonFile);
      } catch {
        setIssues([JSON_READ_ISSUE]);
        return;
      }

      const parseResult = parseAnnotationJson(
        jsonContents.text,
        jsonFile.name,
        jsonContents.fingerprint,
      );

      if (!parseResult.ok) {
        setIssues(parseResult.errors);
        return;
      }

      let nextPdfUrl: string;

      try {
        nextPdfUrl = URL.createObjectURL(pdfFile);
      } catch {
        setIssues([PDF_URL_ISSUE]);
        return;
      }

      setImportedAnnotation({
        document: parseResult.document,
        pdfUrl: nextPdfUrl,
        jsonFile: toFileMetadata(jsonFile),
        pdfFile: toFileMetadata(pdfFile),
      });
      setIssues(parseResult.warnings);
    } catch {
      setIssues([UNKNOWN_IMPORT_ISSUE]);
    } finally {
      setBusy(false);
    }
  }

  return <FileImportScreen busy={busy} issues={issues} onImport={handleImport} />;
}

function toFileMetadata(file: File): FileMetadata {
  return {
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
  };
}

export default App;

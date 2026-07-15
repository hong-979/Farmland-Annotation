import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileImportScreen,
  type ImportSelection,
} from './components/FileImportScreen';
import { AnnotationPanel } from './components/AnnotationPanel';
import { ExportActions, downloadJson, type JsonDownload } from './components/ExportActions';
import { serializeExport } from './domain/exportAnnotation';
import { TaskSidebar } from './components/TaskSidebar';
import { Workspace } from './components/Workspace';
import { parseAnnotationJson } from './domain/parseAnnotation';
import type { AnnotationDocument, DraftPayload, ValidationIssue } from './domain/types';
import { PdfPanel } from './pdf/PdfPanel';
import { openPdfDocument, type PdfDocumentAdapter } from './pdf/pdfAdapter';
import { useAnnotationSession } from './state/useAnnotationSession';
import { IndexedDbDraftRepository, type DraftRepository } from './storage/draftRepository';
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

export interface AppProps {
  repository?: DraftRepository;
  openPdf?: (file: File) => Promise<PdfDocumentAdapter>;
  download?: JsonDownload;
}

const defaultDraftRepository = new IndexedDbDraftRepository();

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

function App({
  repository = defaultDraftRepository,
  openPdf = openPdfDocument,
  download = downloadJson,
}: AppProps = {}) {
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [importedAnnotation, setImportedAnnotation] = useState<ImportedAnnotation | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PdfDocumentAdapter | null>(null);
  const [pendingDraft, setPendingDraft] = useState<DraftPayload | null>(null);
  const mountedRef = useRef(false);
  const importGenerationRef = useRef(0);
  const pdfUrl = importedAnnotation?.pdfUrl ?? null;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      importGenerationRef.current += 1;
    };
  }, []);

  useEffect(
    () => () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    },
    [pdfUrl],
  );

  async function handleImport({ jsonFile, pdfFile }: ImportSelection): Promise<void> {
    const importGeneration = importGenerationRef.current + 1;
    importGenerationRef.current = importGeneration;
    const isCurrentImport = () =>
      mountedRef.current && importGenerationRef.current === importGeneration;

    setBusy(true);
    setIssues([]);
    setPendingDraft(null);

    try {
      let jsonContents: Awaited<ReturnType<typeof readUtf8JsonFile>>;

      try {
        jsonContents = await readUtf8JsonFile(jsonFile);
      } catch {
        if (isCurrentImport()) {
          setIssues([JSON_READ_ISSUE]);
        }
        return;
      }

      if (!isCurrentImport()) {
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

      if (!isCurrentImport()) {
        return;
      }

      let nextPdfUrl: string;

      try {
        nextPdfUrl = URL.createObjectURL(pdfFile);
      } catch {
        if (isCurrentImport()) {
          setIssues([PDF_URL_ISSUE]);
        }
        return;
      }

      if (!isCurrentImport()) {
        URL.revokeObjectURL(nextPdfUrl);
        return;
      }

      setImportedAnnotation({
        document: parseResult.document,
        pdfUrl: nextPdfUrl,
        jsonFile: toFileMetadata(jsonFile),
        pdfFile: toFileMetadata(pdfFile),
      });
      setIssues(parseResult.warnings);

      try {
        const loadedDraft = await repository.load(parseResult.document.fingerprint);
        if (!isCurrentImport()) return;
        setPendingDraft(isCompatibleDraft(loadedDraft, parseResult.document) ? loadedDraft : null);
      } catch {
        if (!isCurrentImport()) return;
        setPendingDraft(null);
      }

      try {
        const nextPdfDocument = await openPdf(pdfFile);
        if (!isCurrentImport()) {
          await nextPdfDocument.destroy();
          return;
        }
        setPdfDocument((previous) => {
          if (previous) void previous.destroy();
          return nextPdfDocument;
        });
      } catch {
        if (isCurrentImport()) {
          setPdfDocument(null);
        }
      }
    } catch {
      if (isCurrentImport()) {
        setIssues([UNKNOWN_IMPORT_ISSUE]);
      }
    } finally {
      if (isCurrentImport()) {
        setBusy(false);
      }
    }
  }

  if (importedAnnotation === null) {
    return <FileImportScreen busy={busy} issues={issues} onImport={handleImport} />;
  }

  return (
    <AnnotationWorkspace
      importedAnnotation={importedAnnotation}
      pdfDocument={pdfDocument}
      pendingDraft={pendingDraft}
      repository={repository}
      download={download}
      onDismissDraft={() => setPendingDraft(null)}
      onReset={() => {
        importGenerationRef.current += 1;
        setImportedAnnotation(null);
        setPdfDocument((previous) => {
          if (previous) void previous.destroy();
          return null;
        });
        setIssues([]);
        setPendingDraft(null);
      }}
    />
  );
}

function AnnotationWorkspace({
  importedAnnotation,
  pdfDocument,
  pendingDraft,
  repository,
  download,
  onDismissDraft,
  onReset,
}: {
  importedAnnotation: ImportedAnnotation;
  pdfDocument: PdfDocumentAdapter | null;
  pendingDraft: DraftPayload | null;
  repository: DraftRepository;
  download: JsonDownload;
  onDismissDraft(): void;
  onReset(): void;
}) {
  const session = useAnnotationSession({
    document: importedAnnotation.document,
    pdfPageCount: pdfDocument?.pageCount ?? null,
    repository,
  });
  const [requestedPage, setRequestedPage] = useState(1);
  const initialExportText = useMemo(
    () => serializeExport(importedAnnotation.document),
    [importedAnnotation.document],
  );
  const [lastExportedText, setLastExportedText] = useState(initialExportText);
  const currentExportText = useMemo(() => serializeExport(session.document), [session.document]);
  const hasUnexportedChanges = currentExportText !== lastExportedText;

  useEffect(() => {
    if (!hasUnexportedChanges) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnexportedChanges]);

  return (
    <Workspace
      toolbar={(
        <>
          <span>{importedAnnotation.jsonFile.name}</span>
          <span>{importedAnnotation.pdfFile.name}</span>
          <span>草稿状态：{session.draftState}</span>
          {pendingDraft ? (
            <span role="status">
              发现可恢复的本地草稿
              <button
                type="button"
                onClick={() => {
                  session.restoreDraft(pendingDraft);
                  onDismissDraft();
                }}
              >
                恢复本地草稿
              </button>
              <button type="button" onClick={onDismissDraft}>忽略本地草稿</button>
            </span>
          ) : null}
          <ExportActions
            document={session.document}
            allIssues={session.allIssues}
            download={download}
            onExportSuccess={setLastExportedText}
          />
          <button type="button" onClick={onReset}>重新选择文件</button>
        </>
      )}
      sidebar={(
        <TaskSidebar
          tasks={session.document.tasks}
          originalTasks={session.document.originalTasks}
          currentTaskIndex={session.currentTaskIndex}
          pdfPageCount={pdfDocument?.pageCount ?? null}
          onSelect={session.selectTask}
        />
      )}
      pdfPanel={pdfDocument ? (
        <PdfPanel document={pdfDocument} requestedPage={requestedPage} />
      ) : (
        <p>PDF 暂时无法打开，仍可继续编辑 JSON 标注。</p>
      )}
      annotationPanel={session.document.tasks.length > 0 ? (
        <AnnotationPanel
          task={session.currentTask}
          issues={session.issues}
          onAction={session.dispatch}
          onJumpToPage={setRequestedPage}
          onSaveAndNext={session.saveAndNext}
        />
      ) : (
        <p>当前 JSON 中没有可标注任务。</p>
      )}
    />
  );
}

function isCompatibleDraft(
  draft: DraftPayload | null,
  document: AnnotationDocument,
): draft is DraftPayload {
  if (
    draft === null ||
    draft.fingerprint !== document.fingerprint ||
    draft.sourceName !== document.sourceName ||
    draft.tasks.length === 0 ||
    draft.tasks.length !== document.originalTasks.length
  ) {
    return false;
  }

  const originalByIndex = new Map<number, AnnotationDocument['tasks'][number]>();
  for (const original of document.originalTasks) {
    if (originalByIndex.has(original.index)) return false;
    originalByIndex.set(original.index, original);
  }

  const draftIndices = new Set<number>();
  for (const task of draft.tasks) {
    if (!Number.isSafeInteger(task.index) || draftIndices.has(task.index)) return false;
    draftIndices.add(task.index);
    const original = originalByIndex.get(task.index);
    if (
      original === undefined ||
      original.label !== task.label ||
      original.reviewPoint !== task.reviewPoint
    ) {
      return false;
    }
  }

  return draftIndices.size === originalByIndex.size;
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

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportSelection } from './components/FileImportScreen';
import type {
  AnnotationDocument,
  AnnotationTask,
  DraftPayload,
  ParseResult,
  ValidationIssue,
} from './domain/types';
import type { DraftRepository } from './storage/draftRepository';
import App from './App';

interface FileImportScreenProps {
  busy: boolean;
  issues: ValidationIssue[];
  onImport(selection: ImportSelection): Promise<void>;
}

const { fileImportScreenMock, openPdfDocumentMock, parseAnnotationJsonMock, readUtf8JsonFileMock } = vi.hoisted(
  () => ({
    fileImportScreenMock: vi.fn(),
    openPdfDocumentMock: vi.fn(),
    parseAnnotationJsonMock: vi.fn(),
    readUtf8JsonFileMock: vi.fn(),
  }),
);

vi.mock('./components/FileImportScreen', () => ({
  FileImportScreen: (props: FileImportScreenProps) => {
    fileImportScreenMock(props);
    return <div data-testid="file-import-screen" />;
  },
}));

vi.mock('./domain/parseAnnotation', () => ({
  parseAnnotationJson: parseAnnotationJsonMock,
}));

vi.mock('./storage/fingerprint', () => ({
  readUtf8JsonFile: readUtf8JsonFileMock,
}));

vi.mock('./pdf/pdfAdapter', () => ({
  openPdfDocument: openPdfDocumentMock,
}));

const document: AnnotationDocument = {
  sourceName: 'annotations.json',
  fingerprint: 'fingerprint-1',
  rawRoot: { output: [] },
  originalTasks: [],
  tasks: [],
};

function task(index: number, reviewPoint: string): AnnotationTask {
  return {
    index,
    label: `标签 ${index}`,
    reviewPoint,
    verificationStatus: null,
    evidenceFragments: [],
    judgmentBasis: '',
    pageNumbers: [],
    raw: {},
  };
}

function twoTaskDocument(): AnnotationDocument {
  const tasks = [task(7, '导入任务一'), task(19, '导入任务二')];
  return {
    sourceName: 'synthetic.json',
    fingerprint: 'synthetic-fingerprint',
    rawRoot: { output: [] },
    originalTasks: structuredClone(tasks),
    tasks,
  };
}

function draftRepository(draft: DraftPayload | null): DraftRepository {
  return {
    load: vi.fn().mockResolvedValue(draft),
    save: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

async function importSyntheticDocument(
  annotationDocument: AnnotationDocument,
  repository: DraftRepository,
  download?: (text: string, fileName: string) => void,
) {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn().mockReturnValue('blob:synthetic'),
    revokeObjectURL: vi.fn(),
  });
  readUtf8JsonFileMock.mockResolvedValue({
    text: '{"output":[]}',
    fingerprint: annotationDocument.fingerprint,
  });
  parseAnnotationJsonMock.mockReturnValue({
    ok: true,
    document: annotationDocument,
    warnings: [],
  } satisfies ParseResult);
  openPdfDocumentMock.mockResolvedValue({
    pageCount: 3,
    renderPage: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
    destroy: vi.fn().mockResolvedValue(undefined),
  });
  render(<App repository={repository} download={download} />);

  await act(() =>
    latestImportProps().onImport({
      jsonFile: new File(['{"output":[]}'], annotationDocument.sourceName, {
        type: 'application/json',
      }),
      pdfFile: new File(['pdf'], 'synthetic.pdf', { type: 'application/pdf' }),
    }),
  );
}

function latestImportProps(): FileImportScreenProps {
  return fileImportScreenMock.mock.calls.at(-1)?.[0] as FileImportScreenProps;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  fileImportScreenMock.mockClear();
  openPdfDocumentMock.mockReset();
  parseAnnotationJsonMock.mockReset();
  readUtf8JsonFileMock.mockReset();
});

describe('App', () => {
  it('tracks beforeunload only for changes since the last successful partial export', async () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    const download = vi.fn();
    await importSyntheticDocument(twoTaskDocument(), draftRepository(null), download);
    const beforeUnloadAdds = () => addEventListener.mock.calls.filter(([type]) => type === 'beforeunload');
    const beforeUnloadRemoves = () => removeEventListener.mock.calls.filter(([type]) => type === 'beforeunload');

    expect(beforeUnloadAdds()).toHaveLength(0);
    fireEvent.click(screen.getByRole('radio', { name: '正确' }));
    await waitFor(() => expect(beforeUnloadAdds()).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: '导出部分结果' }));
    expect(download).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(beforeUnloadRemoves()).toHaveLength(1));

    fireEvent.click(screen.getByRole('radio', { name: '错误' }));
    await waitFor(() => expect(beforeUnloadAdds()).toHaveLength(2));
    expect(screen.getByRole('button', { name: '导出完整结果' })).toBeDisabled();
  });

  it('keeps the working copy dirty when a partial download fails', async () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    const download = vi.fn(() => {
      throw new Error('blocked');
    });
    await importSyntheticDocument(twoTaskDocument(), draftRepository(null), download);

    fireEvent.click(screen.getByRole('radio', { name: '正确' }));
    await waitFor(() => expect(
      addEventListener.mock.calls.filter(([type]) => type === 'beforeunload'),
    ).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: '导出部分结果' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/导出失败.*重试/);
    expect(removeEventListener.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(0);
  });

  it('offers a matching local draft and restores its tasks and current array position on acceptance', async () => {
    const annotationDocument = twoTaskDocument();
    const restoredTasks = structuredClone(annotationDocument.tasks);
    restoredTasks[1].verificationStatus = 'correct';
    const repository = draftRepository({
      fingerprint: annotationDocument.fingerprint,
      sourceName: annotationDocument.sourceName,
      tasks: restoredTasks,
      currentTaskIndex: 1,
      savedAt: '2026-07-14T08:00:00.000Z',
    });

    await importSyntheticDocument(annotationDocument, repository);

    expect(screen.getByText('发现可恢复的本地草稿')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '恢复本地草稿' }));
    expect(screen.getByText('任务 2 / 2')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '正确' })).toBeChecked();
    expect(repository.load).toHaveBeenCalledWith(annotationDocument.fingerprint);
  });

  it('uses imported data after explicitly ignoring a matching draft', async () => {
    const annotationDocument = twoTaskDocument();
    const restoredTasks = structuredClone(annotationDocument.tasks);
    restoredTasks[1].verificationStatus = 'correct';
    const repository = draftRepository({
      fingerprint: annotationDocument.fingerprint,
      sourceName: annotationDocument.sourceName,
      tasks: restoredTasks,
      currentTaskIndex: 1,
      savedAt: '2026-07-14T08:00:00.000Z',
    });

    await importSyntheticDocument(annotationDocument, repository);
    fireEvent.click(screen.getByRole('button', { name: '忽略本地草稿' }));

    expect(screen.queryByText('发现可恢复的本地草稿')).not.toBeInTheDocument();
    expect(screen.getByText('任务 1 / 2')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '正确' })).not.toBeChecked();
  });

  it.each([
    ['foreign fingerprint', (draft: DraftPayload) => ({ ...draft, fingerprint: 'foreign' })],
    ['foreign source', (draft: DraftPayload) => ({ ...draft, sourceName: 'foreign.json' })],
    ['empty tasks', (draft: DraftPayload) => ({ ...draft, tasks: [] })],
    ['duplicate stable index', (draft: DraftPayload) => ({
      ...draft,
      tasks: [draft.tasks[0], structuredClone(draft.tasks[0])],
    })],
    ['mismatched task identity', (draft: DraftPayload) => ({
      ...draft,
      tasks: draft.tasks.map((item, index) => index === 0
        ? { ...item, reviewPoint: '被篡改的任务身份' }
        : item),
    })],
  ])('safely rejects an invalid draft with %s', async (_label, mutate) => {
    const annotationDocument = twoTaskDocument();
    const validDraft: DraftPayload = {
      fingerprint: annotationDocument.fingerprint,
      sourceName: annotationDocument.sourceName,
      tasks: structuredClone(annotationDocument.tasks),
      currentTaskIndex: 1,
      savedAt: '2026-07-14T08:00:00.000Z',
    };

    await importSyntheticDocument(annotationDocument, draftRepository(mutate(validDraft)));

    expect(screen.queryByText('发现可恢复的本地草稿')).not.toBeInTheDocument();
    expect(screen.getByText('任务 1 / 2')).toBeInTheDocument();
  });

  it('routes a successful synthetic import into the wired annotation workspace', async () => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:synthetic'),
      revokeObjectURL: vi.fn(),
    });
    const workspaceDocument: AnnotationDocument = {
      sourceName: 'synthetic.json',
      fingerprint: 'synthetic-fingerprint',
      rawRoot: { output: [] },
      originalTasks: [],
      tasks: [
        {
          index: 7,
          label: '条款 A',
          reviewPoint: '检查合成任务是否完整接线',
          verificationStatus: null,
          evidenceFragments: [],
          judgmentBasis: '',
          pageNumbers: [],
          raw: {},
        },
      ],
    };
    workspaceDocument.originalTasks = structuredClone(workspaceDocument.tasks);
    const fakeAdapter = {
      pageCount: 3,
      renderPage: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    readUtf8JsonFileMock.mockResolvedValue({
      text: '{"output":[]}',
      fingerprint: workspaceDocument.fingerprint,
    });
    parseAnnotationJsonMock.mockReturnValue({
      ok: true,
      document: workspaceDocument,
      warnings: [],
    } satisfies ParseResult);
    openPdfDocumentMock.mockResolvedValue(fakeAdapter);
    render(<App />);

    await act(() =>
      latestImportProps().onImport({
        jsonFile: new File(['{"output":[]}'], 'synthetic.json', {
          type: 'application/json',
        }),
        pdfFile: new File(['synthetic-pdf'], 'synthetic.pdf', {
          type: 'application/pdf',
        }),
      }),
    );

    expect(screen.queryByTestId('file-import-screen')).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: '标注任务列表' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'PDF 原文' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '专家标注表单' })).toBeInTheDocument();
    expect(screen.getAllByText('检查合成任务是否完整接线')).toHaveLength(2);
    expect(screen.getByRole('group', { name: '专家判断' })).toBeInTheDocument();
  });

  it('renders the FileImportScreen boundary', () => {
    render(<App />);

    expect(screen.getByTestId('file-import-screen')).toBeInTheDocument();
    expect(latestImportProps()).toEqual(
      expect.objectContaining({ busy: false, issues: [], onImport: expect.any(Function) }),
    );
  });

  it('reads and parses the JSON before creating a local PDF URL', async () => {
    const createObjectURL = vi.fn().mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    readUtf8JsonFileMock.mockResolvedValue({ text: '{"output":[]}', fingerprint: 'fingerprint-1' });
    parseAnnotationJsonMock.mockReturnValue({
      ok: true,
      document,
      warnings: [],
    } satisfies ParseResult);
    const firstSelection: ImportSelection = {
      jsonFile: new File([], 'annotations.json', { type: 'application/json' }),
      pdfFile: new File([], 'first.pdf', { type: 'application/pdf' }),
    };
    const secondSelection: ImportSelection = {
      jsonFile: new File([], 'annotations.json', { type: 'application/json' }),
      pdfFile: new File([], 'second.pdf', { type: 'application/pdf' }),
    };
    const view = render(<App />);

    await act(() => latestImportProps().onImport(firstSelection));

    expect(readUtf8JsonFileMock).toHaveBeenCalledWith(firstSelection.jsonFile);
    expect(parseAnnotationJsonMock).toHaveBeenCalledWith(
      '{"output":[]}',
      'annotations.json',
      'fingerprint-1',
    );
    expect(createObjectURL).toHaveBeenCalledWith(firstSelection.pdfFile);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    await act(() => latestImportProps().onImport(secondSelection));

    expect(createObjectURL).toHaveBeenLastCalledWith(secondSelection.pdfFile);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenNthCalledWith(1, 'blob:first');

    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenNthCalledWith(2, 'blob:second');
  });

  it('passes parser issues to the import screen without creating a PDF URL', async () => {
    const createObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    const syntaxIssue: ValidationIssue = {
      severity: 'error',
      code: 'json.syntax',
      path: '$',
      message: 'JSON 解析失败，请检查文件格式是否完整且符合 JSON 语法。',
    };
    readUtf8JsonFileMock.mockResolvedValue({ text: '{bad', fingerprint: 'fingerprint-1' });
    parseAnnotationJsonMock.mockReturnValue({ ok: false, errors: [syntaxIssue] } satisfies ParseResult);
    render(<App />);

    await act(() =>
      latestImportProps().onImport({
        jsonFile: new File([], 'bad.json', { type: 'application/json' }),
        pdfFile: new File([], 'report.pdf', { type: 'application/pdf' }),
      }),
    );

    expect(latestImportProps().issues).toEqual([syntaxIssue]);
    expect(latestImportProps().busy).toBe(false);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('does not create a PDF URL when a pending import finishes after unmount', async () => {
    let resolveRead!: (value: { text: string; fingerprint: string }) => void;
    const pendingRead = new Promise<{ text: string; fingerprint: string }>((resolve) => {
      resolveRead = resolve;
    });
    const createObjectURL = vi.fn().mockReturnValue('blob:late');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    readUtf8JsonFileMock.mockReturnValue(pendingRead);
    parseAnnotationJsonMock.mockReturnValue({
      ok: true,
      document,
      warnings: [],
    } satisfies ParseResult);
    const view = render(<App />);
    let importPromise!: Promise<void>;

    act(() => {
      importPromise = latestImportProps().onImport({
        jsonFile: new File([], 'annotations.json', { type: 'application/json' }),
        pdfFile: new File([], 'report.pdf', { type: 'application/pdf' }),
      });
    });
    view.unmount();
    resolveRead({ text: '{"output":[]}', fingerprint: 'fingerprint-1' });
    await importPromise;

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('turns UTF-8 read failures into a Chinese actionable issue without rejecting', async () => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() });
    readUtf8JsonFileMock.mockRejectedValue(new TypeError('invalid UTF-8'));
    render(<App />);

    await expect(
      act(() =>
        latestImportProps().onImport({
          jsonFile: new File([], 'invalid.json', { type: 'application/json' }),
          pdfFile: new File([], 'report.pdf', { type: 'application/pdf' }),
        }),
      ),
    ).resolves.toBeUndefined();

    expect(latestImportProps().issues).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(/JSON.*UTF-8.*重试/),
      }),
    ]);
    expect(parseAnnotationJsonMock).not.toHaveBeenCalled();
  });
});

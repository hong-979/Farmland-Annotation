import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportSelection } from './components/FileImportScreen';
import type { AnnotationDocument, ParseResult, ValidationIssue } from './domain/types';
import App from './App';

interface FileImportScreenProps {
  busy: boolean;
  issues: ValidationIssue[];
  onImport(selection: ImportSelection): Promise<void>;
}

const { fileImportScreenMock, parseAnnotationJsonMock, readUtf8JsonFileMock } = vi.hoisted(
  () => ({
    fileImportScreenMock: vi.fn(),
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

const document: AnnotationDocument = {
  sourceName: 'annotations.json',
  fingerprint: 'fingerprint-1',
  rawRoot: { output: [] },
  originalTasks: [],
  tasks: [],
};

function latestImportProps(): FileImportScreenProps {
  return fileImportScreenMock.mock.calls.at(-1)?.[0] as FileImportScreenProps;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  fileImportScreenMock.mockClear();
  parseAnnotationJsonMock.mockReset();
  readUtf8JsonFileMock.mockReset();
});

describe('App', () => {
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

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AnnotationDocument, AnnotationTask, ValidationIssue } from '../domain/types';
import { downloadJson, ExportActions } from './ExportActions';

function completeTask(): AnnotationTask {
  return {
    index: 4,
    label: '合成标签',
    reviewPoint: '合成审查任务',
    verificationStatus: 'correct',
    evidenceFragments: [],
    judgmentBasis: '',
    pageNumbers: [],
    raw: {},
  };
}

function annotationDocument(): AnnotationDocument {
  const tasks = [completeTask()];
  return {
    sourceName: 'synthetic.json',
    fingerprint: 'synthetic-fingerprint',
    rawRoot: { output: [] },
    originalTasks: structuredClone(tasks),
    tasks,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ExportActions', () => {
  it('allows partial export with errors, includes _partial_, and reports a successful snapshot', () => {
    const download = vi.fn();
    const onExportSuccess = vi.fn();
    const issues: ValidationIssue[] = [{
      severity: 'error',
      code: 'task.decision_required',
      path: 'tasks[4].verificationStatus',
      taskIndex: 4,
      message: '请选择专家判断。',
    }];
    render(
      <ExportActions
        document={annotationDocument()}
        allIssues={issues}
        download={download}
        now={() => new Date(2026, 6, 14, 9, 8)}
        onExportSuccess={onExportSuccess}
      />,
    );

    expect(screen.getByRole('button', { name: '导出部分结果' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '导出完整结果' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '导出部分结果' }));

    expect(download).toHaveBeenCalledTimes(1);
    const [text, fileName] = download.mock.calls[0] as [string, string];
    expect(() => JSON.parse(text)).not.toThrow();
    expect(fileName).toBe('synthetic_专家标注_partial_20260714-0908.json');
    expect(onExportSuccess).toHaveBeenCalledWith(text);
  });

  it('enables complete export only without errors and keeps the baseline on download failure', () => {
    const download = vi.fn(() => {
      throw new Error('click blocked');
    });
    const onExportSuccess = vi.fn();
    render(
      <ExportActions
        document={annotationDocument()}
        allIssues={[]}
        download={download}
        now={() => new Date(2026, 6, 14, 9, 8)}
        onExportSuccess={onExportSuccess}
      />,
    );

    const complete = screen.getByRole('button', { name: '导出完整结果' });
    expect(complete).toBeEnabled();
    fireEvent.click(complete);

    expect(onExportSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/导出失败.*重试/);
  });
});

describe('downloadJson', () => {
  it('creates a UTF-8 JSON Blob, clicks a download anchor, and revokes the URL', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:download');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadJson('{"ok":true}', 'result.json');

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/json;charset=utf-8');
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:download');
  });

  it('still revokes an already-created URL when anchor click fails', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:download');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => downloadJson('{}', 'result.json')).toThrow('blocked');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:download');
  });
});

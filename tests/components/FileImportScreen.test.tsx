import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileImportScreen } from '../../src/components/FileImportScreen';
import type { ValidationIssue } from '../../src/domain/types';

afterEach(cleanup);

describe('FileImportScreen', () => {
  it('submits only after both local files are selected', async () => {
    const user = userEvent.setup();
    const onImport = vi.fn().mockResolvedValue(undefined);
    const jsonFile = new File(['{"output":[]}'], 'annotations.json', {
      type: 'application/json',
    });
    const pdfFile = new File([], 'report.pdf', { type: 'application/pdf' });

    render(<FileImportScreen busy={false} issues={[]} onImport={onImport} />);

    const submitButton = screen.getByRole('button', { name: '进入标注工作台' });
    const jsonInput = screen.getByLabelText('选择标注 JSON');
    const pdfInput = screen.getByLabelText('选择对应 PDF');
    expect(jsonInput).toHaveAttribute('accept', 'application/json,.json');
    expect(pdfInput).toHaveAttribute('accept', 'application/pdf,.pdf');
    expect(submitButton).toBeDisabled();

    await user.upload(jsonInput, jsonFile);
    expect(submitButton).toBeDisabled();
    expect(onImport).not.toHaveBeenCalled();

    await user.upload(pdfInput, pdfFile);
    expect(submitButton).toBeEnabled();
    expect(screen.getByText('annotations.json')).toBeInTheDocument();
    expect(screen.getByText('report.pdf')).toBeInTheDocument();

    await user.click(submitButton);

    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport).toHaveBeenCalledWith(expect.objectContaining({ jsonFile, pdfFile }));
  });

  it('announces actionable Chinese JSON issues', () => {
    const issues: ValidationIssue[] = [
      {
        severity: 'error',
        code: 'json.syntax',
        path: '$',
        message: 'JSON 解析失败，请检查文件格式是否完整且符合 JSON 语法。',
      },
    ];

    render(<FileImportScreen busy={false} issues={issues} onImport={vi.fn()} />);

    const issueRegion = screen.getByLabelText('导入问题');
    expect(issueRegion).toHaveAttribute('aria-live', 'polite');
    expect(within(issueRegion).getByText(issues[0].message)).toBeInTheDocument();
  });

  it('keeps the PDF local without reading its bytes', async () => {
    const user = userEvent.setup();
    const onImport = vi.fn().mockResolvedValue(undefined);
    const jsonFile = new File(['{"output":[]}'], 'annotations.json', {
      type: 'application/json',
    });
    const pdfFile = new File([], 'report.pdf', { type: 'application/pdf' });
    const arrayBuffer = vi.fn();
    const text = vi.fn();
    Object.defineProperties(pdfFile, {
      arrayBuffer: { value: arrayBuffer },
      text: { value: text },
    });

    render(<FileImportScreen busy={false} issues={[]} onImport={onImport} />);

    await user.upload(screen.getByLabelText('选择标注 JSON'), jsonFile);
    await user.upload(screen.getByLabelText('选择对应 PDF'), pdfFile);
    await user.click(screen.getByRole('button', { name: '进入标注工作台' }));

    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
    expect(onImport).toHaveBeenCalledWith({ jsonFile, pdfFile });
  });

  it('disables import controls while busy', async () => {
    const user = userEvent.setup();
    const jsonFile = new File(['{"output":[]}'], 'annotations.json', {
      type: 'application/json',
    });
    const pdfFile = new File([], 'report.pdf', { type: 'application/pdf' });

    const onImport = vi.fn();
    const { rerender } = render(
      <FileImportScreen busy={false} issues={[]} onImport={onImport} />,
    );

    await user.upload(screen.getByLabelText('选择标注 JSON'), jsonFile);
    await user.upload(screen.getByLabelText('选择对应 PDF'), pdfFile);
    rerender(<FileImportScreen busy issues={[]} onImport={onImport} />);

    expect(screen.getByRole('button', { name: '正在导入…' })).toBeDisabled();
  });
});

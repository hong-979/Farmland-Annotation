import { describe, expect, it } from 'vitest';
import { validRawText } from '../fixtures';
import { parseAnnotationJson } from '../../src/domain/parseAnnotation';

describe('parseAnnotationJson', () => {
  it('normalizes a valid record without discarding raw extensions', () => {
    const result = parseAnnotationJson(validRawText, 'synthetic.json', 'fingerprint-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.tasks[0]).toMatchObject({
      label: '水资源',
      reviewPoint: '核对可供水量是否包含计算过程。',
      verificationStatus: 'incorrect',
      pageNumbers: [2],
    });
    expect(result.document.tasks[0].raw.upstream_task_id).toBe('task-1');
    expect(result.document.tasks[0].evidenceFragments[0].raw.upstream_note).toBe('preserve me');
  });

  it('reports invalid JSON with a Chinese actionable message', () => {
    const result = parseAnnotationJson('{bad', 'bad.json', 'fp');
    expect(result).toEqual({
      ok: false,
      errors: [
        expect.objectContaining({
          code: 'json.syntax',
          path: '$',
          severity: 'error',
          message: 'JSON 解析失败，请检查文件格式是否完整且符合 JSON 语法。',
        }),
      ],
    });
  });

  it('rejects a missing output array', () => {
    const result = parseAnnotationJson('{"name":"x"}', 'bad.json', 'fp');
    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ code: 'root.output', path: '$.output' })],
    });
  });

  it('normalizes missing optional fields and reports warnings', () => {
    const text = JSON.stringify({ output: [{ review_point: '只读审查要点' }] });
    const result = parseAnnotationJson(text, 'minimal.json', 'fp');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.tasks[0]).toMatchObject({
      label: null,
      verificationStatus: null,
      evidenceFragments: [],
      judgmentBasis: '',
      pageNumbers: [],
    });
    expect(result.warnings.map((issue) => issue.code)).toContain('task.optional_fields');
  });
});

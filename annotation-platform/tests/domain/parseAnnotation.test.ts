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

  it('rejects a non-object task with the task path', () => {
    const result = parseAnnotationJson(JSON.stringify({ output: [null] }), 'bad.json', 'fp');
    expect(result).toEqual({
      ok: false,
      errors: [
        expect.objectContaining({
          code: 'task.type',
          path: '$.output[0]',
          severity: 'error',
          taskIndex: 0,
        }),
      ],
    });
  });

  it('rejects a missing review_point with the field path', () => {
    const result = parseAnnotationJson(JSON.stringify({ output: [{ review_point: '   ' }] }), 'bad.json', 'fp');
    expect(result).toEqual({
      ok: false,
      errors: [
        expect.objectContaining({
          code: 'task.review_point',
          path: '$.output[0].review_point',
          severity: 'error',
          taskIndex: 0,
        }),
      ],
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

  it('rejects present but non-array evidence_fragments with the field path', () => {
    const text = JSON.stringify({
      output: [
        {
          review_point: '核对证据字段类型',
          evidence_fragments: { page_number: 1 },
        },
      ],
    });
    const result = parseAnnotationJson(text, 'evidence-type.json', 'fp');
    expect(result).toEqual({
      ok: false,
      errors: [
        expect.objectContaining({
          code: 'task.evidence_fragments_type',
          path: '$.output[0].evidence_fragments',
          severity: 'error',
          taskIndex: 0,
          message: 'evidence_fragments 字段必须是数组，请修正该任务的证据列表格式后重新导入。',
        }),
      ],
    });
  });

  it('normalizes page numbers from evidence, deduplicates them, and sorts them', () => {
    const text = JSON.stringify({
      output: [
        {
          review_point: '核对页码归一化',
          evidence_fragments: [
            { page_number: '3', original_text: 'a', evidence_role: '直接证据' },
            { page_number: 2, original_text: 'b', evidence_role: '直接证据' },
            { page_number: '2', original_text: 'c', evidence_role: '直接证据' },
            { page_number: 0, original_text: 'd', evidence_role: '直接证据' },
            { page_number: 'bad', original_text: 'e', evidence_role: '直接证据' },
            { page_number: '1', original_text: 'f', evidence_role: '直接证据' },
          ],
        },
      ],
    });
    const result = parseAnnotationJson(text, 'pages.json', 'fp');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.tasks[0].evidenceFragments.map((fragment) => fragment.pageNumber)).toEqual([
      3,
      2,
      2,
      null,
      null,
      1,
    ]);
    expect(result.document.tasks[0].pageNumbers).toEqual([1, 2, 3]);
  });

  it('warns when verification_status is unsupported and clears the canonical value', () => {
    const text = JSON.stringify({
      output: [
        {
          label: '水资源',
          review_point: '核对状态映射',
          verification_status: '待确认',
          evidence_fragments: [],
          judgment_basis: '',
        },
      ],
    });
    const result = parseAnnotationJson(text, 'status.json', 'fp');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.tasks[0].verificationStatus).toBeNull();
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'task.verification_status_invalid',
        path: '$.output[0].verification_status',
        severity: 'warning',
        taskIndex: 0,
        message: 'verification_status 无法识别，请重新选择“正确 / 错误 / 未涉及”后再确认。',
      }),
    );
  });

  it('rejects a malformed evidence item with the evidence path', () => {
    const text = JSON.stringify({
      output: [
        {
          review_point: '核对证据结构',
          evidence_fragments: [123],
        },
      ],
    });
    const result = parseAnnotationJson(text, 'evidence.json', 'fp');
    expect(result).toEqual({
      ok: false,
      errors: [
        expect.objectContaining({
          code: 'task.evidence_type',
          path: '$.output[0].evidence_fragments[0]',
          severity: 'error',
          taskIndex: 0,
          message: 'evidence_fragments 中的每一项都必须是对象，请修正该条证据后重新导入。',
        }),
      ],
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildExportFileName,
  buildExportObject,
  serializeExport,
} from '../../src/domain/exportAnnotation';
import { parseAnnotationJson } from '../../src/domain/parseAnnotation';
import { validRawText } from '../fixtures';

const parsedDocument = () => {
  const result = parseAnnotationJson(validRawText, 'synthetic.json', 'fingerprint-1');
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error('expected valid fixture to parse');
  }
  return result.document;
};

describe('buildExportObject', () => {
  it('preserves extension fields while canonical task and evidence fields overwrite conflicting raw values', () => {
    const document = parsedDocument();

    document.tasks[0].verificationStatus = 'incorrect';
    document.tasks[0].pageNumbers = [2, 5];
    document.tasks[0].raw.verification_status = '[正确]';
    document.tasks[0].raw.page_numbers = [99];
    document.tasks[0].evidenceFragments[0].pageNumber = 2;
    document.tasks[0].evidenceFragments[0].raw.page_number = '99';
    document.tasks[0].evidenceFragments[0].originalText = '导出后的证据';
    document.tasks[0].evidenceFragments[0].evidenceRole = '直接证据';
    document.tasks[0].judgmentBasis = '导出依据';

    const exported = buildExportObject(document);

    expect(exported.root_extension).toEqual({ keep: true });
    expect((exported.output as Array<Record<string, unknown>>)[0].upstream_task_id).toBe('task-1');
    expect(
      (((exported.output as Array<Record<string, unknown>>)[0].evidence_fragments as Array<Record<string, unknown>>)[0])
        .upstream_note,
    ).toBe('preserve me');
    expect((exported.output as Array<Record<string, unknown>>)[0].verification_status).toBe('[错误]');
    expect((exported.output as Array<Record<string, unknown>>)[0].page_numbers).toEqual([2, 5]);
    expect(
      (((exported.output as Array<Record<string, unknown>>)[0].evidence_fragments as Array<Record<string, unknown>>)[0])
        .page_number,
    ).toBe('2');
  });

  it('maps null canonical status and evidence page numbers to empty export strings', () => {
    const document = parsedDocument();

    document.tasks[0].verificationStatus = null;
    document.tasks[0].raw.verification_status = '[错误]';
    document.tasks[0].evidenceFragments[0].pageNumber = null;
    document.tasks[0].evidenceFragments[0].raw.page_number = '7';

    const exported = buildExportObject(document);

    expect((exported.output as Array<Record<string, unknown>>)[0].verification_status).toBe('');
    expect(
      (((exported.output as Array<Record<string, unknown>>)[0].evidence_fragments as Array<Record<string, unknown>>)[0])
        .page_number,
    ).toBe('');
  });
});

describe('serializeExport', () => {
  it('returns parseable pretty JSON for the exported document', () => {
    const document = parsedDocument();

    const serialized = serializeExport(document);

    expect(() => JSON.parse(serialized)).not.toThrow();
    expect(JSON.parse(serialized)).toEqual(buildExportObject(document));
  });
});

describe('buildExportFileName', () => {
  it('builds a timestamped partial export filename', () => {
    expect(buildExportFileName('synthetic.json', true, new Date('2026-07-14T09:08:00'))).toBe(
      'synthetic_专家标注_partial_20260714-0908.json',
    );
  });

  it('removes only a trailing json extension for full exports', () => {
    expect(buildExportFileName('report.JSON', false, new Date('2026-07-14T23:59:00'))).toBe(
      'report_专家标注_20260714-2359.json',
    );
  });
});

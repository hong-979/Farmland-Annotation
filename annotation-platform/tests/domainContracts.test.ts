import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const typesPath = resolve(process.cwd(), 'src/domain/types.ts');
const fixturesPath = resolve(process.cwd(), 'tests/fixtures.ts');

describe('domain contracts', () => {
  it('declares the canonical annotation domain types in source', () => {
    expect(existsSync(typesPath)).toBe(true);

    const source = readFileSync(typesPath, 'utf8');

    expect(source).toContain('export type JsonRecord = Record<string, unknown>;');
    expect(source).toContain(
      "export type VerificationStatus = 'correct' | 'incorrect' | 'not_applicable' | null;",
    );
    expect(source).toContain(
      "export type TaskListStatus = 'unprocessed' | 'confirmed' | 'modified' | 'incomplete';",
    );
    expect(source).toContain('export interface EvidenceFragment {');
    expect(source).toContain('export interface AnnotationTask {');
    expect(source).toContain('export interface AnnotationDocument {');
    expect(source).toContain('export interface ValidationIssue {');
    expect(source).toContain('export interface ParseSuccess {');
    expect(source).toContain('export interface ParseFailure {');
    expect(source).toContain('export type ParseResult = ParseSuccess | ParseFailure;');
    expect(source).toContain('export interface DraftPayload {');
  });

  it('exports a complete synthetic raw document fixture', async () => {
    expect(existsSync(fixturesPath)).toBe(true);

    const source = readFileSync(fixturesPath, 'utf8');
    expect(source).toContain("project_id: 'synthetic-project'");

    const fixtureModule = await import(pathToFileURL(fixturesPath).href);

    expect(fixtureModule.validRawDocument).toMatchObject({
      project_id: 'synthetic-project',
      output: [
        {
          label: '水资源',
          review_point: '核对可供水量是否包含计算过程。',
          verification_status: '[错误]',
          judgment_basis: '已有结果缺少计算过程。',
          page_numbers: [2],
          upstream_task_id: 'task-1',
        },
      ],
      root_extension: { keep: true },
    });
    expect(fixtureModule.validRawDocument.output[0].evidence_fragments).toEqual([
      {
        page_number: '2',
        original_text: '测试证据文本',
        evidence_role: '直接冲突',
        upstream_note: 'preserve me',
      },
    ]);
    expect(fixtureModule.validRawText).toBe(
      JSON.stringify(fixtureModule.validRawDocument),
    );
  });
});

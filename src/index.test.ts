import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('index metadata', () => {
  it('declares the Chinese locale and expert platform title', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('<title>专家标注平台</title>');
  });
});

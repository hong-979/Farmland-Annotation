# Expert Annotation Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first expert annotation Web application that imports JSON and PDF files, supports evidence-backed review in a three-column workspace, autosaves isolated drafts, and exports a new UTF-8 JSON result.

**Architecture:** Create a React + TypeScript application under `annotation-platform/`. Keep parsing, validation, task state, draft persistence, PDF rendering, and export behind focused modules so the first version stays browser-only while a future server adapter can replace local storage without changing the expert workflow.

**Tech Stack:** React, TypeScript, Vite, PDF.js (`pdfjs-dist`), IndexedDB (`idb`), Vitest, Testing Library, Playwright, `pdf-lib` for generated test PDFs, plain CSS.

---

## Scope and execution notes

- Do not read or extract text from `BK20250068.pdf` during implementation or testing.
- Use generated blank PDFs and hand-written JSON fixtures for automated tests.
- Keep the original `参考.json` unchanged. It may be used only as a schema-shape reference after explicit UTF-8 decoding; tests must not depend on its business text.
- The workspace is not currently a valid Git repository. Task 1 initializes Git so the required checkpoint commits are possible. `git init` may populate the existing empty `.git` directory; it must not delete or overwrite project data.
- Run dependency installation with network approval if the sandbox blocks the npm registry.

## File map

The implementation creates one application directory with responsibility-based modules:

```text
annotation-platform/
├─ package.json                         # scripts and dependency manifest
├─ package-lock.json                    # reproducible dependency graph
├─ vite.config.ts                       # Vite and Vitest configuration
├─ playwright.config.ts                 # end-to-end test configuration
├─ index.html                           # application entry document
├─ README.md                            # local startup, privacy, import/export instructions
├─ src/
│  ├─ main.tsx                          # React bootstrap
│  ├─ App.tsx                           # top-level import/session routing
│  ├─ styles.css                        # three-column layout and responsive rules
│  ├─ domain/
│  │  ├─ types.ts                       # canonical domain and issue types
│  │  ├─ parseAnnotation.ts             # UTF-8 JSON parsing and normalization
│  │  ├─ validateTask.ts                # task validation and derived task state
│  │  └─ exportAnnotation.ts            # safe raw-data merge and UTF-8 serialization
│  ├─ state/
│  │  ├─ annotationReducer.ts           # immutable work-copy edits
│  │  └─ useAnnotationSession.ts        # session orchestration and autosave
│  ├─ storage/
│  │  ├─ fingerprint.ts                 # SHA-256 source-file fingerprint
│  │  └─ draftRepository.ts             # IndexedDB draft adapter
│  ├─ pdf/
│  │  ├─ pdfAdapter.ts                  # PDF.js isolation boundary
│  │  └─ PdfPanel.tsx                   # canvas renderer and page controls
│  └─ components/
│     ├─ FileImportScreen.tsx            # JSON/PDF selectors and import feedback
│     ├─ Workspace.tsx                   # selected three-column shell
│     ├─ TaskSidebar.tsx                 # task navigation and derived statuses
│     ├─ AnnotationPanel.tsx             # read-only basis and editable result
│     ├─ EvidenceEditor.tsx               # evidence CRUD and page jump
│     └─ ExportActions.tsx                # partial/full download actions
├─ tests/
│  ├─ setup.ts                           # DOM and IndexedDB test setup
│  ├─ fixtures.ts                        # synthetic annotation documents
│  ├─ domain/
│  │  ├─ parseAnnotation.test.ts
│  │  ├─ validateTask.test.ts
│  │  └─ exportAnnotation.test.ts
│  ├─ state/annotationReducer.test.ts
│  ├─ storage/draftRepository.test.ts
│  ├─ pdf/PdfPanel.test.tsx
│  └─ components/
│     ├─ FileImportScreen.test.tsx
│     ├─ TaskSidebar.test.tsx
│     └─ AnnotationPanel.test.tsx
└─ e2e/
   └─ annotation-flow.spec.ts            # full local expert workflow
```

## Canonical contracts

All tasks use these exact names and shapes. Later tasks must not introduce aliases for them.

```ts
export type JsonRecord = Record<string, unknown>;
export type VerificationStatus = 'correct' | 'incorrect' | 'not_applicable' | null;
export type TaskListStatus = 'unprocessed' | 'confirmed' | 'modified' | 'incomplete';

export interface EvidenceFragment {
  id: string;
  pageNumber: number | null;
  originalText: string;
  evidenceRole: string;
  raw: JsonRecord;
}

export interface AnnotationTask {
  index: number;
  label: string | null;
  reviewPoint: string;
  verificationStatus: VerificationStatus;
  evidenceFragments: EvidenceFragment[];
  judgmentBasis: string;
  pageNumbers: number[];
  raw: JsonRecord;
}

export interface AnnotationDocument {
  sourceName: string;
  fingerprint: string;
  rawRoot: JsonRecord;
  originalTasks: AnnotationTask[];
  tasks: AnnotationTask[];
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  path: string;
  message: string;
  taskIndex?: number;
}
```

### Task 1: Initialize the repository and testable React shell

**Files:**
- Create: `.gitignore`
- Create: `annotation-platform/package.json`
- Create: `annotation-platform/vite.config.ts`
- Create: `annotation-platform/tests/setup.ts`
- Create: `annotation-platform/src/App.tsx`
- Create: `annotation-platform/src/main.tsx`
- Create: `annotation-platform/src/styles.css`
- Test: `annotation-platform/src/App.test.tsx`

- [ ] **Step 1: Initialize Git and scaffold the Vite project**

Run from the workspace root:

```powershell
git init
npm create vite@latest annotation-platform -- --template react-ts
Set-Location annotation-platform
npm install pdfjs-dist idb
npm install -D vitest jsdom fake-indexeddb @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test pdf-lib
```

Expected: `annotation-platform/package.json` and `package-lock.json` exist; npm reports no installation failure.

- [ ] **Step 2: Add test scripts and Vitest configuration**

Set these scripts in `annotation-platform/package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "preview": "vite preview"
  }
}
```

Replace `annotation-platform/vite.config.ts` with:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    clearMocks: true,
  },
});
```

Create `annotation-platform/tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
```

Create the root `.gitignore` with:

```gitignore
.superpowers/
annotation-platform/node_modules/
annotation-platform/dist/
annotation-platform/coverage/
annotation-platform/test-results/
annotation-platform/playwright-report/
```

- [ ] **Step 3: Write the failing application-shell test**

Create `annotation-platform/src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('starts on the local file import screen', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '专家标注平台' })).toBeInTheDocument();
    expect(screen.getByLabelText('选择标注 JSON')).toBeInTheDocument();
    expect(screen.getByLabelText('选择对应 PDF')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the test and verify the intentional failure**

Run:

```powershell
npm test -- src/App.test.tsx
```

Expected: FAIL because the starter `App` does not expose the required Chinese heading and file inputs.

- [ ] **Step 5: Implement the minimal shell and make the test pass**

Replace `annotation-platform/src/App.tsx` with:

```tsx
import './styles.css';

export default function App() {
  return (
    <main className="import-shell">
      <section className="import-card">
        <p className="eyebrow">LOCAL EXPERT REVIEW</p>
        <h1>专家标注平台</h1>
        <p>文件仅在当前浏览器中处理，不会上传到服务器。</p>
        <label>
          选择标注 JSON
          <input type="file" accept="application/json,.json" />
        </label>
        <label>
          选择对应 PDF
          <input type="file" accept="application/pdf,.pdf" />
        </label>
      </section>
    </main>
  );
}
```

Create `annotation-platform/src/styles.css`:

```css
:root { font-family: "Microsoft YaHei UI", "PingFang SC", system-ui, sans-serif; color: #18312a; background: #f3f7f5; }
* { box-sizing: border-box; }
body { margin: 0; min-width: 1024px; min-height: 100vh; }
button, input, textarea { font: inherit; }
.import-shell { min-height: 100vh; display: grid; place-items: center; padding: 32px; }
.import-card { width: min(640px, 100%); padding: 36px; border-radius: 20px; background: #fff; box-shadow: 0 18px 50px rgba(24, 49, 42, .12); }
.import-card label { display: block; margin-top: 20px; font-weight: 700; }
.import-card input { display: block; width: 100%; margin-top: 8px; }
.eyebrow { color: #176b4d; font-size: 12px; font-weight: 800; letter-spacing: .12em; }
```

Run:

```powershell
npm test -- src/App.test.tsx
npm run build
```

Expected: test PASS; production build completes without TypeScript or Vite errors.

- [ ] **Step 6: Commit the shell**

```powershell
Set-Location ..
git add .gitignore annotation-platform docs task_plan.md findings.md progress.md
git commit -m "chore: scaffold local expert annotation app"
```

### Task 2: Define canonical types and synthetic fixtures

**Files:**
- Create: `annotation-platform/src/domain/types.ts`
- Create: `annotation-platform/tests/fixtures.ts`

- [ ] **Step 1: Add the canonical domain types**

Create `annotation-platform/src/domain/types.ts` using the exact contracts from this plan, plus:

```ts
export interface ParseSuccess {
  ok: true;
  document: AnnotationDocument;
  warnings: ValidationIssue[];
}

export interface ParseFailure {
  ok: false;
  errors: ValidationIssue[];
}

export type ParseResult = ParseSuccess | ParseFailure;

export interface DraftPayload {
  fingerprint: string;
  sourceName: string;
  tasks: AnnotationTask[];
  currentTaskIndex: number;
  savedAt: string;
}
```

- [ ] **Step 2: Create a complete synthetic fixture**

Create `annotation-platform/tests/fixtures.ts`:

```ts
export const validRawDocument = {
  project_id: 'synthetic-project',
  output: [
    {
      label: '水资源',
      review_point: '核对可供水量是否包含计算过程。',
      verification_status: '[错误]',
      evidence_fragments: [
        {
          page_number: '2',
          original_text: '测试证据文本',
          evidence_role: '直接冲突',
          upstream_note: 'preserve me',
        },
      ],
      judgment_basis: '已有结果缺少计算过程。',
      page_numbers: [2],
      upstream_task_id: 'task-1',
    },
  ],
  root_extension: { keep: true },
};

export const validRawText = JSON.stringify(validRawDocument);
```

- [ ] **Step 3: Verify the contracts compile independently**

Run:

```powershell
npm run build
```

Expected: build PASS with no unresolved domain types.

- [ ] **Step 4: Commit the contracts and fixture**

```powershell
git add annotation-platform/src/domain/types.ts annotation-platform/tests/fixtures.ts
git commit -m "test: define annotation domain fixtures"
```

Expected: commit succeeds without leaving a failing test in the repository.

### Task 3: Parse and normalize imported JSON

**Files:**
- Create: `annotation-platform/src/domain/parseAnnotation.ts`
- Create: `annotation-platform/tests/domain/parseAnnotation.test.ts`

- [ ] **Step 1: Write the complete failing parser suite**

Create `annotation-platform/tests/domain/parseAnnotation.test.ts`:

```ts
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
  });

  it('reports invalid JSON with a Chinese actionable message', () => {
    const result = parseAnnotationJson('{bad', 'bad.json', 'fp');
    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ code: 'json.syntax', path: '$', severity: 'error' })],
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
```

- [ ] **Step 2: Run the suite and verify the intentional failure**

```powershell
npm test -- tests/domain/parseAnnotation.test.ts
```

Expected: FAIL because `parseAnnotationJson` does not exist.

- [ ] **Step 3: Implement the parser**

Create `annotation-platform/src/domain/parseAnnotation.ts`:

```ts
import type {
  AnnotationDocument,
  AnnotationTask,
  EvidenceFragment,
  JsonRecord,
  ParseResult,
  ValidationIssue,
  VerificationStatus,
} from './types';

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toStatus = (value: unknown): VerificationStatus => {
  if (value === '[正确]' || value === '正确') return 'correct';
  if (value === '[错误]' || value === '错误') return 'incorrect';
  if (value === '[未涉及]' || value === '未涉及') return 'not_applicable';
  return null;
};

const toPage = (value: unknown): number | null => {
  const numberValue = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
};

const clone = <T>(value: T): T => structuredClone(value);

function normalizeEvidence(value: unknown, taskIndex: number, evidenceIndex: number): EvidenceFragment {
  const raw = isRecord(value) ? clone(value) : {};
  return {
    id: `task-${taskIndex}-evidence-${evidenceIndex}`,
    pageNumber: toPage(raw.page_number),
    originalText: typeof raw.original_text === 'string' ? raw.original_text : '',
    evidenceRole: typeof raw.evidence_role === 'string' ? raw.evidence_role : '',
    raw,
  };
}

function normalizeTask(rawValue: unknown, index: number): AnnotationTask | ValidationIssue {
  if (!isRecord(rawValue)) {
    return { severity: 'error', code: 'task.type', path: `$.output[${index}]`, message: `第 ${index + 1} 条任务必须是对象。`, taskIndex: index };
  }
  if (typeof rawValue.review_point !== 'string' || rawValue.review_point.trim() === '') {
    return { severity: 'error', code: 'task.review_point', path: `$.output[${index}].review_point`, message: `第 ${index + 1} 条任务缺少非空 review_point。`, taskIndex: index };
  }
  const evidence = rawValue.evidence_fragments;
  const evidenceFragments = Array.isArray(evidence)
    ? evidence.map((item, evidenceIndex) => normalizeEvidence(item, index, evidenceIndex))
    : [];
  const pageNumbers = [...new Set(evidenceFragments.flatMap((item) => item.pageNumber ?? []))].sort((a, b) => a - b);
  return {
    index,
    label: typeof rawValue.label === 'string' ? rawValue.label : null,
    reviewPoint: rawValue.review_point,
    verificationStatus: toStatus(rawValue.verification_status),
    evidenceFragments,
    judgmentBasis: typeof rawValue.judgment_basis === 'string' ? rawValue.judgment_basis : '',
    pageNumbers,
    raw: clone(rawValue),
  };
}

export function parseAnnotationJson(text: string, sourceName: string, fingerprint: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : '未知解析错误';
    return { ok: false, errors: [{ severity: 'error', code: 'json.syntax', path: '$', message: `JSON 语法错误：${detail}` }] };
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.output)) {
    return { ok: false, errors: [{ severity: 'error', code: 'root.output', path: '$.output', message: 'JSON 顶层必须包含 output 数组。' }] };
  }
  const normalized = parsed.output.map(normalizeTask);
  const errors = normalized.filter((item): item is ValidationIssue => 'severity' in item);
  if (errors.length > 0) return { ok: false, errors };
  const tasks = normalized as AnnotationTask[];
  const warnings = tasks.flatMap((task) => {
    const raw = task.raw;
    return raw.evidence_fragments === undefined || raw.judgment_basis === undefined || raw.verification_status === undefined
      ? [{ severity: 'warning' as const, code: 'task.optional_fields', path: `$.output[${task.index}]`, message: `第 ${task.index + 1} 条任务缺少可选字段，已使用安全空值。`, taskIndex: task.index }]
      : [];
  });
  const originalTasks = clone(tasks);
  const document: AnnotationDocument = { sourceName, fingerprint, rawRoot: clone(parsed), originalTasks, tasks: clone(tasks) };
  return { ok: true, document, warnings };
}
```

- [ ] **Step 4: Run parser tests**

```powershell
npm test -- tests/domain/parseAnnotation.test.ts
```

Expected: all parser tests PASS.

- [ ] **Step 5: Commit parsing**

```powershell
git add annotation-platform/src/domain annotation-platform/tests/fixtures.ts annotation-platform/tests/domain/parseAnnotation.test.ts
git commit -m "feat: parse and normalize annotation JSON"
```

### Task 4: Validate tasks and derive sidebar status

**Files:**
- Create: `annotation-platform/src/domain/validateTask.ts`
- Test: `annotation-platform/tests/domain/validateTask.test.ts`

- [ ] **Step 1: Write failing validation tests**

Create `annotation-platform/tests/domain/validateTask.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deriveTaskListStatus, validateTask } from '../../src/domain/validateTask';
import type { AnnotationTask } from '../../src/domain/types';

const task = (overrides: Partial<AnnotationTask> = {}): AnnotationTask => ({
  index: 0,
  label: null,
  reviewPoint: '审查要点',
  verificationStatus: null,
  evidenceFragments: [],
  judgmentBasis: '',
  pageNumbers: [],
  raw: { review_point: '审查要点' },
  ...overrides,
});

describe('validateTask', () => {
  it('requires a decision', () => {
    expect(validateTask(task(), 10).map((issue) => issue.code)).toContain('task.decision_required');
  });

  it('requires evidence and basis for an incorrect decision', () => {
    const codes = validateTask(task({ verificationStatus: 'incorrect' }), 10).map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining(['task.evidence_required', 'task.basis_required']));
  });

  it('rejects an evidence page beyond the loaded PDF', () => {
    const evidence = { id: 'e1', pageNumber: 11, originalText: 'x', evidenceRole: '支持', raw: {} };
    expect(validateTask(task({ verificationStatus: 'correct', evidenceFragments: [evidence] }), 10)[0].code).toBe('evidence.page_out_of_range');
  });
});

describe('deriveTaskListStatus', () => {
  it('returns modified only when editable fields differ and validation passes', () => {
    const original = task({ verificationStatus: 'correct' });
    const current = task({ verificationStatus: 'not_applicable' });
    expect(deriveTaskListStatus(current, original, 10)).toBe('modified');
  });
});
```

- [ ] **Step 2: Verify the tests fail**

```powershell
npm test -- tests/domain/validateTask.test.ts
```

Expected: FAIL because the validation module does not exist.

- [ ] **Step 3: Implement validation and status derivation**

Create `annotation-platform/src/domain/validateTask.ts`:

```ts
import type { AnnotationTask, TaskListStatus, ValidationIssue } from './types';

export function validateTask(task: AnnotationTask, pdfPageCount: number | null): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (task.verificationStatus === null) {
    issues.push({ severity: 'error', code: 'task.decision_required', path: `tasks[${task.index}].verificationStatus`, message: '请选择专家判断。', taskIndex: task.index });
  }
  if (task.verificationStatus === 'incorrect' && task.evidenceFragments.length === 0) {
    issues.push({ severity: 'error', code: 'task.evidence_required', path: `tasks[${task.index}].evidenceFragments`, message: '判断为错误时至少需要一条证据。', taskIndex: task.index });
  }
  if (task.verificationStatus === 'incorrect' && task.judgmentBasis.trim() === '') {
    issues.push({ severity: 'error', code: 'task.basis_required', path: `tasks[${task.index}].judgmentBasis`, message: '判断为错误时必须填写判断依据。', taskIndex: task.index });
  }
  task.evidenceFragments.forEach((evidence, evidenceIndex) => {
    if (evidence.pageNumber === null || !Number.isInteger(evidence.pageNumber) || evidence.pageNumber < 1) {
      issues.push({ severity: 'error', code: 'evidence.page_invalid', path: `tasks[${task.index}].evidenceFragments[${evidenceIndex}].pageNumber`, message: '证据页码必须是正整数。', taskIndex: task.index });
    } else if (pdfPageCount !== null && evidence.pageNumber > pdfPageCount) {
      issues.push({ severity: 'error', code: 'evidence.page_out_of_range', path: `tasks[${task.index}].evidenceFragments[${evidenceIndex}].pageNumber`, message: `证据页码不能超过 PDF 总页数 ${pdfPageCount}。`, taskIndex: task.index });
    }
  });
  return issues;
}

const editableSnapshot = (task: AnnotationTask) => ({
  verificationStatus: task.verificationStatus,
  evidenceFragments: task.evidenceFragments.map(({ pageNumber, originalText, evidenceRole }) => ({ pageNumber, originalText, evidenceRole })),
  judgmentBasis: task.judgmentBasis,
});

export function deriveTaskListStatus(current: AnnotationTask, original: AnnotationTask, pdfPageCount: number | null): TaskListStatus {
  if (current.verificationStatus === null) return 'unprocessed';
  if (validateTask(current, pdfPageCount).length > 0) return 'incomplete';
  return JSON.stringify(editableSnapshot(current)) === JSON.stringify(editableSnapshot(original)) ? 'confirmed' : 'modified';
}
```

- [ ] **Step 4: Run tests and commit**

```powershell
npm test -- tests/domain/validateTask.test.ts
git add annotation-platform/src/domain/validateTask.ts annotation-platform/tests/domain/validateTask.test.ts
git commit -m "feat: validate expert annotation tasks"
```

Expected: all validation tests PASS; commit succeeds.

### Task 5: Implement immutable edits and safe JSON export

**Files:**
- Create: `annotation-platform/src/state/annotationReducer.ts`
- Create: `annotation-platform/src/domain/exportAnnotation.ts`
- Test: `annotation-platform/tests/state/annotationReducer.test.ts`
- Test: `annotation-platform/tests/domain/exportAnnotation.test.ts`

- [ ] **Step 1: Write failing reducer and export tests**

The reducer test must prove evidence CRUD does not mutate the input array. The export test must prove root, task, and evidence extension fields survive.

```ts
expect(next).not.toBe(tasks);
expect(next[0].evidenceFragments).toHaveLength(2);
expect(tasks[0].evidenceFragments).toHaveLength(1);
expect(exported.root_extension).toEqual({ keep: true });
expect(exported.output[0].upstream_task_id).toBe('task-1');
expect(exported.output[0].evidence_fragments[0].upstream_note).toBe('preserve me');
expect(exported.output[0].verification_status).toBe('[错误]');
expect(exported.output[0].page_numbers).toEqual([2]);
```

Run:

```powershell
npm test -- tests/state/annotationReducer.test.ts tests/domain/exportAnnotation.test.ts
```

Expected: FAIL because reducer and exporter do not exist.

- [ ] **Step 2: Implement immutable reducer actions**

Create `annotation-platform/src/state/annotationReducer.ts` with this public API:

```ts
import type { AnnotationTask, EvidenceFragment, VerificationStatus } from '../domain/types';

export type AnnotationAction =
  | { type: 'set-status'; taskIndex: number; status: VerificationStatus }
  | { type: 'set-basis'; taskIndex: number; value: string }
  | { type: 'add-evidence'; taskIndex: number; evidence: EvidenceFragment }
  | { type: 'update-evidence'; taskIndex: number; evidenceId: string; patch: Partial<Pick<EvidenceFragment, 'pageNumber' | 'originalText' | 'evidenceRole'>> }
  | { type: 'remove-evidence'; taskIndex: number; evidenceId: string }
  | { type: 'replace-tasks'; tasks: AnnotationTask[] };

const recalculatePages = (task: AnnotationTask): AnnotationTask => ({
  ...task,
  pageNumbers: [...new Set(task.evidenceFragments.flatMap((evidence) => evidence.pageNumber ?? []))].sort((a, b) => a - b),
});

export function annotationReducer(tasks: AnnotationTask[], action: AnnotationAction): AnnotationTask[] {
  if (action.type === 'replace-tasks') return structuredClone(action.tasks);
  return tasks.map((task, index) => {
    if (index !== action.taskIndex) return task;
    if (action.type === 'set-status') return { ...task, verificationStatus: action.status };
    if (action.type === 'set-basis') return { ...task, judgmentBasis: action.value };
    if (action.type === 'add-evidence') return recalculatePages({ ...task, evidenceFragments: [...task.evidenceFragments, action.evidence] });
    if (action.type === 'update-evidence') return recalculatePages({ ...task, evidenceFragments: task.evidenceFragments.map((item) => item.id === action.evidenceId ? { ...item, ...action.patch } : item) });
    return recalculatePages({ ...task, evidenceFragments: task.evidenceFragments.filter((item) => item.id !== action.evidenceId) });
  });
}
```

- [ ] **Step 3: Implement exporter and filename generation**

Create `annotation-platform/src/domain/exportAnnotation.ts`:

```ts
import type { AnnotationDocument, AnnotationTask, JsonRecord } from './types';

const statusOutput = {
  correct: '[正确]',
  incorrect: '[错误]',
  not_applicable: '[未涉及]',
} as const;

function taskToRaw(task: AnnotationTask): JsonRecord {
  return {
    ...structuredClone(task.raw),
    verification_status: task.verificationStatus === null ? '' : statusOutput[task.verificationStatus],
    evidence_fragments: task.evidenceFragments.map((evidence) => ({
      ...structuredClone(evidence.raw),
      page_number: evidence.pageNumber === null ? '' : String(evidence.pageNumber),
      original_text: evidence.originalText,
      evidence_role: evidence.evidenceRole,
    })),
    judgment_basis: task.judgmentBasis,
    page_numbers: [...task.pageNumbers],
  };
}

export function buildExportObject(document: AnnotationDocument): JsonRecord {
  return { ...structuredClone(document.rawRoot), output: document.tasks.map(taskToRaw) };
}

export function serializeExport(document: AnnotationDocument): string {
  const text = JSON.stringify(buildExportObject(document), null, 2);
  JSON.parse(text);
  return text;
}

export function buildExportFileName(sourceName: string, partial: boolean, date: Date): string {
  const base = sourceName.replace(/\.json$/i, '');
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `${base}_专家标注_${partial ? 'partial_' : ''}${stamp}.json`;
}
```

- [ ] **Step 4: Run tests and commit**

```powershell
npm test -- tests/state/annotationReducer.test.ts tests/domain/exportAnnotation.test.ts
git add annotation-platform/src/state annotation-platform/src/domain/exportAnnotation.ts annotation-platform/tests/state annotation-platform/tests/domain/exportAnnotation.test.ts
git commit -m "feat: edit tasks and export preserved JSON"
```

Expected: reducer and export suites PASS.

### Task 6: Fingerprint source JSON and persist isolated drafts

**Files:**
- Create: `annotation-platform/src/storage/fingerprint.ts`
- Create: `annotation-platform/src/storage/draftRepository.ts`
- Test: `annotation-platform/tests/storage/draftRepository.test.ts`

- [ ] **Step 1: Write failing fingerprint and repository tests**

Cover these exact cases:

```ts
expect(await fingerprintBytes(new TextEncoder().encode('a'))).not.toBe(
  await fingerprintBytes(new TextEncoder().encode('b')),
);
await repository.save(payloadA);
expect(await repository.load(payloadA.fingerprint)).toEqual(payloadA);
expect(await repository.load('different-fingerprint')).toBeNull();
await repository.remove(payloadA.fingerprint);
expect(await repository.load(payloadA.fingerprint)).toBeNull();
```

Run:

```powershell
npm test -- tests/storage/draftRepository.test.ts
```

Expected: FAIL because storage modules do not exist.

- [ ] **Step 2: Implement SHA-256 fingerprinting**

Create `annotation-platform/src/storage/fingerprint.ts`:

```ts
export async function fingerprintBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function readUtf8JsonFile(file: File): Promise<{ text: string; fingerprint: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return { text, fingerprint: await fingerprintBytes(bytes) };
}
```

- [ ] **Step 3: Implement the IndexedDB adapter**

Create `annotation-platform/src/storage/draftRepository.ts`:

```ts
import { openDB, type IDBPDatabase } from 'idb';
import type { DraftPayload } from '../domain/types';

const DB_NAME = 'expert-annotation-platform';
const STORE_NAME = 'drafts';

export interface DraftRepository {
  save(payload: DraftPayload): Promise<void>;
  load(fingerprint: string): Promise<DraftPayload | null>;
  remove(fingerprint: string): Promise<void>;
}

export class IndexedDbDraftRepository implements DraftRepository {
  private readonly dbPromise: Promise<IDBPDatabase>;

  constructor() {
    this.dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'fingerprint' });
      },
    });
  }

  async save(payload: DraftPayload) {
    const db = await this.dbPromise;
    await db.put(STORE_NAME, structuredClone(payload));
  }

  async load(fingerprint: string) {
    const db = await this.dbPromise;
    return (await db.get(STORE_NAME, fingerprint)) ?? null;
  }

  async remove(fingerprint: string) {
    const db = await this.dbPromise;
    await db.delete(STORE_NAME, fingerprint);
  }
}
```

- [ ] **Step 4: Run tests and commit**

```powershell
npm test -- tests/storage/draftRepository.test.ts
git add annotation-platform/src/storage annotation-platform/tests/storage
git commit -m "feat: persist fingerprinted local drafts"
```

Expected: storage tests PASS; no PDF bytes are present in `DraftPayload`.

### Task 7: Build the import screen and actionable errors

**Files:**
- Create: `annotation-platform/src/components/FileImportScreen.tsx`
- Modify: `annotation-platform/src/App.tsx`
- Test: `annotation-platform/tests/components/FileImportScreen.test.tsx`

- [ ] **Step 1: Write failing component tests**

Test that the component calls `onImport` only after both files are selected, displays JSON syntax errors in Chinese, and keeps PDF selection local.

```tsx
expect(screen.getByRole('button', { name: '进入标注工作台' })).toBeDisabled();
await user.upload(screen.getByLabelText('选择标注 JSON'), jsonFile);
await user.upload(screen.getByLabelText('选择对应 PDF'), pdfFile);
expect(screen.getByRole('button', { name: '进入标注工作台' })).toBeEnabled();
await user.click(screen.getByRole('button', { name: '进入标注工作台' }));
expect(onImport).toHaveBeenCalledWith(expect.objectContaining({ jsonFile, pdfFile }));
```

Run:

```powershell
npm test -- tests/components/FileImportScreen.test.tsx
```

Expected: FAIL because `FileImportScreen` does not exist.

- [ ] **Step 2: Implement a controlled import component**

Use this public contract:

```ts
export interface ImportSelection {
  jsonFile: File;
  pdfFile: File;
}

interface FileImportScreenProps {
  busy: boolean;
  issues: ValidationIssue[];
  onImport(selection: ImportSelection): Promise<void>;
}
```

The component must use `accept="application/json,.json"` and `accept="application/pdf,.pdf"`, display selected file names, render each issue message in an `aria-live="polite"` region, and never read PDF bytes itself.

- [ ] **Step 3: Wire import parsing in `App`**

`App` must call `readUtf8JsonFile`, `parseAnnotationJson`, and `URL.createObjectURL(pdfFile)`. Store the resulting `AnnotationDocument`, PDF object URL, and `File` metadata in component state. Revoke the object URL when replacing the PDF or unmounting.

```tsx
useEffect(() => () => {
  if (pdfUrl) URL.revokeObjectURL(pdfUrl);
}, [pdfUrl]);
```

- [ ] **Step 4: Run tests and commit**

```powershell
npm test -- tests/components/FileImportScreen.test.tsx src/App.test.tsx
git add annotation-platform/src/App.tsx annotation-platform/src/components/FileImportScreen.tsx annotation-platform/tests/components/FileImportScreen.test.tsx
git commit -m "feat: import local annotation JSON and PDF"
```

Expected: import tests PASS; existing App test is updated to assert `FileImportScreen` rather than duplicate inputs.

### Task 8: Build the three-column workspace and task navigation

**Files:**
- Create: `annotation-platform/src/components/Workspace.tsx`
- Create: `annotation-platform/src/components/TaskSidebar.tsx`
- Modify: `annotation-platform/src/styles.css`
- Test: `annotation-platform/tests/components/TaskSidebar.test.tsx`

- [ ] **Step 1: Write failing sidebar tests**

Cover task count, active selection, derived Chinese statuses, and click navigation:

```tsx
expect(screen.getByText('任务 1 / 2')).toBeInTheDocument();
expect(screen.getByText('已修改')).toBeInTheDocument();
await user.click(screen.getByRole('button', { name: /第 2 条/ }));
expect(onSelect).toHaveBeenCalledWith(1);
```

- [ ] **Step 2: Implement `TaskSidebar`**

Use this exact contract:

```ts
interface TaskSidebarProps {
  tasks: AnnotationTask[];
  originalTasks: AnnotationTask[];
  currentTaskIndex: number;
  pdfPageCount: number | null;
  onSelect(index: number): void;
}
```

Each task button must show a one-line review-point summary and one of `未处理`, `已确认`, `已修改`, `信息不完整`, computed only through `deriveTaskListStatus`.

- [ ] **Step 3: Implement `Workspace` and layout CSS**

Use semantic regions and the selected A layout:

```tsx
<div className="workspace">
  <header className="workspace__toolbar">{toolbar}</header>
  <aside className="workspace__tasks" aria-label="标注任务列表">{sidebar}</aside>
  <section className="workspace__pdf" aria-label="PDF 原文">{pdfPanel}</section>
  <section className="workspace__annotation" aria-label="专家标注表单">{annotationPanel}</section>
</div>
```

Add CSS grid columns `minmax(220px, 18%) minmax(480px, 47%) minmax(380px, 35%)`. Below 1180px, allow the task column to collapse behind a toolbar button while keeping PDF and annotation columns side by side.

- [ ] **Step 4: Run tests and commit**

```powershell
npm test -- tests/components/TaskSidebar.test.tsx
git add annotation-platform/src/components/Workspace.tsx annotation-platform/src/components/TaskSidebar.tsx annotation-platform/src/styles.css annotation-platform/tests/components/TaskSidebar.test.tsx
git commit -m "feat: add three-column expert workspace"
```

### Task 9: Build the annotation and evidence editors

**Files:**
- Create: `annotation-platform/src/components/AnnotationPanel.tsx`
- Create: `annotation-platform/src/components/EvidenceEditor.tsx`
- Test: `annotation-platform/tests/components/AnnotationPanel.test.tsx`

- [ ] **Step 1: Write failing editor tests**

Tests must prove `label` and `reviewPoint` are not inputs, all three decisions are selectable, evidence can be added/edited/removed, validation appears next to the affected field, and clicking a page invokes `onJumpToPage`.

```tsx
expect(screen.queryByLabelText('修改审查要点')).not.toBeInTheDocument();
await user.click(screen.getByRole('radio', { name: '错误' }));
expect(onAction).toHaveBeenCalledWith({ type: 'set-status', taskIndex: 0, status: 'incorrect' });
await user.click(screen.getByRole('button', { name: '跳转到第 2 页' }));
expect(onJumpToPage).toHaveBeenCalledWith(2);
```

- [ ] **Step 2: Implement `EvidenceEditor`**

Use this contract:

```ts
interface EvidenceEditorProps {
  taskIndex: number;
  evidence: EvidenceFragment[];
  issues: ValidationIssue[];
  onAction(action: AnnotationAction): void;
  onJumpToPage(page: number): void;
}
```

New evidence uses:

```ts
const newEvidence: EvidenceFragment = {
  id: crypto.randomUUID(),
  pageNumber: null,
  originalText: '',
  evidenceRole: '',
  raw: {},
};
```

Page input accepts only positive integer text, maps empty/invalid text to `null`, and displays the issue whose `path` matches the evidence index.

- [ ] **Step 3: Implement `AnnotationPanel`**

Use this contract:

```ts
interface AnnotationPanelProps {
  task: AnnotationTask;
  issues: ValidationIssue[];
  onAction(action: AnnotationAction): void;
  onJumpToPage(page: number): void;
  onSaveAndNext(): void;
}
```

Render `label` only when non-null. Render `reviewPoint` in a read-only article element. Use a radio group for status and a textarea for `judgmentBasis`. Disable “保存并下一条” only when `issues` contains an error for the current task.

- [ ] **Step 4: Run tests and commit**

```powershell
npm test -- tests/components/AnnotationPanel.test.tsx
git add annotation-platform/src/components/AnnotationPanel.tsx annotation-platform/src/components/EvidenceEditor.tsx annotation-platform/tests/components/AnnotationPanel.test.tsx
git commit -m "feat: edit expert decisions and evidence"
```

### Task 10: Isolate PDF.js and implement page navigation

**Files:**
- Create: `annotation-platform/src/pdf/pdfAdapter.ts`
- Create: `annotation-platform/src/pdf/PdfPanel.tsx`
- Test: `annotation-platform/tests/pdf/PdfPanel.test.tsx`

- [ ] **Step 1: Write failing PDF panel tests against a fake adapter**

Use a fake document with ten pages. Assert initial page 1, next/previous clamping, direct page input, zoom controls, and external `requestedPage` changes.

```tsx
expect(screen.getByText('第 1 / 10 页')).toBeInTheDocument();
await user.click(screen.getByRole('button', { name: '下一页' }));
expect(renderPage).toHaveBeenLastCalledWith(expect.any(HTMLCanvasElement), 2, 1);
rerender(<PdfPanel document={fakeDocument} requestedPage={8} />);
expect(renderPage).toHaveBeenLastCalledWith(expect.any(HTMLCanvasElement), 8, 1);
```

- [ ] **Step 2: Implement the adapter boundary**

Create `annotation-platform/src/pdf/pdfAdapter.ts`:

```ts
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfDocumentAdapter {
  pageCount: number;
  renderPage(canvas: HTMLCanvasElement, pageNumber: number, scale: number): Promise<void>;
  destroy(): Promise<void>;
}

export async function openPdfDocument(file: File): Promise<PdfDocumentAdapter> {
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const document = await loadingTask.promise;
  return {
    pageCount: document.numPages,
    async renderPage(canvas, pageNumber, scale) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const context = canvas.getContext('2d');
      if (!context) throw new Error('无法创建 PDF 画布。');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: context, viewport }).promise;
    },
    async destroy() { await document.destroy(); },
  };
}
```

- [ ] **Step 3: Implement `PdfPanel`**

The component owns current page and scale, clamps requested pages to `1..pageCount`, renders into a canvas in an effect, reports render errors in an `aria-live` region, and exposes buttons named `上一页`, `下一页`, `缩小`, `放大`, `适应宽度`.

Use `AbortController` or an effect cancellation boolean so a late render from the previous page cannot overwrite the current page state.

- [ ] **Step 4: Run tests and commit**

```powershell
npm test -- tests/pdf/PdfPanel.test.tsx
git add annotation-platform/src/pdf annotation-platform/tests/pdf
git commit -m "feat: render and navigate local PDFs"
```

Expected: PDF component tests PASS without opening the business PDF.

### Task 11: Orchestrate autosave, draft restore, export, and leave protection

**Files:**
- Create: `annotation-platform/src/state/useAnnotationSession.ts`
- Create: `annotation-platform/src/components/ExportActions.tsx`
- Modify: `annotation-platform/src/App.tsx`
- Modify: `annotation-platform/src/components/Workspace.tsx`
- Test: `annotation-platform/src/App.test.tsx`

- [ ] **Step 1: Write failing integration tests**

Use an in-memory `DraftRepository` fake. Test:

- importing a fingerprint with a saved draft prompts `恢复本地草稿`;
- accepting restores tasks and current task index;
- edits schedule `repository.save`;
- partial export succeeds with incomplete tasks and includes `_partial_`;
- complete export is disabled until every task validates;
- `beforeunload` is registered only while work differs from the last exported snapshot.

- [ ] **Step 2: Implement `useAnnotationSession`**

Expose this stable API:

```ts
interface AnnotationSession {
  document: AnnotationDocument;
  currentTaskIndex: number;
  currentTask: AnnotationTask;
  issues: ValidationIssue[];
  allIssues: ValidationIssue[];
  draftState: 'idle' | 'saving' | 'saved' | 'error';
  dispatch(action: AnnotationAction): void;
  selectTask(index: number): void;
  saveAndNext(): void;
  restoreDraft(payload: DraftPayload): void;
}
```

Debounce autosave by 400 ms. Save `tasks`, `currentTaskIndex`, ISO `savedAt`, source name, and fingerprint. Never save PDF file, URL, bytes, canvas, or extracted text.

- [ ] **Step 3: Implement browser download actions**

Create `annotation-platform/src/components/ExportActions.tsx` around this helper:

```ts
export function downloadJson(text: string, fileName: string) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
```

Before download, call `serializeExport` and immediately call `JSON.parse` on its result. Full export requires `allIssues` to contain no errors; partial export is always available after a valid import.

- [ ] **Step 4: Wire the complete application**

`App` routes between import screen and workspace. It opens the PDF through `openPdfDocument`, passes `requestedPage` from evidence clicks, destroys the adapter when replacing the PDF, and keeps JSON functionality available if PDF opening fails.

Register `beforeunload` only when there are edits not represented by the last successful export:

```ts
useEffect(() => {
  if (!hasUnexportedChanges) return;
  const handler = (event: BeforeUnloadEvent) => event.preventDefault();
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}, [hasUnexportedChanges]);
```

- [ ] **Step 5: Run integration tests and commit**

```powershell
npm test -- src/App.test.tsx
git add annotation-platform/src/App.tsx annotation-platform/src/state/useAnnotationSession.ts annotation-platform/src/components/ExportActions.tsx annotation-platform/src/components/Workspace.tsx
git commit -m "feat: autosave and export expert annotations"
```

### Task 12: Add end-to-end coverage, documentation, and final verification

**Files:**
- Create: `annotation-platform/playwright.config.ts`
- Create: `annotation-platform/e2e/annotation-flow.spec.ts`
- Create: `annotation-platform/README.md`
- Modify: `annotation-platform/src/styles.css`
- Modify: `.gitignore`

- [ ] **Step 1: Configure Playwright**

Create `annotation-platform/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1',
    port: 4173,
    reuseExistingServer: false,
  },
});
```

- [ ] **Step 2: Write the failing end-to-end workflow**

Create `annotation-platform/e2e/annotation-flow.spec.ts`. Generate a two-page blank PDF using `pdf-lib`, upload a synthetic JSON buffer and the PDF buffer, select the first task, choose “错误”, add evidence on page 2, enter evidence text/role/basis, verify the PDF page indicator changes to 2, and capture the downloaded JSON.

The final assertions must parse the download and verify:

```ts
expect(result.output[0].review_point).toBe('核对测试审查要点。');
expect(result.output[0].verification_status).toBe('[错误]');
expect(result.output[0].evidence_fragments[0]).toMatchObject({
  page_number: '2',
  original_text: '人工测试证据',
  evidence_role: '直接冲突',
});
expect(result.output[0].page_numbers).toEqual([2]);
expect(result.root_extension).toEqual({ keep: true });
```

Run:

```powershell
npm run test:e2e
```

Expected before final wiring fixes: FAIL at the first missing or incorrectly labelled user interaction.

- [ ] **Step 3: Finish accessibility and responsive behavior**

Ensure every input has a visible label, all errors are connected through `aria-describedby`, task buttons expose their state, focus moves to the selected task heading, and the task sidebar can collapse below 1180px without hiding PDF or annotation controls.

Add focus CSS:

```css
:focus-visible { outline: 3px solid #176b4d; outline-offset: 2px; }
.field-error { color: #a3362d; font-size: .85rem; }
@media (max-width: 1180px) {
  .workspace { grid-template-columns: minmax(480px, 58%) minmax(380px, 42%); }
  .workspace__tasks[hidden] { display: none; }
}
```

- [ ] **Step 4: Write local-use documentation**

`annotation-platform/README.md` must include exact commands:

```powershell
npm install
npm run dev
npm test
npm run test:e2e
npm run build
```

It must state that files remain in the browser, PDF bytes are not stored in drafts, draft clearing is explicit, evidence page numbers are one-based physical PDF pages, and complete/partial JSON file naming follows the design specification.

- [ ] **Step 5: Run the complete verification gate**

Run from `annotation-platform/`:

```powershell
npm test
npm run test:e2e
npm run lint
npm run build
```

Expected:

- all Vitest suites PASS;
- Playwright expert workflow PASS;
- ESLint exits with no errors;
- Vite production build completes and produces `dist/`;
- no test reads `../BK20250068.pdf` or any other business PDF.

Confirm the last invariant with:

```powershell
rg -n "BK20250068|参考\.json" src tests e2e
```

Expected: no matches. A no-match `rg` exit code of 1 is success for this specific invariant.

- [ ] **Step 6: Commit the verified application**

```powershell
Set-Location ..
git add .gitignore annotation-platform docs task_plan.md findings.md progress.md
git commit -m "feat: complete local expert annotation platform"
git status --short
```

Expected: commit succeeds and `git status --short` prints no uncommitted application changes.

## Requirement-to-task coverage

| Approved requirement | Implemented by |
|---|---|
| Local JSON/PDF selection, no upload | Tasks 7, 11 |
| One task per `output` item | Tasks 2, 3 |
| Read-only label and review point | Tasks 3, 9 |
| Editable status, evidence, role, basis | Tasks 5, 9 |
| Evidence add/edit/delete and page summary | Tasks 5, 9 |
| Three-column A layout and task status | Tasks 4, 8 |
| PDF display, controls, and evidence jump | Tasks 9, 10, 11 |
| SHA-256 isolated IndexedDB drafts | Tasks 6, 11 |
| Unknown-field preservation | Tasks 3, 5 |
| Partial and full UTF-8 exports | Tasks 5, 11 |
| Chinese actionable errors | Tasks 3, 4, 7, 9, 10, 11 |
| Synthetic tests only; no business PDF read | Tasks 2, 10, 12 |
| Future server seam | Tasks 5, 6, 11 |

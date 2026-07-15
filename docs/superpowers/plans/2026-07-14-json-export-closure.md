# JSON Export Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the local-first JSON export workflow so experts can download partial or complete annotation results and the app correctly tracks unexported changes.

**Architecture:** Keep export serialization in `src/domain/exportAnnotation.ts` and the download buttons in `src/components/ExportActions.tsx`. Finish the integration in `src/App.tsx` by rendering the export actions in the workspace toolbar, tracking the latest successful export snapshot, and registering `beforeunload` only when the current working copy differs from that snapshot.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, browser download APIs.

---

### Task 1: Prove the missing export lifecycle from the app boundary

**Files:**
- Modify: `annotation-platform/src/App.test.tsx`
- Test: `annotation-platform/src/App.test.tsx`

- [ ] **Step 1: Keep the app-level export lifecycle assertions in `src/App.test.tsx`**

```tsx
it('tracks beforeunload only for changes since the last successful partial export', async () => {
  const addEventListener = vi.spyOn(window, 'addEventListener');
  const removeEventListener = vi.spyOn(window, 'removeEventListener');
  const download = vi.fn();

  await importSyntheticDocument(twoTaskDocument(), draftRepository(null), download);

  fireEvent.click(screen.getByRole('radio', { name: '正确' }));
  await waitFor(() =>
    expect(addEventListener.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(1),
  );

  fireEvent.click(screen.getByRole('button', { name: '导出部分结果' }));
  expect(download).toHaveBeenCalledTimes(1);
  await waitFor(() =>
    expect(removeEventListener.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(1),
  );
});
```

- [ ] **Step 2: Run the focused tests and confirm they fail from the missing app wiring**

Run: `npm test -- src/App.test.tsx src/components/ExportActions.test.tsx tests/domain/exportAnnotation.test.ts`

Expected: `src/App.test.tsx` fails because `beforeunload` is never registered and the export lifecycle is not wired through the app boundary.

### Task 2: Wire export actions, export baseline tracking, and leave protection

**Files:**
- Modify: `annotation-platform/src/App.tsx`
- Modify: `annotation-platform/src/components/ExportActions.tsx`
- Test: `annotation-platform/src/App.test.tsx`

- [ ] **Step 1: Compute the original export snapshot and render `ExportActions` from `AnnotationWorkspace`**

```tsx
const initialExportText = useMemo(
  () => serializeExport(importedAnnotation.document),
  [importedAnnotation.document],
);
const [lastExportedText, setLastExportedText] = useState(initialExportText);
```

- [ ] **Step 2: Register `beforeunload` only while the current working copy differs from the latest successful export**

```tsx
useEffect(() => {
  if (!hasUnexportedChanges) return;

  const handleBeforeUnload = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = '';
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [hasUnexportedChanges]);
```

- [ ] **Step 3: Pass the injected `download` function through to `ExportActions` and update the export baseline on success**

```tsx
<ExportActions
  document={session.document}
  allIssues={session.allIssues}
  download={download}
  onExportSuccess={setLastExportedText}
/>
```

- [ ] **Step 4: Run the focused tests again**

Run: `npm test -- src/App.test.tsx src/components/ExportActions.test.tsx tests/domain/exportAnnotation.test.ts`

Expected: the app-level export tests pass, including partial export success and failed-download dirty-state retention.

### Task 3: Verify the integrated export workflow against the broader suite

**Files:**
- Modify: `annotation-platform/src/App.tsx` if broader verification exposes regressions
- Test: `annotation-platform/src/App.test.tsx`
- Test: `annotation-platform/src/components/ExportActions.test.tsx`
- Test: `annotation-platform/tests/domain/exportAnnotation.test.ts`

- [ ] **Step 1: Run the full unit test suite**

Run: `npm test`

Expected: all Vitest suites pass with zero failures.

- [ ] **Step 2: Review the diff and keep the change set limited to export closure**

```bash
git diff -- annotation-platform/src/App.tsx annotation-platform/src/App.test.tsx annotation-platform/src/components/ExportActions.tsx
```

- [ ] **Step 3: Leave commit creation for an explicit user request**

No commit unless the user asks for one.

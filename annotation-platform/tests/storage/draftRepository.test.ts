import { describe, expect, it } from 'vitest';

import type { DraftPayload } from '../../src/domain/types';
import { IndexedDbDraftRepository } from '../../src/storage/draftRepository';

let databaseSequence = 0;

const repository = () =>
  new IndexedDbDraftRepository(`draft-repository-test-${databaseSequence++}`);

const draft = (overrides: Partial<DraftPayload> = {}): DraftPayload => ({
  fingerprint: 'a'.repeat(64),
  sourceName: 'annotation.json',
  tasks: [
    {
      index: 0,
      label: 'water-supply',
      reviewPoint: 'Check the available water calculation.',
      verificationStatus: 'correct',
      evidenceFragments: [
        {
          id: 'task-0-evidence-0',
          pageNumber: 2,
          originalText: 'Synthetic evidence.',
          evidenceRole: 'supports',
          raw: { upstreamEvidenceField: { preserved: true } },
        },
      ],
      judgmentBasis: 'The calculation is present.',
      pageNumbers: [2],
      raw: { upstreamTaskField: ['preserved'] },
    },
  ],
  currentTaskIndex: 0,
  savedAt: '2026-07-14T10:00:00.000Z',
  ...overrides,
});

describe('IndexedDbDraftRepository', () => {
  it('saves and loads the exact DraftPayload by fingerprint', async () => {
    const drafts = repository();
    const payload = draft();

    await drafts.save(payload);

    await expect(drafts.load(payload.fingerprint)).resolves.toEqual(payload);
  });

  it('returns null when the requested fingerprint has no draft', async () => {
    const drafts = repository();
    await drafts.save(draft());

    await expect(drafts.load('b'.repeat(64))).resolves.toBeNull();
  });

  it('replaces the previous payload saved under the same fingerprint', async () => {
    const drafts = repository();
    const first = draft();
    const replacement = draft({
      sourceName: 'renamed.json',
      currentTaskIndex: 1,
      savedAt: '2026-07-14T11:00:00.000Z',
    });

    await drafts.save(first);
    await drafts.save(replacement);

    await expect(drafts.load(first.fingerprint)).resolves.toEqual(replacement);
  });

  it('does not retain mutable aliases to saved or loaded values', async () => {
    const drafts = repository();
    const payload = draft();
    await drafts.save(payload);

    payload.tasks[0].reviewPoint = 'Changed by the caller after save.';
    payload.tasks[0].raw.upstreamTaskField = ['changed'];

    const loaded = await drafts.load(payload.fingerprint);
    expect(loaded?.tasks[0].reviewPoint).toBe('Check the available water calculation.');
    expect(loaded?.tasks[0].raw.upstreamTaskField).toEqual(['preserved']);

    if (!loaded) {
      throw new Error('Expected the saved draft to be present.');
    }
    loaded.tasks[0].evidenceFragments[0].raw.upstreamEvidenceField = { preserved: false };

    const loadedAgain = await drafts.load(payload.fingerprint);
    expect(loadedAgain?.tasks[0].evidenceFragments[0].raw.upstreamEvidenceField).toEqual({
      preserved: true,
    });
  });

  it('removes only the draft with the target fingerprint', async () => {
    const drafts = repository();
    const target = draft();
    const retained = draft({
      fingerprint: 'b'.repeat(64),
      sourceName: 'retained.json',
    });
    await drafts.save(target);
    await drafts.save(retained);

    await drafts.remove(target.fingerprint);

    await expect(drafts.load(target.fingerprint)).resolves.toBeNull();
    await expect(drafts.load(retained.fingerprint)).resolves.toEqual(retained);
  });
});

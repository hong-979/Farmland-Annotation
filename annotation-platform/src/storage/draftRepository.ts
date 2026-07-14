import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

import type { DraftPayload } from '../domain/types';

const DEFAULT_DATABASE_NAME = 'expert-annotation-platform';
const DATABASE_VERSION = 1;
const DRAFT_STORE_NAME = 'drafts';

interface DraftDatabase extends DBSchema {
  drafts: {
    key: string;
    value: DraftPayload;
  };
}

export interface DraftRepository {
  save(payload: DraftPayload): Promise<void>;
  load(fingerprint: string): Promise<DraftPayload | null>;
  remove(fingerprint: string): Promise<void>;
}

export class IndexedDbDraftRepository implements DraftRepository {
  private readonly database: Promise<IDBPDatabase<DraftDatabase>>;

  constructor(databaseName = DEFAULT_DATABASE_NAME) {
    this.database = openDB<DraftDatabase>(databaseName, DATABASE_VERSION, {
      upgrade(database) {
        database.createObjectStore(DRAFT_STORE_NAME, { keyPath: 'fingerprint' });
      },
    });
  }

  async save(payload: DraftPayload): Promise<void> {
    const database = await this.database;
    await database.put(DRAFT_STORE_NAME, payload);
  }

  async load(fingerprint: string): Promise<DraftPayload | null> {
    const database = await this.database;
    return (await database.get(DRAFT_STORE_NAME, fingerprint)) ?? null;
  }

  async remove(fingerprint: string): Promise<void> {
    const database = await this.database;
    await database.delete(DRAFT_STORE_NAME, fingerprint);
  }
}

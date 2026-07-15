import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { initializeSchema } from './schema.js';

export type DatabaseProvider = {
  getDatabase(): DatabaseSync;
};

const DEFAULT_DATABASE_PATH = join(process.cwd(), '.data', 'annotation.sqlite');

export function resolveDatabasePath(environment: NodeJS.ProcessEnv = process.env) {
  return resolve(environment.ANNOTATION_DB_PATH ?? DEFAULT_DATABASE_PATH);
}

export function createDatabaseProvider(
  environment: NodeJS.ProcessEnv = process.env,
): DatabaseProvider {
  let database: DatabaseSync | undefined;

  return {
    getDatabase() {
      if (!database) {
        const databasePath = resolveDatabasePath(environment);
        mkdirSync(dirname(databasePath), { recursive: true });
        database = new DatabaseSync(databasePath);
        initializeSchema(database);
      }

      return database;
    },
  };
}

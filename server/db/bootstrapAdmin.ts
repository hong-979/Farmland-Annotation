import type { DatabaseSync } from 'node:sqlite';

import { hashPassword } from '../auth/passwords.js';

const ADMIN_ROLE = 'admin';
const ACTIVE_STATUS = 'active';

export function ensureBootstrapAdmin(
  database: DatabaseSync,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const existingAdmin = database
    .prepare(`SELECT id FROM users WHERE role = ? LIMIT 1`)
    .get(ADMIN_ROLE) as { id: number } | undefined;

  if (existingAdmin) {
    return;
  }

  const username = normalizeUsername(
    environment.BOOTSTRAP_ADMIN_USERNAME ?? environment.ANNOTATION_ADMIN_USERNAME,
  );
  const password =
    environment.BOOTSTRAP_ADMIN_PASSWORD ?? environment.ANNOTATION_ADMIN_PASSWORD;
  const displayName = normalizeDisplayName(
    environment.BOOTSTRAP_ADMIN_DISPLAY_NAME ??
      environment.ANNOTATION_ADMIN_DISPLAY_NAME,
    username,
  );

  if (!username || !password || !displayName) {
    return;
  }

  const existingUserWithUsername = database
    .prepare(`SELECT id, role FROM users WHERE username = ? LIMIT 1`)
    .get(username) as { id: number; role: string } | undefined;

  if (existingUserWithUsername) {
    if (existingUserWithUsername.role !== ADMIN_ROLE) {
      throw new Error(
        `Bootstrap admin username "${username}" is already used by a non-admin account.`,
      );
    }

    return;
  }

  const passwordHash = hashPassword(password);

  database
    .prepare(
      `
        INSERT INTO users (
          username,
          password_hash,
          role,
          display_name,
          status
        ) VALUES (?, ?, ?, ?, ?)
      `,
    )
    .run(username, passwordHash, ADMIN_ROLE, displayName, ACTIVE_STATUS);
}

function normalizeUsername(value: string | undefined) {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  return normalized;
}

function normalizeDisplayName(value: string | undefined, fallback: string | null) {
  const normalized = value?.trim();

  if (normalized) {
    return normalized;
  }

  return fallback;
}

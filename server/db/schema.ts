import type { DatabaseSync } from 'node:sqlite';

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'annotator')),
    display_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    json_file_path TEXT NOT NULL,
    pdf_file_path TEXT NOT NULL,
    source_json_name TEXT NOT NULL,
    source_pdf_name TEXT NOT NULL,
    task_count INTEGER NOT NULL,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    task_index INTEGER NOT NULL,
    label TEXT,
    review_point TEXT NOT NULL,
    original_payload_json TEXT NOT NULL,
    current_payload_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'claimed', 'submitted')),
    claimed_by INTEGER,
    claimed_at TEXT,
    submitted_by INTEGER,
    submitted_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (claimed_by) REFERENCES users(id),
    FOREIGN KEY (submitted_by) REFERENCES users(id),
    UNIQUE (document_id, task_index)
  );

  CREATE TABLE IF NOT EXISTS task_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    actor_user_id INTEGER NOT NULL,
    action_type TEXT NOT NULL CHECK (action_type IN ('claim', 'reclaim', 'submit')),
    snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
  CREATE INDEX IF NOT EXISTS idx_documents_created_by ON documents(created_by);
  CREATE INDEX IF NOT EXISTS idx_tasks_document_id ON tasks(document_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_claimed_by ON tasks(claimed_by);
  CREATE INDEX IF NOT EXISTS idx_task_history_task_id ON task_history(task_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
`;

export function initializeSchema(database: DatabaseSync) {
  database.exec(SCHEMA_SQL);
}

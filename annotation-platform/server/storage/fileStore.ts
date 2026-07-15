import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import { resolveDatabasePath } from '../db/database.js';

type UploadKind = 'json' | 'pdf';

type SaveUploadInput = {
  environment?: NodeJS.ProcessEnv;
  kind: UploadKind;
  originalName: string;
  bytes: Buffer;
};

const DEFAULT_EXTENSION: Record<UploadKind, string> = {
  json: '.json',
  pdf: '.pdf',
};

export function resolveDataRoot(environment: NodeJS.ProcessEnv = process.env) {
  return dirname(resolveDatabasePath(environment));
}

export function resolveStoredPath(
  relativePath: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  return resolve(resolveDataRoot(environment), relativePath);
}

export function saveUpload({
  environment = process.env,
  kind,
  originalName,
  bytes,
}: SaveUploadInput) {
  const extension = extname(originalName) || DEFAULT_EXTENSION[kind];
  const relativePath = join('uploads', kind, `${randomUUID()}${extension}`);
  const absolutePath = resolveStoredPath(relativePath, environment);

  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, bytes);

  return {
    relativePath,
    absolutePath,
  };
}

export function readStoredText(
  relativePath: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  return readFileSync(resolveStoredPath(relativePath, environment), 'utf8');
}

export function readStoredBuffer(
  relativePath: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  return readFileSync(resolveStoredPath(relativePath, environment));
}

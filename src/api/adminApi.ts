import { requestJson } from './http';

export type UserStatus = 'active' | 'disabled';
export type TaskStatus = 'pending' | 'claimed' | 'submitted';

export interface AdminUser {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'annotator';
  status: UserStatus;
  createdAt: string;
}

export interface AdminDocumentSummary {
  id: number;
  title: string;
  taskCount: number;
  pendingCount: number;
  claimedCount: number;
  submittedCount: number;
  createdAt: string;
}

export interface AdminTaskSummary {
  id: number;
  taskIndex: number;
  label: string | null;
  reviewPoint: string;
  status: TaskStatus;
  claimedBy: number | null;
  claimedAt: string | null;
  submittedBy: number | null;
  submittedAt: string | null;
  updatedAt: string;
}

export interface TaskHistoryEntry {
  id: number;
  actorUserId: number;
  actionType: 'claim' | 'reclaim' | 'submit' | string;
  snapshotJson: string;
  createdAt: string;
}

export interface ExportedDocumentPayload {
  output: unknown[];
  [key: string]: unknown;
}

export async function listAdminUsers() {
  const response = await requestJson<{ users: AdminUser[] }>('/api/admin/users');
  return response.users;
}

export async function createAnnotator(input: {
  username: string;
  password: string;
  displayName: string;
}) {
  const response = await requestJson<{ user: AdminUser }>('/api/admin/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return response.user;
}

export async function updateAnnotatorStatus(id: number, status: UserStatus) {
  const response = await requestJson<{ user: AdminUser }>(`/api/admin/users/${id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  });

  return response.user;
}

export async function listDocuments() {
  const response = await requestJson<{ documents: AdminDocumentSummary[] }>('/api/admin/documents');
  return response.documents;
}

export async function uploadDocumentPackage(input: {
  title: string;
  jsonFile: File;
  pdfFile: File;
}) {
  const formData = new FormData();
  formData.set('title', input.title);
  formData.set('jsonFile', input.jsonFile);
  formData.set('pdfFile', input.pdfFile);

  const response = await requestJson<{
    document: {
      id: number;
      title: string;
      taskCount: number;
      sourceJsonName: string;
      sourcePdfName: string;
    };
  }>('/api/admin/documents', {
    method: 'POST',
    body: formData,
  });

  return response.document;
}

export async function listDocumentTasks(documentId: number) {
  const response = await requestJson<{ tasks: AdminTaskSummary[] }>(
    `/api/admin/documents/${documentId}/tasks`,
  );
  return response.tasks;
}

export async function listTaskHistory(taskId: number) {
  const response = await requestJson<{ history: TaskHistoryEntry[] }>(
    `/api/admin/tasks/${taskId}/history`,
  );
  return response.history;
}

export async function reclaimTask(taskId: number) {
  const response = await requestJson<{ task: { id: number; status: TaskStatus; claimedBy: number | null } }>(
    `/api/admin/tasks/${taskId}/reclaim`,
    {
      method: 'POST',
    },
  );

  return response.task;
}

export async function exportDocumentPayload(documentId: number, mode: 'partial' | 'final') {
  return requestJson<ExportedDocumentPayload>(`/api/admin/documents/${documentId}/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mode }),
  });
}

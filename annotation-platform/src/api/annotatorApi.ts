import { requestJson } from './http';

export interface AnnotatorTaskRecord {
  id: number;
  documentId: number;
  taskIndex: number;
  label: string | null;
  reviewPoint: string;
  status: 'pending' | 'claimed' | 'submitted';
  claimedBy: number | null;
  payload: Record<string, unknown>;
}

export interface AnnotatorDocumentSession {
  document: {
    id: number;
    title: string;
    taskCount: number;
  };
  tasks: AnnotatorTaskRecord[];
}

export async function getCurrentAnnotatorSession() {
  const response = await requestJson<{ session: AnnotatorDocumentSession | null }>(
    '/api/annotator/tasks/current',
  );
  return response.session;
}

export async function claimNextAnnotatorDocument() {
  const response = await requestJson<{ session: AnnotatorDocumentSession }>(
    '/api/annotator/tasks/claim-next',
    {
      method: 'POST',
    },
  );
  return response.session;
}

export async function saveAnnotatorDraft(taskId: number, payload: Record<string, unknown>) {
  await requestJson<{ ok: true }>(`/api/annotator/tasks/${taskId}/draft`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ payload }),
  });
}

export async function submitAnnotatorTask(taskId: number, payload: Record<string, unknown>) {
  const response = await requestJson<{ task: { id: number; status: 'submitted' } }>(
    `/api/annotator/tasks/${taskId}/submit`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ payload }),
    },
  );

  return response.task;
}

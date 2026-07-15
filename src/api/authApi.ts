import { requestJson } from './http';

export type SessionRole = 'admin' | 'annotator';

export interface SessionUser {
  username: string;
  displayName: string;
  role: SessionRole;
}

export async function getCurrentUser() {
  const response = await requestJson<{ user: SessionUser }>('/api/auth/me');
  return response.user;
}

export async function login(credentials: { username: string; password: string }) {
  const response = await requestJson<{ user: SessionUser }>('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(credentials),
  });

  return response.user;
}

export async function logout() {
  await requestJson<null>('/api/auth/logout', {
    method: 'POST',
  });
}

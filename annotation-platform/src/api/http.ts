export class HttpError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.payload = payload;
  }
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(input, {
    credentials: 'include',
    ...init,
  });
  const text = await response.text();
  const payload = parsePayload(text);

  if (!response.ok) {
    throw new HttpError(response.status, readErrorMessage(payload, response.status), payload);
  }

  return payload as T;
}

function parsePayload(text: string) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readErrorMessage(payload: unknown, status: number) {
  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    const message = (payload as { error?: unknown }).error;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }

  return status >= 500 ? '服务暂时不可用，请稍后重试。' : '请求失败，请稍后重试。';
}

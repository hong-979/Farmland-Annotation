import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';

const { openPdfDocumentMock } = vi.hoisted(() => ({
  openPdfDocumentMock: vi.fn(),
}));

vi.mock('./pdf/pdfAdapter', () => ({
  openPdfDocument: openPdfDocumentMock,
}));

type MockJsonHandler = (request: {
  url: string;
  method: string;
  body: BodyInit | null | undefined;
}) => {
  status: number;
  body?: unknown;
  rawBody?: BodyInit | null;
  headers?: Record<string, string>;
};

function installFetchMock(handler: MockJsonHandler) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const result = handler({
      url,
      method,
      body: init?.body,
    });

    const responseBody = Object.prototype.hasOwnProperty.call(result, 'rawBody')
      ? result.rawBody ?? null
      : result.body === undefined
        ? null
        : JSON.stringify(result.body);
    const headers = result.headers ?? (
      Object.prototype.hasOwnProperty.call(result, 'rawBody')
        ? {}
        : { 'Content-Type': 'application/json' }
    );

    return new Response(responseBody, {
      status: result.status,
      headers,
    });
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function createAdminHandler() {
  const documents = [
    {
      id: 11,
      title: '示范项目一',
      taskCount: 3,
      pendingCount: 1,
      claimedCount: 1,
      submittedCount: 1,
      createdAt: '2026-07-15T10:00:00.000Z',
    },
  ];
  const users = [
    {
      id: 2,
      username: 'annotator-a',
      displayName: '标注员甲',
      role: 'annotator',
      status: 'active',
      createdAt: '2026-07-15T10:00:00.000Z',
    },
  ];
  const taskMap = new Map<number, Array<Record<string, unknown>>>([
    [11, [
      {
        id: 501,
        taskIndex: 0,
        label: '基础信息',
        reviewPoint: '核对建设规模是否完整',
        status: 'claimed',
        claimedBy: 2,
        claimedAt: '2026-07-15T11:00:00.000Z',
        submittedBy: null,
        submittedAt: null,
        updatedAt: '2026-07-15T11:10:00.000Z',
      },
    ]],
  ]);
  const historyMap = new Map<number, Array<Record<string, unknown>>>([
    [501, [
      {
        id: 9001,
        actorUserId: 2,
        actionType: 'claim',
        snapshotJson: '{"review_point":"核对建设规模是否完整"}',
        createdAt: '2026-07-15T11:00:00.000Z',
      },
    ]],
  ]);

  return installFetchMock(({ url, method, body }) => {
    if (url.endsWith('/api/auth/me') && method === 'GET') {
      return {
        status: 200,
        body: {
          user: {
            username: 'admin',
            displayName: '管理员',
            role: 'admin',
          },
        },
      };
    }

    if (url.endsWith('/api/admin/users') && method === 'GET') {
      return { status: 200, body: { users } };
    }

    if (url.endsWith('/api/admin/documents') && method === 'GET') {
      return { status: 200, body: { documents } };
    }

    if (url.endsWith('/api/admin/documents') && method === 'POST') {
      expect(body).toBeInstanceOf(FormData);
      const formData = body as FormData;
      expect(formData.get('title')).toBe('新上传文档');
      documents.unshift({
        id: 12,
        title: '新上传文档',
        taskCount: 2,
        pendingCount: 2,
        claimedCount: 0,
        submittedCount: 0,
        createdAt: '2026-07-15T12:00:00.000Z',
      });
      taskMap.set(12, []);
      return {
        status: 201,
        body: {
          document: {
            id: 12,
            title: '新上传文档',
            taskCount: 2,
            sourceJsonName: 'new.json',
            sourcePdfName: 'new.pdf',
          },
        },
      };
    }

    if (url.endsWith('/api/admin/documents/11/tasks') && method === 'GET') {
      return { status: 200, body: { tasks: taskMap.get(11) } };
    }

    if (url.endsWith('/api/admin/tasks/501/history') && method === 'GET') {
      return { status: 200, body: { history: historyMap.get(501) } };
    }

    throw new Error(`Unhandled request: ${method} ${url}`);
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.restoreAllMocks();
  openPdfDocumentMock.mockReset();
  openPdfDocumentMock.mockResolvedValue({
    pageCount: 6,
    renderPage: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
    destroy: vi.fn().mockResolvedValue(undefined),
  });
});

describe('App', () => {
  it('shows the login screen when the current session is missing and opens the admin dashboard after login', async () => {
    const fetchMock = installFetchMock(({ url, method, body }) => {
      if (url.endsWith('/api/auth/me') && method === 'GET') {
        return { status: 401, body: { error: '未登录' } };
      }

      if (url.endsWith('/api/auth/login') && method === 'POST') {
        expect(body).toBe(JSON.stringify({ username: 'admin', password: 'secret-123' }));
        return {
          status: 200,
          body: {
            user: {
              username: 'admin',
              displayName: '管理员',
              role: 'admin',
            },
          },
        };
      }

      if (url.endsWith('/api/admin/users') && method === 'GET') {
        return { status: 200, body: { users: [] } };
      }

      if (url.endsWith('/api/admin/documents') && method === 'GET') {
        return {
          status: 200,
          body: {
            documents: [
              {
                id: 11,
                title: '示范项目一',
                taskCount: 3,
                pendingCount: 1,
                claimedCount: 1,
                submittedCount: 1,
                createdAt: '2026-07-15T10:00:00.000Z',
              },
            ],
          },
        };
      }

      throw new Error(`Unhandled request: ${method} ${url}`);
    });
    const user = userEvent.setup();

    const { container } = render(<App />);

    expect(await screen.findByRole('heading', { name: '登录标注服务' })).toBeInTheDocument();
    const usernameInput = container.querySelector('input[name="username"]');
    const passwordInput = container.querySelector('input[name="password"]');
    expect(usernameInput).toBeInstanceOf(HTMLInputElement);
    expect(passwordInput).toBeInstanceOf(HTMLInputElement);
    await user.type(usernameInput as HTMLInputElement, 'admin');
    await user.type(passwordInput as HTMLInputElement, 'secret-123');
    await user.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByRole('heading', { name: '管理员控制台' })).toBeInTheDocument();
    expect(screen.getByText('示范项目一')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('lets the admin inspect document tasks and history from the dashboard', async () => {
    createAdminHandler();
    const user = userEvent.setup();

    render(<App />);

    expect(await screen.findByRole('heading', { name: '管理员控制台' })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: '查看任务' }));
    expect(await screen.findByText('核对建设规模是否完整')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '查看记录' }));
    expect(await screen.findByText('领取')).toBeInTheDocument();
    expect(screen.getByText('标注员 #2')).toBeInTheDocument();
  });

  it('lets the admin upload a single document package and refreshes the document list', async () => {
    createAdminHandler();
    const user = userEvent.setup();

    const { container } = render(<App />);

    expect(await screen.findByRole('heading', { name: '管理员控制台' })).toBeInTheDocument();
    const textInputs = container.querySelectorAll('input:not([type]), input[type="text"]');
    const fileInputs = container.querySelectorAll('input[type="file"]');
    expect(textInputs.length).toBeGreaterThan(0);
    expect(fileInputs.length).toBeGreaterThanOrEqual(2);

    await user.type(textInputs[textInputs.length - 1] as HTMLInputElement, '新上传文档');
    await user.upload(
      fileInputs[0] as HTMLInputElement,
      new File(['{"output":[]}'], 'new.json', { type: 'application/json' }),
    );
    await user.upload(
      fileInputs[1] as HTMLInputElement,
      new File(['pdf'], 'new.pdf', { type: 'application/pdf' }),
    );
    await user.click(screen.getByRole('button', { name: '上传文档' }));

    await waitFor(() => {
      expect(screen.getByText('新上传文档')).toBeInTheDocument();
    });
  });

  it('lets an annotator claim the next document, edit multiple tasks, and submit the whole file', async () => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:remote-pdf'),
      revokeObjectURL: vi.fn(),
    });

    const saveDraftBodies: string[] = [];
    const submitBodies: string[] = [];
    installFetchMock(({ url, method, body }) => {
      if (url.endsWith('/api/auth/me') && method === 'GET') {
        return {
          status: 200,
          body: {
            user: {
              username: 'annotator-a',
              displayName: '标注员甲',
              role: 'annotator',
            },
          },
        };
      }

      if (url.endsWith('/api/annotator/tasks/current') && method === 'GET') {
        return { status: 200, body: { session: null } };
      }

      if (url.endsWith('/api/annotator/tasks/claim-next') && method === 'POST') {
        return {
          status: 200,
          body: {
            session: {
              document: {
                id: 11,
                title: '示范项目一',
                taskCount: 2,
              },
              tasks: [
                {
                  id: 501,
                  documentId: 11,
                  taskIndex: 0,
                  label: '基础信息',
                  reviewPoint: '核对建设规模是否完整',
                  status: 'claimed',
                  claimedBy: 2,
                  payload: {
                    label: '基础信息',
                    review_point: '核对建设规模是否完整',
                    verification_status: '',
                    evidence_fragments: [],
                    judgment_basis: '',
                  },
                },
                {
                  id: 502,
                  documentId: 11,
                  taskIndex: 1,
                  label: '施工要点',
                  reviewPoint: '核对施工配置是否合理',
                  status: 'claimed',
                  claimedBy: 2,
                  payload: {
                    label: '施工要点',
                    review_point: '核对施工配置是否合理',
                    verification_status: '',
                    evidence_fragments: [],
                    judgment_basis: '',
                  },
                },
              ],
            },
          },
        };
      }

      if (url.endsWith('/api/documents/11/pdf') && method === 'GET') {
        return {
          status: 200,
          rawBody: new Uint8Array([37, 80, 68, 70]),
          headers: { 'Content-Type': 'application/pdf' },
        };
      }

      if (url.endsWith('/api/annotator/tasks/501/draft') && method === 'PUT') {
        saveDraftBodies.push(String(body));
        return { status: 200, body: { ok: true } };
      }

      if (url.endsWith('/api/annotator/tasks/502/draft') && method === 'PUT') {
        saveDraftBodies.push(String(body));
        return { status: 200, body: { ok: true } };
      }

      if (url.endsWith('/api/annotator/tasks/501/submit') && method === 'POST') {
        submitBodies.push(String(body));
        return { status: 200, body: { task: { id: 501, status: 'submitted' } } };
      }

      if (url.endsWith('/api/annotator/tasks/502/submit') && method === 'POST') {
        submitBodies.push(String(body));
        return { status: 200, body: { task: { id: 502, status: 'submitted' } } };
      }

      throw new Error(`Unhandled request: ${method} ${url}`);
    });
    const user = userEvent.setup();

    render(<App />);

    expect(await screen.findByText('当前没有已领取的文件。')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '领取下一份文件' }));

    expect(await screen.findByRole('radio', { name: '正确' })).toBeInTheDocument();
    expect(screen.getAllByText('核对建设规模是否完整').length).toBeGreaterThan(0);
    expect(screen.getAllByText('核对施工配置是否合理').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('radio', { name: '正确' }));
    await user.type(screen.getByLabelText('判断依据'), '与原文一致');
    await user.click(screen.getByRole('button', { name: /核对施工配置是否合理/ }));
    await user.click(screen.getByRole('radio', { name: '正确' }));
    await user.type(screen.getByLabelText('判断依据'), '第二条也已核对');

    await waitFor(() => {
      expect(saveDraftBodies.length).toBeGreaterThan(1);
    }, { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: '提交当前文件' }));

    await waitFor(() => {
      expect(submitBodies).toHaveLength(2);
      expect(screen.getByText('文件已提交，可以继续领取下一份。')).toBeInTheDocument();
    });
  });
});

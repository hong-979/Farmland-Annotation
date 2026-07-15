import { useEffect, useMemo, useState } from 'react';

import type { SessionUser } from '../../api/authApi';
import {
  createAnnotator,
  exportDocumentPayload,
  listAdminUsers,
  listDocumentTasks,
  listDocuments,
  listTaskHistory,
  reclaimTask,
  updateAnnotatorStatus,
  uploadDocumentPackage,
  type AdminDocumentSummary,
  type AdminTaskSummary,
  type AdminUser,
  type TaskHistoryEntry,
} from '../../api/adminApi';
import { HttpError } from '../../api/http';

interface AdminDashboardProps {
  currentUser: SessionUser;
  onLogout(): Promise<void>;
}

export function AdminDashboard({ currentUser, onLogout }: AdminDashboardProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [documents, setDocuments] = useState<AdminDocumentSummary[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [documentTasks, setDocumentTasks] = useState<AdminTaskSummary[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [taskHistory, setTaskHistory] = useState<TaskHistoryEntry[]>([]);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [annotatorForm, setAnnotatorForm] = useState({
    username: '',
    password: '',
    displayName: '',
  });
  const [uploadForm, setUploadForm] = useState<{
    title: string;
    jsonFile: File | null;
    pdfFile: File | null;
  }>({
    title: '',
    jsonFile: null,
    pdfFile: null,
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setBusyMessage('正在加载管理员数据...');
      setErrorMessage(null);

      try {
        const [nextUsers, nextDocuments] = await Promise.all([
          listAdminUsers(),
          listDocuments(),
        ]);

        if (cancelled) {
          return;
        }

        setUsers(nextUsers);
        setDocuments(nextDocuments);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(readMessage(error));
        }
      } finally {
        if (!cancelled) {
          setBusyMessage(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === selectedDocumentId) ?? null,
    [documents, selectedDocumentId],
  );

  async function refreshOverview() {
    const [nextUsers, nextDocuments] = await Promise.all([
      listAdminUsers(),
      listDocuments(),
    ]);
    setUsers(nextUsers);
    setDocuments(nextDocuments);
  }

  async function handleCreateAnnotator(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyMessage('正在创建标注员账号...');
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await createAnnotator(annotatorForm);
      await refreshOverview();
      setAnnotatorForm({ username: '', password: '', displayName: '' });
      setSuccessMessage('标注员账号已创建。');
    } catch (error) {
      setErrorMessage(readMessage(error));
    } finally {
      setBusyMessage(null);
    }
  }

  async function handleToggleUser(user: AdminUser) {
    const nextStatus = user.status === 'active' ? 'disabled' : 'active';
    setBusyMessage(`正在${nextStatus === 'active' ? '启用' : '停用'}账号...`);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await updateAnnotatorStatus(user.id, nextStatus);
      await refreshOverview();
      setSuccessMessage(`账号已${nextStatus === 'active' ? '启用' : '停用'}。`);
    } catch (error) {
      setErrorMessage(readMessage(error));
    } finally {
      setBusyMessage(null);
    }
  }

  async function handleUploadDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!uploadForm.title.trim() || uploadForm.jsonFile === null || uploadForm.pdfFile === null) {
      setErrorMessage('请完整填写标题并选择 JSON、PDF 文件。');
      return;
    }

    setBusyMessage('正在上传文档...');
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const created = await uploadDocumentPackage({
        title: uploadForm.title.trim(),
        jsonFile: uploadForm.jsonFile,
        pdfFile: uploadForm.pdfFile,
      });
      await refreshOverview();
      setUploadForm({ title: '', jsonFile: null, pdfFile: null });
      setSelectedDocumentId(created.id);
      setDocumentTasks([]);
      setTaskHistory([]);
      setSelectedTaskId(null);
      setSuccessMessage('文档上传成功，已加入待分发列表。');
    } catch (error) {
      setErrorMessage(readMessage(error));
    } finally {
      setBusyMessage(null);
    }
  }

  async function handleInspectDocument(documentId: number) {
    setBusyMessage('正在读取任务列表...');
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const tasks = await listDocumentTasks(documentId);
      setSelectedDocumentId(documentId);
      setDocumentTasks(tasks);
      setSelectedTaskId(null);
      setTaskHistory([]);
    } catch (error) {
      setErrorMessage(readMessage(error));
    } finally {
      setBusyMessage(null);
    }
  }

  async function handleInspectTask(taskId: number) {
    setBusyMessage('正在读取历史记录...');
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const history = await listTaskHistory(taskId);
      setSelectedTaskId(taskId);
      setTaskHistory(history);
    } catch (error) {
      setErrorMessage(readMessage(error));
    } finally {
      setBusyMessage(null);
    }
  }

  async function handleReclaimTask(taskId: number) {
    setBusyMessage('正在回收任务...');
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await reclaimTask(taskId);
      if (selectedDocumentId !== null) {
        setDocumentTasks(await listDocumentTasks(selectedDocumentId));
      }
      if (selectedTaskId === taskId) {
        setTaskHistory(await listTaskHistory(taskId));
      }
      await refreshOverview();
      setSuccessMessage('任务已回收为待领取状态。');
    } catch (error) {
      setErrorMessage(readMessage(error));
    } finally {
      setBusyMessage(null);
    }
  }

  async function handleExport(documentId: number, mode: 'partial' | 'final') {
    setBusyMessage(`正在导出${mode === 'partial' ? '部分' : '完整'}结果...`);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const payload = await exportDocumentPayload(documentId, mode);
      downloadJson(`${sanitizeFileName(selectedDocument?.title ?? `document-${documentId}`)}-${mode}.json`, payload);
      setSuccessMessage(`${mode === 'partial' ? '部分' : '完整'}结果已导出。`);
    } catch (error) {
      setErrorMessage(readMessage(error));
    } finally {
      setBusyMessage(null);
    }
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">管理员控制台</p>
          <h1>管理员控制台</h1>
          <p className="dashboard-header__meta">
            当前登录：{currentUser.displayName}（{currentUser.username}）
          </p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void onLogout()}>
          退出登录
        </button>
      </header>

      {busyMessage ? (
        <p className="banner banner--info" role="status">
          {busyMessage}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="banner banner--error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {successMessage ? (
        <p className="banner banner--success" role="status">
          {successMessage}
        </p>
      ) : null}

      <section className="dashboard-grid">
        <article className="panel-card">
          <div className="panel-card__header">
            <div>
              <h2>账号管理</h2>
              <p>创建标注员并控制账号状态。</p>
            </div>
          </div>
          <form className="stack-form" onSubmit={handleCreateAnnotator}>
            <label className="field">
              <span>显示名称</span>
              <input
                value={annotatorForm.displayName}
                onChange={(event) => setAnnotatorForm((current) => ({
                  ...current,
                  displayName: event.target.value,
                }))}
              />
            </label>
            <label className="field">
              <span>用户名</span>
              <input
                value={annotatorForm.username}
                onChange={(event) => setAnnotatorForm((current) => ({
                  ...current,
                  username: event.target.value,
                }))}
              />
            </label>
            <label className="field">
              <span>初始密码</span>
              <input
                type="password"
                value={annotatorForm.password}
                onChange={(event) => setAnnotatorForm((current) => ({
                  ...current,
                  password: event.target.value,
                }))}
              />
            </label>
            <button className="primary-button" type="submit">
              创建标注员
            </button>
          </form>
          <ul className="data-list">
            {users.map((user) => (
              <li className="data-list__item" key={user.id}>
                <div>
                  <strong>{user.displayName}</strong>
                  <p>{user.username}</p>
                </div>
                <div className="inline-actions">
                  <span className={`status-pill status-pill--${user.status}`}>
                    {user.status === 'active' ? '启用中' : '已停用'}
                  </span>
                  {user.role === 'annotator' ? (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => void handleToggleUser(user)}
                    >
                      {user.status === 'active' ? '停用' : '启用'}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel-card">
          <div className="panel-card__header">
            <div>
              <h2>文档上传</h2>
              <p>单条上传 JSON 和 PDF，系统会自动拆分任务。</p>
            </div>
          </div>
          <form className="stack-form" onSubmit={handleUploadDocument}>
            <label className="field">
              <span>文档标题</span>
              <input
                value={uploadForm.title}
                onChange={(event) => setUploadForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))}
              />
            </label>
            <label className="field">
              <span>JSON 文件</span>
              <input
                accept="application/json,.json"
                type="file"
                onChange={(event) => setUploadForm((current) => ({
                  ...current,
                  jsonFile: event.target.files?.[0] ?? null,
                }))}
              />
            </label>
            <label className="field">
              <span>PDF 文件</span>
              <input
                accept="application/pdf,.pdf"
                type="file"
                onChange={(event) => setUploadForm((current) => ({
                  ...current,
                  pdfFile: event.target.files?.[0] ?? null,
                }))}
              />
            </label>
            <button className="primary-button" type="submit">
              上传文档
            </button>
          </form>
        </article>

        <article className="panel-card panel-card--span-2">
          <div className="panel-card__header">
            <div>
              <h2>文档总览</h2>
              <p>查看文档进度、进入任务详情、导出当前结果。</p>
            </div>
          </div>

          <ul className="data-list">
            {documents.map((document) => (
              <li className="data-list__item data-list__item--document" key={document.id}>
                <div>
                  <strong>{document.title}</strong>
                  <p>
                    共 {document.taskCount} 条，待领取 {document.pendingCount}，进行中 {document.claimedCount}，
                    已提交 {document.submittedCount}
                  </p>
                </div>
                <div className="inline-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void handleInspectDocument(document.id)}
                  >
                    查看任务
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void handleExport(document.id, 'partial')}
                  >
                    导出部分
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void handleExport(document.id, 'final')}
                  >
                    导出完整
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {selectedDocument ? (
            <section className="detail-grid">
              <div className="detail-card">
                <h3>{selectedDocument.title} 的任务</h3>
                <ul className="data-list">
                  {documentTasks.map((task) => (
                    <li className="data-list__item" key={task.id}>
                      <div>
                        <strong>{task.reviewPoint}</strong>
                        <p>
                          任务 #{task.taskIndex + 1}
                          {task.label ? ` · ${task.label}` : ''}
                        </p>
                      </div>
                      <div className="inline-actions">
                        <span className={`status-pill status-pill--${task.status}`}>
                          {readTaskStatus(task.status)}
                        </span>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => void handleInspectTask(task.id)}
                        >
                          查看记录
                        </button>
                        {task.status === 'claimed' ? (
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => void handleReclaimTask(task.id)}
                          >
                            回收任务
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="detail-card">
                <h3>任务历史</h3>
                {selectedTaskId === null ? (
                  <p className="muted-text">点击任务上的“查看记录”即可查看操作历史。</p>
                ) : (
                  <ul className="data-list">
                    {taskHistory.map((entry) => (
                      <li className="data-list__item" key={entry.id}>
                        <div>
                          <strong>{readActionType(entry.actionType)}</strong>
                          <p>标注员 #{entry.actorUserId}</p>
                        </div>
                        <time className="data-list__time">{formatDateTime(entry.createdAt)}</time>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ) : null}
        </article>
      </section>
    </main>
  );
}

function readMessage(error: unknown) {
  if (error instanceof HttpError) {
    return error.message;
  }

  return '请求失败，请稍后重试。';
}

function readTaskStatus(status: AdminTaskSummary['status']) {
  switch (status) {
    case 'pending':
      return '待领取';
    case 'claimed':
      return '进行中';
    case 'submitted':
      return '已提交';
    default:
      return status;
  }
}

function readActionType(actionType: TaskHistoryEntry['actionType']) {
  switch (actionType) {
    case 'claim':
      return '领取';
    case 'reclaim':
      return '回收';
    case 'submit':
      return '提交';
    default:
      return actionType;
  }
}

function formatDateTime(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('zh-CN', {
    hour12: false,
  });
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '-');
}

function downloadJson(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

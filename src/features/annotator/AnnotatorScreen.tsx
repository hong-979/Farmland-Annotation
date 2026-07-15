import { useEffect, useState } from 'react';

import {
  claimNextAnnotatorDocument,
  getCurrentAnnotatorSession,
  type AnnotatorDocumentSession,
} from '../../api/annotatorApi';
import type { SessionUser } from '../../api/authApi';
import { HttpError } from '../../api/http';
import { AnnotationPanel } from '../../components/AnnotationPanel';
import { TaskSidebar } from '../../components/TaskSidebar';
import { Workspace } from '../../components/Workspace';
import { PdfPanel } from '../../pdf/PdfPanel';
import { useRemoteAnnotationSession } from './useRemoteAnnotationSession';

interface AnnotatorScreenProps {
  currentUser: SessionUser;
  onLogout(): Promise<void>;
}

export function AnnotatorScreen({ currentUser, onLogout }: AnnotatorScreenProps) {
  const [remoteSession, setRemoteSession] = useState<AnnotatorDocumentSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const currentSession = await getCurrentAnnotatorSession();
        if (!cancelled) {
          setRemoteSession(currentSession);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(readMessage(error));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleClaimNext() {
    setClaiming(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const nextSession = await claimNextAnnotatorDocument();
      setRemoteSession(nextSession);
    } catch (error) {
      setErrorMessage(readMessage(error));
    } finally {
      setClaiming(false);
    }
  }

  if (loading) {
    return (
      <main className="app-shell app-shell--centered">
        <section className="status-card" aria-live="polite">
          <p className="eyebrow">标注工作台</p>
          <h1>正在读取文件任务</h1>
          <p>系统正在检查你是否已有领取中的文件，请稍候。</p>
        </section>
      </main>
    );
  }

  if (remoteSession === null) {
    return (
      <main className="app-shell app-shell--centered">
        <section className="status-card">
          <p className="eyebrow">标注工作台</p>
          <h1>欢迎，{currentUser.displayName}</h1>
          <p>当前没有已领取的文件。</p>
          <p>点击下方按钮后，系统会按顺序为你分配下一份待处理文件。</p>
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
          <div className="inline-actions">
            <button
              className="primary-button"
              type="button"
              disabled={claiming}
              onClick={() => void handleClaimNext()}
            >
              {claiming ? '领取中...' : '领取下一份文件'}
            </button>
            <button className="secondary-button" type="button" onClick={() => void onLogout()}>
              退出登录
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <RemoteAnnotatorWorkspace
      key={remoteSession.document.id}
      currentUser={currentUser}
      remoteSession={remoteSession}
      errorMessage={errorMessage}
      successMessage={successMessage}
      onLogout={onLogout}
      onSubmitted={() => {
        setRemoteSession(null);
        setErrorMessage(null);
        setSuccessMessage('文件已提交，可以继续领取下一份。');
      }}
    />
  );
}

function RemoteAnnotatorWorkspace({
  currentUser,
  remoteSession,
  errorMessage,
  successMessage,
  onLogout,
  onSubmitted,
}: {
  currentUser: SessionUser;
  remoteSession: AnnotatorDocumentSession;
  errorMessage: string | null;
  successMessage: string | null;
  onLogout(): Promise<void>;
  onSubmitted(): void;
}) {
  const [requestedPage, setRequestedPage] = useState(1);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const remote = useRemoteAnnotationSession(remoteSession, { onSubmitted });
  const currentNumber = remote.session.currentTaskIndex + 1;
  const taskCount = remote.session.document.tasks.length;

  return (
    <Workspace
      toolbar={(
        <div className="annotator-toolbar">
          <div className="annotator-toolbar__group annotator-toolbar__group--primary">
            <span className="annotator-chip annotator-chip--strong">{currentUser.displayName}</span>
            <span className="annotator-chip">{remoteSession.document.title}</span>
            <span className="annotator-chip">条目 {currentNumber} / {taskCount}</span>
            <span className="annotator-chip">草稿：{readDraftState(remote.session.draftState)}</span>
          </div>
          <div className="annotator-toolbar__group annotator-toolbar__group--actions">
            {errorMessage ? <span className="toolbar-banner toolbar-banner--error">{errorMessage}</span> : null}
            {successMessage ? <span className="toolbar-banner toolbar-banner--success">{successMessage}</span> : null}
            {submitError ? <span className="toolbar-banner toolbar-banner--error">{submitError}</span> : null}
            <button
              className="secondary-button"
              type="button"
              disabled={remote.submitting}
              onClick={() => {
                setSubmitError(null);
                void remote.submitCurrentDocument().catch((error: unknown) => {
                  setSubmitError(readMessage(error));
                });
              }}
            >
              {remote.submitting ? '提交中...' : '提交当前文件'}
            </button>
            <button className="secondary-button" type="button" onClick={() => void onLogout()}>
              退出登录
            </button>
          </div>
        </div>
      )}
      sidebar={(
        <TaskSidebar
          tasks={remote.session.document.tasks}
          originalTasks={remote.session.document.originalTasks}
          currentTaskIndex={remote.session.currentTaskIndex}
          pdfPageCount={remote.pdfDocument?.pageCount ?? null}
          onSelect={remote.session.selectTask}
        />
      )}
      pdfPanel={remote.pdfDocument ? (
        <PdfPanel document={remote.pdfDocument} requestedPage={requestedPage} />
      ) : (
        <div className="annotator-empty-panel">
          <p>{remote.pdfError ?? '正在加载 PDF...'}</p>
        </div>
      )}
      annotationPanel={(
        <AnnotationPanel
          task={remote.session.currentTask}
          issues={remote.session.issues}
          onAction={remote.session.dispatch}
          onJumpToPage={setRequestedPage}
          onSaveAndNext={remote.session.saveAndNext}
        />
      )}
    />
  );
}

function readMessage(error: unknown) {
  if (error instanceof HttpError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return '请求失败，请稍后重试。';
}

function readDraftState(state: 'idle' | 'saving' | 'saved' | 'error') {
  switch (state) {
    case 'saving':
      return '保存中';
    case 'saved':
      return '已保存';
    case 'error':
      return '保存失败';
    default:
      return '待编辑';
  }
}

import { useEffect, useState } from 'react';

import { getCurrentUser, login, logout, type SessionUser } from './api/authApi';
import { HttpError } from './api/http';
import { AdminDashboard } from './features/admin/AdminDashboard';
import { AnnotatorScreen } from './features/annotator/AnnotatorScreen';
import { LoginScreen } from './features/auth/LoginScreen';
import './styles.css';

function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const currentUser = await getCurrentUser();
        if (!cancelled) {
          setUser(currentUser);
          setBootError(null);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (error instanceof HttpError && error.status === 401) {
          setUser(null);
          setBootError(null);
        } else {
          setUser(null);
          setBootError('初始化登录状态失败，请刷新页面后重试。');
        }
      } finally {
        if (!cancelled) {
          setBooting(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogin(credentials: { username: string; password: string }) {
    const nextUser = await login(credentials);
    setUser(nextUser);
    setBootError(null);
  }

  async function handleLogout() {
    await logout();
    setUser(null);
  }

  if (booting) {
    return (
      <main className="app-shell app-shell--centered">
        <section className="status-card" aria-live="polite">
          <p className="eyebrow">标注服务</p>
          <h1>正在连接服务</h1>
          <p>正在读取当前登录状态，请稍候。</p>
        </section>
      </main>
    );
  }

  if (user === null) {
    return <LoginScreen error={bootError} onLogin={handleLogin} />;
  }

  if (user.role === 'admin') {
    return <AdminDashboard currentUser={user} onLogout={handleLogout} />;
  }

  return <AnnotatorScreen currentUser={user} onLogout={handleLogout} />;
}

export default App;

import { useState } from 'react';

import { HttpError } from '../../api/http';

interface LoginScreenProps {
  error?: string | null;
  onLogin(credentials: { username: string; password: string }): Promise<void>;
}

export function LoginScreen({ error = null, onLogin }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(error);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    try {
      await onLogin({
        username: username.trim(),
        password,
      });
    } catch (submitProblem) {
      if (submitProblem instanceof HttpError) {
        setSubmitError(submitProblem.message);
      } else {
        setSubmitError('登录失败，请稍后重试。');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app-shell app-shell--centered">
      <section className="auth-card">
        <div className="auth-card__hero">
          <p className="eyebrow">远程标注服务</p>
          <h1>登录标注服务</h1>
          <p>
            使用管理员或标注员账号登录后，即可在局域网内继续分发任务、上传文档和查看历史记录。
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>用户名</span>
            <input
              autoComplete="username"
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label className="field">
            <span>密码</span>
            <input
              autoComplete="current-password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {submitError ? (
            <p className="banner banner--error" role="alert">
              {submitError}
            </p>
          ) : null}
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? '登录中...' : '登录'}
          </button>
        </form>
      </section>
    </main>
  );
}

import { useState } from 'react';
import { callApi } from '../api';

export function AuthPage({ onAuthSuccess, initialRemember = null, updateStatus = null }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [username, setUsername] = useState(initialRemember?.username || '');
  const [password, setPassword] = useState(initialRemember?.password || '');
  const [rememberLogin, setRememberLogin] = useState(Boolean(initialRemember?.remember));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response =
        mode === 'register'
          ? await callApi('register', { name, username, password })
          : await callApi('login', { username, password });
      onAuthSuccess(response.user, { rememberLogin, username, password });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <img className="auth-logo-image" src={`${import.meta.env.BASE_URL}logo.svg`} alt="Logo Challenge App" />
          <div>
            <h1>Challenge App</h1>
            <p>Gerencie atletas, quilômetros e ranking localmente.</p>
          </div>
        </div>

        <form onSubmit={submit} className="stack">
          {mode === 'register' && (
            <label>
              Nome do organizador
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
          )}
          <label>
            Usuário
            <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} required />
          </label>
          <label>
            Senha
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {mode === 'login' && (
            <label className="check-row">
              <input type="checkbox" checked={rememberLogin} onChange={(e) => setRememberLogin(e.target.checked)} />
              <span>Lembrar login neste computador</span>
            </label>
          )}
          {error && <div className="error-box">{error}</div>}
          <button disabled={loading} className="btn-primary" type="submit">
            {loading ? 'Processando...' : mode === 'register' ? 'Criar conta' : 'Entrar'}
          </button>
        </form>

        <div className="auth-footer-actions">
          <button className="btn-link" type="button" onClick={() => setMode(mode === 'register' ? 'login' : 'register')}>
            {mode === 'register' ? 'Já tenho conta' : 'Criar nova conta'}
          </button>
          {updateStatus?.message ? (
            <div className="auth-update-panel">
              <div className="auth-update-head">
                <small className="auth-update-status">{updateStatus.message}</small>
                {(updateStatus.status === 'downloading' || updateStatus.status === 'installing') && (
                  <small className="auth-update-percent">{Math.round(Number(updateStatus.progress || 0))}%</small>
                )}
              </div>
              {(updateStatus.status === 'downloading' || updateStatus.status === 'installing') && (
                <div className="auth-update-progress">
                  <span style={{ width: `${Math.max(0, Math.min(100, Number(updateStatus.progress || 0)))}%` }} />
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

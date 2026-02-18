import { useState } from 'react';
import { callApi } from '../api';

export function AuthPage({ onAuthSuccess }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
      onAuthSuccess(response.user);
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
          {error && <div className="error-box">{error}</div>}
          <button disabled={loading} className="btn-primary" type="submit">
            {loading ? 'Processando...' : mode === 'register' ? 'Criar conta' : 'Entrar'}
          </button>
        </form>

        <div className="auth-footer-actions">
          <button className="btn-link" type="button" onClick={() => setMode(mode === 'register' ? 'login' : 'register')}>
            {mode === 'register' ? 'Já tenho conta' : 'Criar nova conta'}
          </button>
        </div>
      </div>
    </div>
  );
}

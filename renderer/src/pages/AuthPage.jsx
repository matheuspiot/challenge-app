import { useState } from 'react';
import { callApi } from '../api';

export function AuthPage({ onAuthSuccess }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let response;
      if (mode === 'register') {
        response = await callApi('register', { name, email, password });
      } else {
        response = await callApi('login', { email, password });
      }
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
        <h1>Desafio de Corrida</h1>
        <p>Gerencie atletas, quilômetros e ranking localmente.</p>
        <form onSubmit={submit} className="stack">
          {mode === 'register' && (
            <label>
              Nome do organizador
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
          )}
          <label>
            E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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
        <button
          className="btn-link"
          type="button"
          onClick={() => {
            setMode(mode === 'register' ? 'login' : 'register');
            setError('');
          }}
        >
          {mode === 'register' ? 'Já tenho conta' : 'Criar nova conta'}
        </button>
      </div>
    </div>
  );
}

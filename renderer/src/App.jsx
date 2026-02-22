import { useEffect, useState } from 'react';
import { callApi, getAppMeta, getUpdateStatus, subscribeUpdateStatus } from './api';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { ChallengePage } from './pages/ChallengePage';

const REMEMBER_LOGIN_KEY = 'challenge_app_remember_login';

function readRememberLogin() {
  try {
    const raw = localStorage.getItem(REMEMBER_LOGIN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.username || !parsed?.password) return null;
    return { username: parsed.username, password: parsed.password, remember: true };
  } catch (_err) {
    return null;
  }
}

function persistRememberLogin(value) {
  if (value?.rememberLogin) {
    localStorage.setItem(
      REMEMBER_LOGIN_KEY,
      JSON.stringify({ username: value.username || '', password: value.password || '' })
    );
  } else {
    localStorage.removeItem(REMEMBER_LOGIN_KEY);
  }
}

export default function App() {
  const [rememberLogin, setRememberLogin] = useState(readRememberLogin());
  const [user, setUser] = useState(null);
  const [challenges, setChallenges] = useState([]);
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [booting, setBooting] = useState(true);
  const [updateStatus, setUpdateStatus] = useState({ status: 'idle', message: '' });
  const [appMeta, setAppMeta] = useState({ version: '-', name: 'Challenge App' });

  async function loadChallenges(userId) {
    setLoading(true);
    setError('');
    try {
      const result = await callApi('listChallenges', userId);
      setChallenges(result.challenges || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user?.id) {
      loadChallenges(user.id);
    }
  }, [user?.id]);

  useEffect(() => {
    const cached = readRememberLogin();
    setRememberLogin(cached);
    if (!cached) {
      setBooting(false);
      return;
    }

    callApi('login', { username: cached.username, password: cached.password })
      .then((response) => {
        setUser(response.user || null);
      })
      .catch(() => {
        localStorage.removeItem(REMEMBER_LOGIN_KEY);
        setRememberLogin(null);
      })
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    let unsubscribe = () => {};
    getAppMeta()
      .then((meta) => setAppMeta(meta || { version: '-', name: 'Challenge App' }))
      .catch(() => {});
    getUpdateStatus()
      .then((status) => setUpdateStatus(status || { status: 'idle', message: '' }))
      .catch(() => {});
    try {
      unsubscribe = subscribeUpdateStatus((status) => {
        setUpdateStatus(status || { status: 'idle', message: '' });
      });
    } catch (_err) {
      // ignore
    }
    return () => unsubscribe();
  }, []);

  async function onAuthSuccess(authUser, authOptions = {}) {
    persistRememberLogin(authOptions);
    setRememberLogin(
      authOptions?.rememberLogin
        ? { username: authOptions.username, password: authOptions.password, remember: true }
        : null
    );
    setUser(authUser);
    setSelectedChallenge(null);
  }

  function onUserUpdated(updatedUser) {
    setUser(updatedUser);
  }

  async function saveChallenge(form, challengeId = null) {
    if (!user) return;
    if (challengeId) {
      await callApi('updateChallenge', { userId: user.id, challengeId, challenge: form });
    } else {
      await callApi('createChallenge', { userId: user.id, challenge: form });
    }
    await loadChallenges(user.id);
  }

  async function removeChallenge(challengeId) {
    if (!user) return;
    await callApi('deleteChallenge', { userId: user.id, challengeId });
    if (selectedChallenge?.id === challengeId) {
      setSelectedChallenge(null);
    }
    await loadChallenges(user.id);
  }

  async function logout() {
    localStorage.removeItem(REMEMBER_LOGIN_KEY);
    setRememberLogin(null);
    setUser(null);
    setChallenges([]);
    setSelectedChallenge(null);
    setError('');
  }

  if (booting) {
    return null;
  }

  if (!user) {
    return (
      <>
        <AuthPage onAuthSuccess={onAuthSuccess} initialRemember={rememberLogin} updateStatus={updateStatus} />
        <footer className="app-footer">Versao {appMeta.version} | {updateStatus?.message || 'Pronto'}</footer>
      </>
    );
  }

  if (selectedChallenge) {
    return (
      <>
        <ChallengePage
          user={user}
          challenge={selectedChallenge}
          onBack={() => setSelectedChallenge(null)}
          onUpdated={() => loadChallenges(user.id)}
          onUserUpdated={onUserUpdated}
        />
      </>
    );
  }

  return (
    <>
      <DashboardPage
        user={user}
        challenges={challenges}
        loading={loading}
        error={error}
        onOpenChallenge={setSelectedChallenge}
        onSaveChallenge={saveChallenge}
        onRemoveChallenge={removeChallenge}
        onLogout={logout}
      />
    </>
  );
}


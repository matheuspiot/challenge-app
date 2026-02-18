import { useEffect, useState } from 'react';
import { callApi, getUpdateStatus, subscribeUpdateStatus } from './api';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { ChallengePage } from './pages/ChallengePage';

export default function App() {
  const [user, setUser] = useState(null);
  const [challenges, setChallenges] = useState([]);
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updateStatus, setUpdateStatus] = useState({ status: 'idle', message: '' });

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
    let unsubscribe = () => {};
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

  async function onAuthSuccess(authUser) {
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
    setUser(null);
    setChallenges([]);
    setSelectedChallenge(null);
    setError('');
  }

  if (!user) {
    return (
      <>
        {updateStatus?.message ? <div className="update-status-bar">{updateStatus.message}</div> : null}
        <AuthPage onAuthSuccess={onAuthSuccess} />
      </>
    );
  }

  if (selectedChallenge) {
    return (
      <>
        {updateStatus?.message ? <div className="update-status-bar">{updateStatus.message}</div> : null}
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
      {updateStatus?.message ? <div className="update-status-bar">{updateStatus.message}</div> : null}
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

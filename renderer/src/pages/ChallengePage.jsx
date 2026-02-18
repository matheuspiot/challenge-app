import { useEffect, useMemo, useState } from 'react';
import { callApi } from '../api';

const tabs = ['Atletas', 'Registrar KM', 'Ranking', 'Exportações'];

const emptyAthlete = {
  name: '',
  phone: '',
  bibNumber: '',
  personalGoalKm: ''
};

const emptyActivity = {
  athleteId: '',
  date: new Date().toISOString().slice(0, 10),
  km: '',
  note: ''
};

export function ChallengePage({ user, challenge, onBack, onUpdated }) {
  const [activeTab, setActiveTab] = useState('Atletas');
  const [athletes, setAthletes] = useState([]);
  const [activities, setActivities] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [progress, setProgress] = useState({ goalKm: challenge.goal_km, totalKm: 0, percent: 0 });
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [athleteForm, setAthleteForm] = useState(emptyAthlete);
  const [editAthleteId, setEditAthleteId] = useState(null);
  const [activityForm, setActivityForm] = useState(emptyActivity);

  async function loadAll(currentSearch = search) {
    setError('');
    try {
      const [athletesRes, activitiesRes, rankingRes, progressRes] = await Promise.all([
        callApi('listAthletes', { userId: user.id, challengeId: challenge.id, filter: currentSearch }),
        callApi('listActivities', { userId: user.id, challengeId: challenge.id }),
        callApi('getRanking', { userId: user.id, challengeId: challenge.id }),
        callApi('getProgress', { userId: user.id, challengeId: challenge.id })
      ]);
      setAthletes(athletesRes.athletes || []);
      setActivities(activitiesRes.activities || []);
      setRanking(rankingRes.ranking || []);
      setProgress(progressRes.progress || { goalKm: 0, totalKm: 0, percent: 0 });
      onUpdated();
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadAll('');
  }, [challenge.id]);

  async function saveAthlete(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      if (editAthleteId) {
        await callApi('updateAthlete', {
          userId: user.id,
          challengeId: challenge.id,
          athleteId: editAthleteId,
          athlete: athleteForm
        });
        setMessage('Atleta atualizado com sucesso.');
      } else {
        await callApi('createAthlete', {
          userId: user.id,
          challengeId: challenge.id,
          athlete: athleteForm
        });
        setMessage('Atleta cadastrado com sucesso.');
      }
      setAthleteForm(emptyAthlete);
      setEditAthleteId(null);
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeAthlete(id) {
    setError('');
    setMessage('');
    try {
      await callApi('deleteAthlete', { userId: user.id, challengeId: challenge.id, athleteId: id });
      setMessage('Atleta removido.');
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEditAthlete(athlete) {
    setEditAthleteId(athlete.id);
    setAthleteForm({
      name: athlete.name || '',
      phone: athlete.phone || '',
      bibNumber: athlete.bib_number || '',
      personalGoalKm: athlete.personal_goal_km ?? ''
    });
  }

  async function submitActivity(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await callApi('createActivity', { userId: user.id, activity: activityForm });
      setMessage('Quilometragem registrada.');
      setActivityForm((prev) => ({ ...prev, km: '', note: '' }));
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function exportRanking() {
    setError('');
    setMessage('');
    try {
      const result = await callApi('exportRankingCsv', {
        userId: user.id,
        challengeId: challenge.id,
        challengeTitle: challenge.title
      });
      if (!result.canceled) {
        setMessage(`Ranking exportado: ${result.filePath}`);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function exportActivities() {
    setError('');
    setMessage('');
    try {
      const result = await callApi('exportActivitiesCsv', {
        userId: user.id,
        challengeId: challenge.id,
        challengeTitle: challenge.title
      });
      if (!result.canceled) {
        setMessage(`Atividades exportadas: ${result.filePath}`);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function backup() {
    setError('');
    setMessage('');
    try {
      const result = await callApi('backupDatabase');
      if (!result.canceled) {
        setMessage(`Backup salvo em: ${result.filePath}`);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function restore() {
    setError('');
    setMessage('');
    try {
      const result = await callApi('restoreDatabase');
      if (!result.canceled) {
        setMessage(`Backup restaurado: ${result.restoredFrom}`);
        await loadAll();
      }
    } catch (err) {
      setError(err.message);
    }
  }

  const rankingRows = useMemo(
    () =>
      ranking.map((row, index) => ({
        ...row,
        position: index + 1,
        personalPercent:
          row.personal_goal_km && Number(row.personal_goal_km) > 0
            ? Math.min(100, (Number(row.total_km) / Number(row.personal_goal_km)) * 100)
            : null
      })),
    [ranking]
  );

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <button className="btn-link" onClick={onBack}>
            ← Voltar para desafios
          </button>
          <h2>{challenge.title}</h2>
          <p>
            {challenge.start_date} até {challenge.end_date}
          </p>
        </div>
      </header>

      <section className="card">
        <div className="progress-box">
          <div>
            <strong>Meta geral:</strong> {Number(progress.goalKm || 0).toFixed(2)} km
          </div>
          <div>
            <strong>Total acumulado:</strong> {Number(progress.totalKm || 0).toFixed(2)} km
          </div>
          <div>
            <strong>Progresso:</strong> {Number(progress.percent || 0).toFixed(2)}%
          </div>
        </div>
        <div className="progress-bar">
          <span style={{ width: `${progress.percent || 0}%` }} />
        </div>
      </section>

      <section className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? 'tab active' : 'tab'}
            type="button"
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </section>

      {error && <div className="error-box">{error}</div>}
      {message && <div className="success-box">{message}</div>}

      {activeTab === 'Atletas' && (
        <section className="card split">
          <div>
            <h3>{editAthleteId ? 'Editar atleta' : 'Cadastrar atleta'}</h3>
            <form className="stack" onSubmit={saveAthlete}>
              <label>
                Nome
                <input
                  value={athleteForm.name}
                  onChange={(e) => setAthleteForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </label>
              <label>
                Telefone (opcional)
                <input
                  value={athleteForm.phone}
                  onChange={(e) => setAthleteForm((prev) => ({ ...prev, phone: e.target.value }))}
                />
              </label>
              <label>
                Número do peito (opcional)
                <input
                  value={athleteForm.bibNumber}
                  onChange={(e) => setAthleteForm((prev) => ({ ...prev, bibNumber: e.target.value }))}
                />
              </label>
              <label>
                Meta individual (km, opcional)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={athleteForm.personalGoalKm}
                  onChange={(e) => setAthleteForm((prev) => ({ ...prev, personalGoalKm: e.target.value }))}
                />
              </label>
              <div className="actions">
                <button className="btn-primary" type="submit">
                  {editAthleteId ? 'Salvar atleta' : 'Cadastrar atleta'}
                </button>
                {editAthleteId && (
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => {
                      setEditAthleteId(null);
                      setAthleteForm(emptyAthlete);
                    }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>
          <div>
            <h3>Lista de atletas</h3>
            <label>
              Buscar por nome
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onBlur={() => loadAll(search)}
                placeholder="Digite e clique fora"
              />
            </label>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Telefone</th>
                    <th>Peito</th>
                    <th>Total km</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {athletes.map((athlete) => (
                    <tr key={athlete.id}>
                      <td>{athlete.name}</td>
                      <td>{athlete.phone || '-'}</td>
                      <td>{athlete.bib_number || '-'}</td>
                      <td>{Number(athlete.total_km).toFixed(2)}</td>
                      <td className="actions">
                        <button className="btn-secondary" onClick={() => startEditAthlete(athlete)}>
                          Editar
                        </button>
                        <button className="btn-danger" onClick={() => removeAthlete(athlete.id)}>
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                  {athletes.length === 0 && (
                    <tr>
                      <td colSpan="5">Nenhum atleta encontrado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'Registrar KM' && (
        <section className="card split">
          <div>
            <h3>Novo registro de km</h3>
            <form className="stack" onSubmit={submitActivity}>
              <label>
                Atleta
                <select
                  value={activityForm.athleteId}
                  onChange={(e) => setActivityForm((prev) => ({ ...prev, athleteId: e.target.value }))}
                  required
                >
                  <option value="">Selecione</option>
                  {athletes.map((athlete) => (
                    <option key={athlete.id} value={athlete.id}>
                      {athlete.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Data
                <input
                  type="date"
                  value={activityForm.date}
                  onChange={(e) => setActivityForm((prev) => ({ ...prev, date: e.target.value }))}
                  required
                />
              </label>
              <label>
                Km
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={activityForm.km}
                  onChange={(e) => setActivityForm((prev) => ({ ...prev, km: e.target.value }))}
                  required
                />
              </label>
              <label>
                Observação (opcional)
                <textarea
                  rows="2"
                  value={activityForm.note}
                  onChange={(e) => setActivityForm((prev) => ({ ...prev, note: e.target.value }))}
                />
              </label>
              <button className="btn-primary" type="submit">
                Registrar
              </button>
            </form>
          </div>
          <div>
            <h3>Histórico recente</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Atleta</th>
                    <th>Km</th>
                    <th>Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {activities.map((activity) => (
                    <tr key={activity.id}>
                      <td>{activity.date}</td>
                      <td>{activity.athlete_name}</td>
                      <td>{Number(activity.km).toFixed(2)}</td>
                      <td>{activity.note || '-'}</td>
                    </tr>
                  ))}
                  {activities.length === 0 && (
                    <tr>
                      <td colSpan="4">Sem registros.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'Ranking' && (
        <section className="card">
          <h3>Ranking atual</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Atleta</th>
                  <th>Total km</th>
                  <th>Último registro</th>
                  <th>Meta individual</th>
                  <th>Progresso individual</th>
                </tr>
              </thead>
              <tbody>
                {rankingRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.position}</td>
                    <td>{row.name}</td>
                    <td>{Number(row.total_km).toFixed(2)}</td>
                    <td>{row.last_activity_date || '-'}</td>
                    <td>{row.personal_goal_km ? Number(row.personal_goal_km).toFixed(2) : '-'}</td>
                    <td>{row.personalPercent !== null ? `${row.personalPercent.toFixed(2)}%` : '-'}</td>
                  </tr>
                ))}
                {rankingRows.length === 0 && (
                  <tr>
                    <td colSpan="6">Sem atletas para ranquear.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'Exportações' && (
        <section className="card">
          <h3>Exportações e backup</h3>
          <div className="actions">
            <button className="btn-primary" onClick={exportRanking}>
              Exportar CSV do ranking
            </button>
            <button className="btn-primary" onClick={exportActivities}>
              Exportar CSV de atividades
            </button>
            <button className="btn-secondary" onClick={backup}>
              Fazer backup do banco
            </button>
            <button className="btn-danger" onClick={restore}>
              Restaurar backup
            </button>
          </div>
          <p>
            O restore substitui os dados atuais pelo arquivo selecionado. Use com cuidado.
          </p>
        </section>
      )}
    </div>
  );
}

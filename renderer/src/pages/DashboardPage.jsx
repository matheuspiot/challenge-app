import { useMemo, useState } from 'react';

const emptyChallenge = {
  title: '',
  description: '',
  goalKm: '',
  startDate: '',
  endDate: ''
};

export function DashboardPage({
  user,
  challenges,
  loading,
  error,
  onOpenChallenge,
  onSaveChallenge,
  onRemoveChallenge,
  onLogout
}) {
  const [form, setForm] = useState(emptyChallenge);
  const [editId, setEditId] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const sortedChallenges = useMemo(
    () =>
      [...challenges].sort((a, b) => {
        if (a.end_date < b.end_date) return -1;
        if (a.end_date > b.end_date) return 1;
        return b.id - a.id;
      }),
    [challenges]
  );

  function startEdit(challenge) {
    setEditId(challenge.id);
    setForm({
      title: challenge.title || '',
      description: challenge.description || '',
      goalKm: challenge.goal_km ?? '',
      startDate: challenge.start_date || '',
      endDate: challenge.end_date || ''
    });
    setFormError('');
  }

  function resetForm() {
    setEditId(null);
    setForm(emptyChallenge);
    setFormError('');
  }

  async function submitChallenge(e) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await onSaveChallenge(form, editId);
      resetForm();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h2>Olá, {user.name}</h2>
          <p>Gerencie seus desafios de corrida offline.</p>
        </div>
        <button className="btn-secondary" onClick={onLogout}>
          Sair
        </button>
      </header>

      <section className="card">
        <h3>{editId ? 'Editar desafio' : 'Novo desafio'}</h3>
        <form onSubmit={submitChallenge} className="form-grid">
          <label>
            Título
            <input
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              required
            />
          </label>
          <label>
            Meta (km)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.goalKm}
              onChange={(e) => setForm((prev) => ({ ...prev, goalKm: e.target.value }))}
              required
            />
          </label>
          <label>
            Data de início
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
              required
            />
          </label>
          <label>
            Data limite
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
              required
            />
          </label>
          <label className="full">
            Descrição
            <textarea
              rows="2"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </label>
          {formError && <div className="error-box full">{formError}</div>}
          <div className="actions full">
            <button className="btn-primary" disabled={saving} type="submit">
              {saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Criar desafio'}
            </button>
            {editId && (
              <button type="button" className="btn-secondary" onClick={resetForm}>
                Cancelar edição
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="card">
        <h3>Seus desafios</h3>
        {error && <div className="error-box">{error}</div>}
        {loading ? <p>Carregando...</p> : null}
        {!loading && sortedChallenges.length === 0 ? <p>Nenhum desafio cadastrado.</p> : null}
        <div className="challenge-list">
          {sortedChallenges.map((challenge) => (
            <article key={challenge.id} className="challenge-item">
              <div>
                <h4>{challenge.title}</h4>
                <p>{challenge.description || 'Sem descrição.'}</p>
                <small>
                  {challenge.start_date} até {challenge.end_date} | Meta {Number(challenge.goal_km).toFixed(2)} km |
                  Total {Number(challenge.total_km).toFixed(2)} km | Atletas {challenge.athletes_count}
                </small>
              </div>
              <div className="actions">
                <button className="btn-primary" onClick={() => onOpenChallenge(challenge)}>
                  Abrir
                </button>
                <button className="btn-secondary" onClick={() => startEdit(challenge)}>
                  Editar
                </button>
                <button className="btn-danger" onClick={() => onRemoveChallenge(challenge.id)}>
                  Excluir
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

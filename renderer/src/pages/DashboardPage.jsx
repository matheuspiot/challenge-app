import { useMemo, useState } from 'react';
import { FolderOpen, LogOut, Pencil, Plus, Trash2 } from 'lucide-react';

const emptyChallenge = { title: '', description: '', goalKm: '', startDate: '', endDate: '' };
const nf = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const DELETE_CONFIRMATION_TEXT = 'Eu quero excluir esse projeto';
const formatKm = (v) => `${nf.format(Number(v || 0))} km`;
const formatDate = (v) => {
  if (!v) return '-';
  const [y, m, d] = String(v).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : v;
};

export function DashboardPage({ user, challenges, loading, error, onOpenChallenge, onSaveChallenge, onRemoveChallenge, onLogout }) {
  const [form, setForm] = useState(emptyChallenge);
  const [editId, setEditId] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const sorted = useMemo(
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

  async function submitChallenge(e) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await onSaveChallenge(form, editId);
      setEditId(null);
      setForm(emptyChallenge);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function openDeleteModal(challenge) {
    setDeleteTarget(challenge);
    setDeleteConfirmation('');
    setDeleteError('');
  }

  function closeDeleteModal() {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteConfirmation('');
    setDeleteError('');
  }

  async function confirmDeleteChallenge(e) {
    e.preventDefault();
    if (!deleteTarget || deleteConfirmation !== DELETE_CONFIRMATION_TEXT) return;

    setDeleting(true);
    setDeleteError('');
    try {
      await onRemoveChallenge(deleteTarget.id);
      setDeleteTarget(null);
      setDeleteConfirmation('');
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h2>Olá, {user.name}</h2>
          <p>Gerencie seus desafios de corrida offline.</p>
        </div>
        <button className="btn-secondary btn-inline" onClick={onLogout}><LogOut size={15} />Sair</button>
      </header>

      <section className="card">
        <h3>{editId ? 'Editar desafio' : 'Novo desafio'}</h3>
        <form onSubmit={submitChallenge} className="form-grid">
          <label>Título<input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} required /></label>
          <label>Meta (km)<input type="number" min="0" step="0.01" value={form.goalKm} onChange={(e) => setForm((p) => ({ ...p, goalKm: e.target.value }))} required /></label>
          <label>Data de início<input type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} required /></label>
          <label>Data limite<input type="date" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} required /></label>
          <label className="full">Descrição<textarea rows="2" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></label>
          {formError && <div className="error-box full">{formError}</div>}
          <div className="actions full">
            <button className="btn-primary btn-inline" disabled={saving} type="submit"><Plus size={15} />{saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Criar desafio'}</button>
            {editId && <button type="button" className="btn-secondary" onClick={() => { setEditId(null); setForm(emptyChallenge); }}>Cancelar edição</button>}
          </div>
        </form>
      </section>

      <section className="card">
        <h3>Seus desafios</h3>
        {error && <div className="error-box">{error}</div>}
        {loading ? <p>Carregando...</p> : null}
        {!loading && sorted.length === 0 ? <p>Nenhum desafio cadastrado.</p> : null}
        <div className="challenge-list">
          {sorted.map((challenge) => (
            <article key={challenge.id} className="challenge-item">
              <div>
                <h4>{challenge.title}</h4>
                <p>{challenge.description || 'Sem descrição.'}</p>
                <small>
                  {formatDate(challenge.start_date)} até {formatDate(challenge.end_date)} | Meta {formatKm(challenge.goal_km)} | Total {formatKm(challenge.total_km)} | Atletas {challenge.athletes_count}
                </small>
              </div>
              <div className="icon-actions">
                <button className="icon-btn" title="Abrir desafio" onClick={() => onOpenChallenge(challenge)}><FolderOpen size={15} /></button>
                <button className="icon-btn" title="Editar desafio" onClick={() => startEdit(challenge)}><Pencil size={15} /></button>
                <button className="icon-btn danger" title="Excluir desafio" onClick={() => openDeleteModal(challenge)}><Trash2 size={15} /></button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {deleteTarget ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-challenge-title">
          <form className="modal-box danger-modal" onSubmit={confirmDeleteChallenge}>
            <h3 id="delete-challenge-title">Excluir desafio</h3>
            <div className="warning-box">
              Esta ação apaga permanentemente o projeto, atletas, atividades, inscrições, parcelas e pagamentos vinculados.
              Não será possível recuperar pelo app depois da exclusão, a menos que exista um backup.
            </div>
            <p>
              Para confirmar a exclusão de <strong>{deleteTarget.title}</strong>, digite exatamente:
            </p>
            <code className="confirmation-phrase">{DELETE_CONFIRMATION_TEXT}</code>
            <label>
              Frase de confirmação
              <input
                autoFocus
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder={DELETE_CONFIRMATION_TEXT}
              />
            </label>
            {deleteError && <div className="error-box">{deleteError}</div>}
            <div className="actions">
              <button
                className="btn-danger"
                disabled={deleting || deleteConfirmation !== DELETE_CONFIRMATION_TEXT}
                type="submit"
              >
                {deleting ? 'Excluindo...' : 'Excluir definitivamente'}
              </button>
              <button className="btn-secondary" disabled={deleting} type="button" onClick={closeDeleteModal}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

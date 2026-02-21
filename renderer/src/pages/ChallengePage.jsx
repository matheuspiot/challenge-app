import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BadgeDollarSign,
  CalendarDays,
  CircleAlert,
  CirclePlus,
  Eye,
  FileSpreadsheet,
  ListChecks,
  Medal,
  Pencil,
  Phone,
  Settings,
  Shirt,
  Target,
  Trash2,
  Trophy,
  UserRound,
  X
} from 'lucide-react';
import { callApi } from '../api';

const tabs = [
  { id: 'athletes', label: 'Cadastrar', icon: CirclePlus },
  { id: 'register', label: 'Registrar KM', icon: Target },
  { id: 'ranking', label: 'Ranking', icon: Trophy },
  { id: 'profile', label: 'Atleta', icon: UserRound },
  { id: 'pendencies', label: 'Pendências', icon: CircleAlert },
  { id: 'finance', label: 'Finanças', icon: ListChecks },
  { id: 'export', label: 'Exportações', icon: FileSpreadsheet },
  { id: 'settings', label: 'Configurações', icon: Settings }
];

const emptyAthlete = {
  name: '',
  phone: '',
  bibNumber: '',
  birthDate: '',
  gender: '',
  shirtSize: '',
  totalAmount: '',
  paymentType: 'cash',
  installmentsCount: 2,
  firstDueDate: new Date().toISOString().slice(0, 10)
};

const money = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const km = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const asMoney = (cents) => `R$ ${money.format(Number(cents || 0) / 100)}`;
const asKm = (value, unit = false) => (unit ? `${km.format(Number(value || 0))} km` : km.format(Number(value || 0)));
const asDate = (value) => {
  if (!value) return '-';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
};

function parseCurrency(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function placement(n) {
  const v = Number(n || 0);
  return v > 0 ? `${v}º` : '-';
}

function totalInstallmentsCents(installments = []) {
  return installments.reduce((acc, row) => acc + Number(row.amount_cents || 0), 0);
}

function openInstallmentsCents(installments = []) {
  return installments.reduce((acc, row) => (row.paid_at ? acc : acc + Number(row.amount_cents || 0)), 0);
}

function getInstallmentDisplay(installments = []) {
  if (!installments.length) return '-';
  if (installments.length === 1) return 'À vista';
  return `${asMoney(installments[0].amount_cents)} x ${installments.length}`;
}

export function ChallengePage({ user, challenge, onBack, onUpdated, onUserUpdated }) {
  const [tab, setTab] = useState('athletes');
  const [athletes, setAthletes] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [activities, setActivities] = useState([]);
  const [pendencies, setPendencies] = useState([]);
  const [finance, setFinance] = useState(null);
  const [filters, setFilters] = useState({ startDate: '', endDate: '' });
  const [athleteForm, setAthleteForm] = useState(emptyAthlete);
  const [editAthleteId, setEditAthleteId] = useState(null);
  const [selectedAthleteId, setSelectedAthleteId] = useState(null);
  const [payments, setPayments] = useState(null);
  const [payStatus, setPayStatus] = useState(null);
  const [registerSearch, setRegisterSearch] = useState('');
  const [profileSearch, setProfileSearch] = useState('');
  const [activity, setActivity] = useState({ athleteId: '', date: new Date().toISOString().slice(0, 10), km: '', note: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [accountForm, setAccountForm] = useState({ name: user.name || '', username: user.username || '', newPassword: '' });
  const [savingAccount, setSavingAccount] = useState(false);

  const selectedAthlete = useMemo(
    () => athletes.find((a) => Number(a.id) === Number(selectedAthleteId)) || null,
    [athletes, selectedAthleteId]
  );

  const registerMatches = useMemo(() => {
    const q = registerSearch.trim().toLowerCase();
    if (q.length < 2) return [];
    return athletes.filter((a) => String(a.name || '').toLowerCase().includes(q));
  }, [athletes, registerSearch]);

  const profileMatches = useMemo(() => {
    const q = profileSearch.trim().toLowerCase();
    if (q.length < 2) return [];
    return athletes.filter((a) => String(a.name || '').toLowerCase().includes(q));
  }, [athletes, profileSearch]);

  const athleteActivities = useMemo(() => {
    if (!selectedAthleteId) return [];
    return activities.filter((a) => Number(a.athlete_id) === Number(selectedAthleteId));
  }, [activities, selectedAthleteId]);

  const selectedRanking = useMemo(() => {
    if (!selectedAthleteId) return null;
    const idx = ranking.findIndex((r) => Number(r.id) === Number(selectedAthleteId));
    if (idx < 0) return null;
    return { placement: idx + 1 };
  }, [ranking, selectedAthleteId]);

  const kmProgress = useMemo(() => {
    if (!selectedAthlete) return 0;
    const goal = Number(challenge.goal_km || 0);
    if (goal <= 0) return 0;
    return Math.min(100, (Number(selectedAthlete.total_km || 0) / goal) * 100);
  }, [selectedAthlete, challenge.goal_km]);

  const paymentProgress = useMemo(() => {
    if (!payments?.installments?.length) return 0;
    const total = totalInstallmentsCents(payments.installments);
    if (!total) return 0;
    return Math.min(100, ((total - openInstallmentsCents(payments.installments)) / total) * 100);
  }, [payments]);

  const remainingKm = useMemo(() => {
    const goal = Number(challenge.goal_km || 0);
    const total = Number(selectedAthlete?.total_km || 0);
    return Math.max(0, goal - total);
  }, [challenge.goal_km, selectedAthlete?.total_km]);

  async function reload() {
    const [a, r, ac, pe, fi] = await Promise.all([
      callApi('listAthletes', { userId: user.id, challengeId: challenge.id, filter: '' }),
      callApi('getRanking', { userId: user.id, challengeId: challenge.id }),
      callApi('listActivities', { userId: user.id, challengeId: challenge.id }),
      callApi('listPaymentPendencies', { userId: user.id, challengeId: challenge.id }),
      callApi('getFinanceSummary', { userId: user.id, filters: { challengeId: challenge.id } })
    ]);
    setAthletes(a.athletes || []);
    setRanking(r.ranking || []);
    setActivities(ac.activities || []);
    setPendencies(pe.pendencies || []);
    setFinance(fi.summary || null);
    onUpdated();
  }

  useEffect(() => {
    reload().catch((e) => setError(e.message));
  }, [challenge.id]);

  useEffect(() => {
    setAccountForm({ name: user.name || '', username: user.username || '', newPassword: '' });
  }, [user.name, user.username]);

  useEffect(() => {
    if (!activity.athleteId) {
      setPayStatus(null);
      return;
    }
    callApi('getAthletePaymentStatus', { userId: user.id, athleteId: Number(activity.athleteId) })
      .then((r) => setPayStatus(r.paymentStatus))
      .catch(() => setPayStatus(null));
  }, [activity.athleteId, user.id]);

  async function loadProfile(athleteId) {
    setSelectedAthleteId(athleteId);
    const details = await callApi('getAthletePayments', { userId: user.id, athleteId });
    setPayments(details);
  }

  function closeProfile() {
    setSelectedAthleteId(null);
    setPayments(null);
    setProfileSearch('');
  }

  async function handleEditAthlete(athlete) {
    const payment = await callApi('getAthletePayments', { userId: user.id, athleteId: athlete.id }).catch(() => null);
    setEditAthleteId(athlete.id);
    setAthleteForm({
      name: athlete.name || '',
      phone: athlete.phone || '',
      bibNumber: athlete.bib_number || '',
      birthDate: athlete.birth_date || '',
      gender: athlete.gender || '',
      shirtSize: athlete.shirt_size || '',
      totalAmount: payment ? money.format(Number(payment.enrollment.total_amount_cents || 0) / 100) : '',
      paymentType: payment?.enrollment?.payment_type || 'cash',
      installmentsCount: payment?.enrollment?.installments_count || 2,
      firstDueDate: payment?.enrollment?.first_due_date || new Date().toISOString().slice(0, 10)
    });
  }

  async function handleDeleteAthlete(athlete) {
    if (!window.confirm(`Confirma excluir o atleta "${athlete.name}"?`)) return;
    await callApi('deleteAthlete', { userId: user.id, challengeId: challenge.id, athleteId: athlete.id });
    setMessage('Atleta removido com sucesso.');
    if (selectedAthleteId === athlete.id) closeProfile();
    await reload();
  }

  function resetAthleteForm() {
    setEditAthleteId(null);
    setAthleteForm(emptyAthlete);
  }

  async function saveAthlete(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    const amount = parseCurrency(athleteForm.totalAmount);
    if (!amount) {
      setError('Valor da inscrição inválido.');
      return;
    }
    const payload = {
      name: athleteForm.name,
      phone: athleteForm.phone,
      bibNumber: athleteForm.bibNumber,
      birthDate: athleteForm.birthDate || null,
      gender: athleteForm.gender,
      shirtSize: athleteForm.shirtSize,
      enrollment: {
        totalAmount: amount.toFixed(2),
        paymentType: athleteForm.paymentType,
        installmentsCount: athleteForm.paymentType === 'cash' ? 1 : Number(athleteForm.installmentsCount),
        firstDueDate: athleteForm.firstDueDate
      }
    };

    if (editAthleteId) {
      await callApi('updateAthlete', { userId: user.id, challengeId: challenge.id, athleteId: editAthleteId, athlete: payload });
      setMessage('Atleta atualizado com sucesso.');
    } else {
      await callApi('createAthlete', { userId: user.id, challengeId: challenge.id, athlete: payload });
      setMessage('Atleta cadastrado com sucesso.');
    }
    resetAthleteForm();
    await reload();
  }

  async function submitKm(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    await callApi('createActivity', { userId: user.id, activity });
    setMessage('Quilometragem registrada com sucesso.');
    setActivity((prev) => ({ ...prev, km: '', note: '' }));
    await reload();
  }

  async function openProfileFromList(athleteId) {
    await loadProfile(athleteId);
    setTab('profile');
  }

  async function payInstallment(installmentId) {
    await callApi('markInstallmentPaid', { userId: user.id, installmentId, payment: {} });
    if (selectedAthleteId) await loadProfile(selectedAthleteId);
    await reload();
  }

  async function reopenInstallment(installmentId) {
    await callApi('markInstallmentOpen', { userId: user.id, installmentId, payment: {} });
    if (selectedAthleteId) await loadProfile(selectedAthleteId);
    await reload();
  }

  async function saveAccount(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setSavingAccount(true);
    try {
      const response = await callApi('updateProfile', { userId: user.id, profile: accountForm });
      onUserUpdated?.(response.user);
      setAccountForm((prev) => ({ ...prev, newPassword: '' }));
      setMessage('Conta atualizada com sucesso.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAccount(false);
    }
  }

  async function handleBackupDatabase() {
    setError('');
    setMessage('');
    try {
      const result = await callApi('backupDatabase');
      if (!result?.canceled) {
        setMessage('Backup salvo com sucesso.');
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRestoreDatabase() {
    setError('');
    setMessage('');
    if (!window.confirm('Restaurar backup irá substituir os dados atuais. Deseja continuar?')) return;
    try {
      const result = await callApi('restoreDatabase');
      if (!result?.canceled) {
        setMessage('Backup restaurado com sucesso.');
        await reload();
      }
    } catch (err) {
      setError(err.message);
    }
  }

  const recentActivities = activities.slice(0, 12);

  return (
    <div className="page">
      <div className="challenge-layout">
        <aside className="challenge-sidebar">
          <div className="sidebar-brand">
            <img className="brand-logo-image" src={`${import.meta.env.BASE_URL}logo.svg`} alt="Logo Challenge App" />
            <strong>CHALLENGE APP</strong>
          </div>
          <div className="sidebar-challenge">
            <button className="btn-link btn-inline" onClick={onBack} type="button">
              <ArrowLeft size={16} />
              Voltar
            </button>
            <h3>{challenge.title}</h3>
            <p className="muted">{asDate(challenge.start_date)} até {asDate(challenge.end_date)}</p>
          </div>
          <small className="sidebar-section-title">Navegação</small>
          <nav className="sidebar-menu">
            {tabs.map((t) => {
              const Icon = t.icon;
              const showPendencyBadge = t.id === 'pendencies' && pendencies.length > 0;
              return (
                <button key={t.id} className={tab === t.id ? 'side-tab active btn-inline' : 'side-tab btn-inline'} onClick={() => setTab(t.id)} type="button">
                  <Icon size={16} />
                  <span>{t.label}</span>
                  {showPendencyBadge ? <span className="side-badge" title={`${pendencies.length} pendência(s)`} /> : null}
                </button>
              );
            })}
          </nav>
          <div className="sidebar-user muted">
            <small>Organizador</small>
            <strong>{user.name}</strong>
          </div>
        </aside>

        <main className="challenge-main">
          {error && <div className="error-box">{error}</div>}
          {message && <div className="success-box">{message}</div>}

          {tab === 'athletes' && (
            <section className="card split">
              <div>
                <h3>{editAthleteId ? 'Editar atleta' : 'Cadastrar atleta'}</h3>
                <form className="stack" onSubmit={saveAthlete}>
                  <label>Nome<input value={athleteForm.name} onChange={(e) => setAthleteForm((p) => ({ ...p, name: e.target.value }))} required /></label>
                  <label>Telefone (opcional)<input value={athleteForm.phone} onChange={(e) => setAthleteForm((p) => ({ ...p, phone: formatPhone(e.target.value) }))} placeholder="(11) 99999-9999" /></label>
                  <label>Número do peito (opcional)<input value={athleteForm.bibNumber} onChange={(e) => setAthleteForm((p) => ({ ...p, bibNumber: e.target.value }))} /></label>
                  <label>Data de nascimento (opcional)<input type="date" value={athleteForm.birthDate} onChange={(e) => setAthleteForm((p) => ({ ...p, birthDate: e.target.value }))} /></label>
                  <label>Gênero (opcional)<select value={athleteForm.gender} onChange={(e) => setAthleteForm((p) => ({ ...p, gender: e.target.value }))}><option value="">Selecione</option><option value="Feminino">Feminino</option><option value="Masculino">Masculino</option><option value="Outro">Outro</option></select></label>
                  <label>Tamanho da camisa (opcional)<select value={athleteForm.shirtSize} onChange={(e) => setAthleteForm((p) => ({ ...p, shirtSize: e.target.value }))}><option value="">Selecione</option><option value="PP">PP</option><option value="P">P</option><option value="M">M</option><option value="G">G</option><option value="GG">GG</option><option value="XG">XG</option></select></label>
                  <label>Valor da inscrição (R$)<input value={athleteForm.totalAmount} onChange={(e) => setAthleteForm((p) => ({ ...p, totalAmount: e.target.value }))} onBlur={() => { const parsed = parseCurrency(athleteForm.totalAmount); if (parsed) setAthleteForm((p) => ({ ...p, totalAmount: money.format(parsed) })); }} required /></label>
                  <label>Forma de pagamento<select value={athleteForm.paymentType} onChange={(e) => setAthleteForm((p) => ({ ...p, paymentType: e.target.value }))}><option value="cash">À vista</option><option value="installments">Parcelado</option></select></label>
                  {athleteForm.paymentType === 'installments' && <label>Quantidade de parcelas<input type="number" min="2" max="12" value={athleteForm.installmentsCount} onChange={(e) => setAthleteForm((p) => ({ ...p, installmentsCount: e.target.value }))} /></label>}
                  <label>Primeiro vencimento<input type="date" value={athleteForm.firstDueDate} onChange={(e) => setAthleteForm((p) => ({ ...p, firstDueDate: e.target.value }))} required /></label>
                  <div className="actions">
                    <button className="btn-primary btn-inline" type="submit"><CirclePlus size={16} />{editAthleteId ? 'Salvar alterações' : 'Cadastrar'}</button>
                    {editAthleteId && <button className="btn-secondary" type="button" onClick={resetAthleteForm}>Cancelar edição</button>}
                  </div>
                </form>
              </div>

              <div>
                <h3>Atletas cadastrados</h3>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Nome</th><th>Status de pagamento</th><th>Ações</th></tr></thead>
                    <tbody>
                      {athletes.map((a) => (
                        <tr key={a.id}>
                          <td>{a.name}</td>
                          <td>{a.payment_status?.label || '-'}</td>
                          <td>
                            <div className="icon-actions">
                              <button className="icon-btn" type="button" title="Editar" onClick={() => handleEditAthlete(a)}><Pencil size={15} /></button>
                              <button className="icon-btn" type="button" title="Perfil" onClick={() => openProfileFromList(a.id)}><Eye size={15} /></button>
                              <button className="icon-btn danger" type="button" title="Remover" onClick={() => handleDeleteAthlete(a)}><Trash2 size={15} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {tab === 'register' && (
            <section className="card split">
              <div>
                <h3>Novo registro de KM</h3>
                <form className="stack" onSubmit={submitKm}>
                  <label>Buscar atleta<input value={registerSearch} onChange={(e) => { setRegisterSearch(e.target.value); setActivity((p) => ({ ...p, athleteId: '' })); }} placeholder="Digite no mínimo 2 letras" /></label>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Atleta</th><th>Status</th><th>Ação</th></tr></thead>
                      <tbody>
                        {registerSearch.trim().length < 2 && <tr><td colSpan="3">Digite ao menos 2 letras para buscar.</td></tr>}
                        {registerSearch.trim().length >= 2 && registerMatches.length === 0 && <tr><td colSpan="3">Nenhum atleta encontrado.</td></tr>}
                        {registerSearch.trim().length >= 2 && registerMatches.map((m) => (
                          <tr key={m.id}><td>{m.name}</td><td>{m.payment_status?.label || '-'}</td><td><button className="btn-secondary" type="button" onClick={() => setActivity((p) => ({ ...p, athleteId: m.id }))}>Selecionar</button></td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {payStatus && <div className={payStatus.blocked ? 'error-box' : payStatus.statusCode === 'ATRASO_TOLERANCIA' ? 'warning-box' : 'success-box'}>{payStatus.blocked ? 'Bloqueado por inadimplência.' : payStatus.label}</div>}
                  <label>Data<input type="date" value={activity.date} onChange={(e) => setActivity((p) => ({ ...p, date: e.target.value }))} required /></label>
                  <label>KM<input type="number" min="0.01" step="0.01" value={activity.km} onChange={(e) => setActivity((p) => ({ ...p, km: e.target.value }))} required /></label>
                  <label>Observação (opcional)<input value={activity.note} onChange={(e) => setActivity((p) => ({ ...p, note: e.target.value }))} /></label>
                  <button className="btn-primary" disabled={!activity.athleteId || payStatus?.blocked} type="submit">Registrar KM</button>
                </form>
              </div>
              <div>
                <h3>Histórico recente</h3>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Data</th><th>Atleta</th><th>KM</th><th>Observação</th></tr></thead>
                    <tbody>{recentActivities.map((row) => <tr key={row.id}><td>{asDate(row.date)}</td><td>{row.athlete_name}</td><td>{asKm(row.km, true)}</td><td>{row.note || '-'}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {tab === 'ranking' && (
            <section className="card">
              <h3>Ranking atual</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>#</th><th>Atleta</th><th>Total KM</th><th>Perfil</th></tr></thead>
                  <tbody>
                    {ranking.map((r, i) => (
                      <tr key={r.id}>
                        <td><span className="btn-inline">{i === 0 ? <Trophy size={14} className="rank-icon gold" /> : <Medal size={14} className="rank-icon silver" />}{placement(i + 1)}</span></td>
                        <td>{r.name}</td>
                        <td>{asKm(r.total_km, true)}</td>
                        <td><button className="icon-btn" type="button" title="Ver perfil" onClick={() => openProfileFromList(r.id)}><Eye size={15} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {tab === 'profile' && (
            <section className="card profile-tab-card">
              <div className="topbar">
                <h3>Atleta</h3>
                {selectedAthlete && <button className="icon-btn" type="button" title="Fechar perfil" onClick={closeProfile}><X size={15} /></button>}
              </div>

              {!selectedAthlete && (
                <div className="profile-search-area">
                  <label>Buscar atleta<input value={profileSearch} onChange={(e) => setProfileSearch(e.target.value)} placeholder="Digite no mínimo 2 letras" /></label>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Atleta</th><th>Status</th><th>Ação</th></tr></thead>
                      <tbody>
                        {profileSearch.trim().length < 2 && <tr><td colSpan="3">Digite ao menos 2 letras para buscar.</td></tr>}
                        {profileSearch.trim().length >= 2 && profileMatches.length === 0 && <tr><td colSpan="3">Nenhum atleta encontrado.</td></tr>}
                        {profileSearch.trim().length >= 2 && profileMatches.map((a) => <tr key={a.id}><td>{a.name}</td><td>{a.payment_status?.label || '-'}</td><td><button className="btn-secondary" type="button" onClick={() => loadProfile(a.id)}>Ver perfil</button></td></tr>)}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {selectedAthlete && (
                <>
                  <div className="profile-personal-grid">
                    <div className="profile-detail"><small><UserRound size={14} /> Atleta</small><strong>{selectedAthlete.name}</strong></div>
                    <div className="profile-detail"><small><Phone size={14} /> Telefone</small><strong>{selectedAthlete.phone || '-'}</strong></div>
                    <div className="profile-detail"><small><CalendarDays size={14} /> Nascimento</small><strong>{asDate(selectedAthlete.birth_date)}</strong></div>
                    <div className="profile-detail"><small><UserRound size={14} /> Gênero</small><strong>{selectedAthlete.gender || '-'}</strong></div>
                    <div className="profile-detail"><small><Shirt size={14} /> Camisa</small><strong>{selectedAthlete.shirt_size || '-'}</strong></div>
                    <div className="profile-detail"><small>Número do peito</small><strong>{selectedAthlete.bib_number || '-'}</strong></div>
                  </div>

                  <div className="profile-metrics-grid">
                    <article className="card stat-card"><small>Total KM</small><h2>{asKm(selectedAthlete.total_km, true)}</h2></article>
                    <article className="card stat-card"><small>Meta do desafio</small><h2>{asKm(challenge.goal_km, true)}</h2></article>
                    <article className="card stat-card"><small>Faltam para meta</small><h2>{asKm(remainingKm, true)}</h2></article>
                    <article className="card stat-card"><small>Posição no ranking</small><h2>{placement(selectedRanking?.placement)}</h2></article>
                    <article className="card stat-card"><small><BadgeDollarSign size={14} /> Valor da inscrição</small><h2>{payments ? asMoney(payments.enrollment?.total_amount_cents) : '-'}</h2></article>
                    <article className="card stat-card"><small>Parcelamento</small><h2>{payments ? getInstallmentDisplay(payments.installments) : '-'}</h2></article>
                    <article className="card stat-card stat-negative"><small>Saldo devedor</small><h2>{payments ? asMoney(openInstallmentsCents(payments.installments)) : '-'}</h2></article>
                    <article className="card stat-card"><small>Status financeiro</small><h2>{payments?.paymentStatus?.label || selectedAthlete.payment_status?.label || '-'}</h2></article>
                  </div>

                  <div className="card">
                    <div className="progress-box">
                      <div className="progress-item">
                        <small>Progresso da meta de KM</small>
                        <div className="progress-bar"><span style={{ width: `${kmProgress}%` }} /></div>
                      </div>
                      <div className="progress-item">
                        <small>Progresso de pagamento</small>
                        <div className="progress-bar progress-bar-money"><span style={{ width: `${paymentProgress}%` }} /></div>
                      </div>
                    </div>
                  </div>

                  <div className="split">
                    <article className="card">
                      <h4>Histórico de KM</h4>
                      <div className="table-wrap"><table><thead><tr><th>Data</th><th>KM</th><th>Observação</th></tr></thead><tbody>{athleteActivities.map((ac) => <tr key={ac.id}><td>{asDate(ac.date)}</td><td>{asKm(ac.km, true)}</td><td>{ac.note || '-'}</td></tr>)}</tbody></table></div>
                    </article>
                    <article className="card">
                      <h4>Pagamentos</h4>
                      {!payments ? <p className="muted">Sem dados de pagamento.</p> : (
                        <div className="table-wrap">
                          <table>
                            <thead><tr><th>#</th><th>Vencimento</th><th>Status</th><th>Pagamento</th><th>Ação</th></tr></thead>
                            <tbody>{payments.installments.map((i) => <tr key={i.id}><td>{i.installment_number}</td><td>{asDate(i.due_date)}</td><td>{i.statusLabel}</td><td>{asDate(i.paid_at)}</td><td>{i.paid_at ? <button className="btn-secondary" onClick={() => reopenInstallment(i.id)} type="button">Reabrir</button> : <button className="btn-primary" onClick={() => payInstallment(i.id)} type="button">Marcar pago</button>}</td></tr>)}</tbody>
                          </table>
                        </div>
                      )}
                    </article>
                  </div>
                </>
              )}
            </section>
          )}

          {tab === 'pendencies' && (
            <section className="card">
              <h3>Pendências de pagamento</h3>
              <div className="table-wrap"><table><thead><tr><th>Atleta</th><th>Parcela</th><th>Status</th><th>Ações</th></tr></thead><tbody>{pendencies.map((p) => <tr key={p.installment_id}><td>{p.athlete_name}</td><td>{p.installment_number}</td><td>{p.statusLabel}</td><td><div className="actions"><button className="btn-secondary" onClick={() => openProfileFromList(p.athlete_id)} type="button">Abrir atleta</button><button className="btn-primary" onClick={() => payInstallment(p.installment_id)} type="button">Marcar pago</button></div></td></tr>)}</tbody></table></div>
            </section>
          )}

          {tab === 'finance' && (
            <section className="card">
              <h3>Finanças</h3>
              <div className="finance-toolbar">
                <div className="finance-filters">
                  <label>Início<input type="date" value={filters.startDate} onChange={(e) => setFilters((p) => ({ ...p, startDate: e.target.value }))} /></label>
                  <label>Fim<input type="date" value={filters.endDate} onChange={(e) => setFilters((p) => ({ ...p, endDate: e.target.value }))} /></label>
                  <button className="btn-secondary" type="button" onClick={() => callApi('getFinanceSummary', { userId: user.id, filters: { challengeId: challenge.id, ...filters } }).then((r) => setFinance(r.summary))}>Filtrar</button>
                </div>
                <div className="finance-actions">
                  <button className="btn-secondary btn-inline finance-btn-small" type="button" onClick={() => callApi('exportFinancePaidCsv', { userId: user.id, filters: { challengeId: challenge.id, ...filters }, fileTitle: `${challenge.title}_pagas` })}><FileSpreadsheet size={14} />CSV pagas</button>
                  <button className="btn-secondary btn-inline finance-btn-small" type="button" onClick={() => callApi('exportFinanceOverdueCsv', { userId: user.id, filters: { challengeId: challenge.id, ...filters }, fileTitle: `${challenge.title}_vencidas` })}><FileSpreadsheet size={14} />CSV vencidas</button>
                </div>
              </div>
              {finance && (
                <>
                  <div className="stats-grid">
                    <article className="card stat-card stat-positive"><small>Previsto</small><h2>{asMoney(finance.totals.totalExpectedCents)}</h2></article>
                    <article className="card stat-card stat-positive"><small>Recebido</small><h2>{asMoney(finance.totals.totalReceivedCents)}</h2></article>
                    <article className="card stat-card stat-warning"><small>Em aberto</small><h2>{asMoney(finance.totals.totalOpenCents)}</h2></article>
                    <article className="card stat-card stat-negative"><small>Inadimplência</small><h2>{finance.totals.delinquentAthletesCount} atleta(s)</h2><small>{asMoney(finance.totals.delinquentValueCents)}</small></article>
                  </div>
                  <div className="finance-grid">
                    <article className="card">
                      <h4>Parcelas pagas</h4>
                      <div className="table-wrap"><table><thead><tr><th>Atleta</th><th>Parcela</th><th>Pago em</th><th>Valor</th></tr></thead><tbody>{finance.paidInstallments?.map((i) => <tr key={i.id}><td>{i.athlete_name}</td><td>{i.installment_number}</td><td>{asDate(i.paid_at)}</td><td>{asMoney(i.amount_cents)}</td></tr>)}</tbody></table></div>
                    </article>
                    <article className="card">
                      <h4>Parcelas vencidas</h4>
                      <div className="table-wrap"><table><thead><tr><th>Atleta</th><th>Vencimento</th><th>Atraso</th><th>Valor</th></tr></thead><tbody>{finance.overdueInstallments?.map((i) => <tr key={i.id}><td>{i.athlete_name}</td><td>{asDate(i.due_date)}</td><td>{i.overdueDays} dia(s)</td><td>{asMoney(i.amount_cents)}</td></tr>)}</tbody></table></div>
                    </article>
                  </div>
                </>
              )}
            </section>
          )}

          {tab === 'export' && (
            <section className="card">
              <h3>Exportações</h3>
              <div className="actions">
                <button className="btn-primary btn-inline" type="button" onClick={() => callApi('exportRankingCsv', { userId: user.id, challengeId: challenge.id, challengeTitle: challenge.title })}><FileSpreadsheet size={16} />Ranking</button>
                <button className="btn-primary btn-inline" type="button" onClick={() => callApi('exportActivitiesCsv', { userId: user.id, challengeId: challenge.id, challengeTitle: challenge.title })}><FileSpreadsheet size={16} />Atividades</button>
              </div>
            </section>
          )}

          {tab === 'settings' && (
            <section className="card">
              <h3>Configurações da conta</h3>
              <form className="stack" onSubmit={saveAccount}>
                <label>Nome do organizador
                  <input value={accountForm.name} onChange={(e) => setAccountForm((p) => ({ ...p, name: e.target.value }))} required />
                </label>
                <label>Usuário
                  <input value={accountForm.username} onChange={(e) => setAccountForm((p) => ({ ...p, username: e.target.value.toLowerCase() }))} required />
                </label>
                <label>Nova senha (opcional)
                  <input type="password" value={accountForm.newPassword} onChange={(e) => setAccountForm((p) => ({ ...p, newPassword: e.target.value }))} placeholder="Mínimo 6 caracteres" />
                </label>
                <div className="actions">
                  <button className="btn-primary" type="submit" disabled={savingAccount}>{savingAccount ? 'Salvando...' : 'Salvar alterações'}</button>
                </div>
              </form>
              <hr />
              <h3>Backup de dados</h3>
              <div className="actions">
                <button className="btn-secondary" type="button" onClick={handleBackupDatabase}>Fazer backup</button>
                <button className="btn-secondary" type="button" onClick={handleRestoreDatabase}>Restaurar backup</button>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}




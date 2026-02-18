import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Banknote, Eye, FileSpreadsheet, Pencil, Target, Trash2, Trophy } from 'lucide-react';
import { callApi } from '../api';

const tabs = [
  { id: 'athletes', label: 'Atletas' },
  { id: 'register', label: 'Registrar KM' },
  { id: 'ranking', label: 'Ranking' },
  { id: 'payments', label: 'Pagamentos' },
  { id: 'pendencies', label: 'Pendências' },
  { id: 'finance', label: 'Finanças' },
  { id: 'export', label: 'Exportações' }
];

const money = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const km = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const asMoney = (cents) => `R$ ${money.format(Number(cents || 0) / 100)}`;
const asKm = (v, unit = false) => (unit ? `${km.format(Number(v || 0))} km` : km.format(Number(v || 0)));
const asDate = (v) => {
  if (!v) return '-';
  const [y, m, d] = String(v).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : v;
};
const parseCurrency = (raw) => {
  if (!raw) return null;
  let s = String(raw).replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const emptyAthlete = {
  name: '',
  phone: '',
  bibNumber: '',
  personalGoalKm: '',
  totalAmount: '',
  paymentType: 'cash',
  installmentsCount: 2,
  firstDueDate: new Date().toISOString().slice(0, 10)
};

export function ChallengePage({ user, challenge, onBack, onUpdated }) {
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
  const [registerSearch, setRegisterSearch] = useState('');
  const [activity, setActivity] = useState({ athleteId: '', date: new Date().toISOString().slice(0, 10), km: '', note: '' });
  const [payStatus, setPayStatus] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

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
    if (!activity.athleteId) return setPayStatus(null);
    callApi('getAthletePaymentStatus', { userId: user.id, athleteId: Number(activity.athleteId) })
      .then((r) => setPayStatus(r.paymentStatus))
      .catch(() => setPayStatus(null));
  }, [activity.athleteId, user.id]);

  const matches = useMemo(() => {
    const q = registerSearch.trim().toLowerCase();
    if (q.length < 2) return [];
    return athletes.filter((a) => a.name.toLowerCase().includes(q));
  }, [athletes, registerSearch]);

  async function editAthlete(a) {
    setEditAthleteId(a.id);
    const pay = await callApi('getAthletePayments', { userId: user.id, athleteId: a.id }).catch(() => null);
    setAthleteForm({
      name: a.name || '',
      phone: a.phone || '',
      bibNumber: a.bib_number || '',
      personalGoalKm: a.personal_goal_km ?? '',
      totalAmount: pay ? money.format(Number(pay.enrollment.total_amount_cents || 0) / 100) : '',
      paymentType: pay?.enrollment?.payment_type || 'cash',
      installmentsCount: pay?.enrollment?.installments_count || 2,
      firstDueDate: pay?.enrollment?.first_due_date || new Date().toISOString().slice(0, 10)
    });
  }

  async function saveAthlete(e) {
    e.preventDefault();
    setError('');
    const amount = parseCurrency(athleteForm.totalAmount);
    if (!amount) return setError('Valor da inscrição inválido.');
    if (athleteForm.paymentType === 'installments') {
      const c = Number(athleteForm.installmentsCount);
      if (!Number.isInteger(c) || c < 2 || c > 12) return setError('Parcelas devem estar entre 2 e 12.');
    }
    const payload = {
      name: athleteForm.name,
      phone: athleteForm.phone,
      bibNumber: athleteForm.bibNumber,
      personalGoalKm: athleteForm.personalGoalKm,
      enrollment: {
        totalAmount: amount.toFixed(2),
        paymentType: athleteForm.paymentType,
        installmentsCount: athleteForm.paymentType === 'cash' ? 1 : Number(athleteForm.installmentsCount),
        firstDueDate: athleteForm.firstDueDate
      }
    };
    if (editAthleteId) await callApi('updateAthlete', { userId: user.id, challengeId: challenge.id, athleteId: editAthleteId, athlete: payload });
    else await callApi('createAthlete', { userId: user.id, challengeId: challenge.id, athlete: payload });
    setAthleteForm(emptyAthlete);
    setEditAthleteId(null);
    setMessage('Atleta salvo com sucesso.');
    await reload();
  }

  async function openPayments(athleteId) {
    setSelectedAthleteId(athleteId);
    const details = await callApi('getAthletePayments', { userId: user.id, athleteId });
    setPayments(details);
    setTab('payments');
  }

  async function payInstallment(id) {
    await callApi('markInstallmentPaid', { userId: user.id, installmentId: id, payment: {} });
    if (selectedAthleteId) await openPayments(selectedAthleteId);
    await reload();
  }

  async function reopenInstallment(id) {
    await callApi('markInstallmentOpen', { userId: user.id, installmentId: id, payment: {} });
    if (selectedAthleteId) await openPayments(selectedAthleteId);
    await reload();
  }

  async function submitKm(e) {
    e.preventDefault();
    setError('');
    await callApi('createActivity', { userId: user.id, activity });
    setMessage('KM registrado.');
    setActivity((p) => ({ ...p, km: '', note: '' }));
    await reload();
  }

  return (
    <div className="page">
      <div className="challenge-layout">
        <aside className="challenge-sidebar">
          <button className="btn-link btn-inline" onClick={onBack} type="button"><ArrowLeft size={16} /> Voltar</button>
          <h3>{challenge.title}</h3>
          <p className="muted">{asDate(challenge.start_date)} até {asDate(challenge.end_date)}</p>
          <nav className="sidebar-menu">{tabs.map((t) => <button key={t.id} className={tab === t.id ? 'side-tab active' : 'side-tab'} onClick={() => setTab(t.id)} type="button">{t.label}</button>)}</nav>
        </aside>
        <main className="challenge-main">
          {error && <div className="error-box">{error}</div>}
          {message && <div className="success-box">{message}</div>}

          {tab === 'athletes' && <section className="card split">
            <div><h3>{editAthleteId ? 'Editar atleta' : 'Cadastrar atleta'}</h3><form className="stack" onSubmit={saveAthlete}>
              <label>Nome<input value={athleteForm.name} onChange={(e) => setAthleteForm((p) => ({ ...p, name: e.target.value }))} required /></label>
              <label>Valor da inscrição (R$)<input value={athleteForm.totalAmount} onBlur={() => setAthleteForm((p) => ({ ...p, totalAmount: parseCurrency(p.totalAmount) ? money.format(parseCurrency(p.totalAmount)) : p.totalAmount }))} onChange={(e) => setAthleteForm((p) => ({ ...p, totalAmount: e.target.value }))} required /></label>
              <label>Forma<select value={athleteForm.paymentType} onChange={(e) => setAthleteForm((p) => ({ ...p, paymentType: e.target.value }))}><option value="cash">À vista</option><option value="installments">Parcelado</option></select></label>
              {athleteForm.paymentType === 'installments' && <label>Parcelas<input type="number" min="2" max="12" value={athleteForm.installmentsCount} onChange={(e) => setAthleteForm((p) => ({ ...p, installmentsCount: e.target.value }))} /></label>}
              <label>Primeiro vencimento<input type="date" value={athleteForm.firstDueDate} onChange={(e) => setAthleteForm((p) => ({ ...p, firstDueDate: e.target.value }))} /></label>
              <button className="btn-primary" type="submit">Salvar</button>
            </form></div>
            <div><h3>Atletas</h3><div className="table-wrap"><table><thead><tr><th>Nome</th><th>Status</th><th>Ações</th></tr></thead><tbody>
              {athletes.map((a) => <tr key={a.id}><td>{a.name}</td><td>{a.payment_status?.label || '-'}</td><td><div className="icon-actions"><button className="icon-btn" onClick={() => editAthlete(a)} type="button"><Pencil size={15} /></button><button className="icon-btn" onClick={() => openPayments(a.id)} type="button"><Banknote size={15} /></button><button className="icon-btn" onClick={() => setTab('register') || setRegisterSearch(a.name) || setActivity((p) => ({ ...p, athleteId: a.id }))} type="button"><Target size={15} /></button></div></td></tr>)}
            </tbody></table></div></div>
          </section>}

          {tab === 'register' && <section className="card split">
            <div><h3>Registrar KM</h3><form className="stack" onSubmit={submitKm}>
              <label>Buscar atleta<input value={registerSearch} onChange={(e) => { setRegisterSearch(e.target.value); setActivity((p) => ({ ...p, athleteId: '' })); }} placeholder="Digite 2 letras" /></label>
              {payStatus && <div className={payStatus.blocked ? 'error-box' : payStatus.statusCode === 'ATRASO_TOLERANCIA' ? 'warning-box' : 'success-box'}>{payStatus.blocked ? 'Bloqueado por inadimplência' : payStatus.label}</div>}
              <label>Data<input type="date" value={activity.date} onChange={(e) => setActivity((p) => ({ ...p, date: e.target.value }))} /></label>
              <label>KM<input type="number" min="0.01" step="0.01" value={activity.km} onChange={(e) => setActivity((p) => ({ ...p, km: e.target.value }))} /></label>
              <button className="btn-primary" disabled={!activity.athleteId || payStatus?.blocked} type="submit">Registrar</button>
            </form></div>
            <div><h3>Resultados</h3><div className="table-wrap"><table><thead><tr><th>Atleta</th><th>Status</th><th>Ação</th></tr></thead><tbody>
              {registerSearch.trim().length < 2 && <tr><td colSpan="3">Digite ao menos 2 letras.</td></tr>}
              {registerSearch.trim().length >= 2 && matches.map((m) => <tr key={m.id}><td>{m.name}</td><td>{m.payment_status?.label || '-'}</td><td><button className="btn-secondary" type="button" onClick={() => setActivity((p) => ({ ...p, athleteId: m.id }))}>Selecionar</button></td></tr>)}
            </tbody></table></div></div>
          </section>}

          {tab === 'ranking' && <section className="card"><h3>Ranking</h3><div className="table-wrap"><table><thead><tr><th>#</th><th>Atleta</th><th>Total</th><th>Perfil</th></tr></thead><tbody>{ranking.map((r, i) => <tr key={r.id}><td className="rank-cell">{i + 1 === 1 ? <Trophy size={15} /> : null}{i + 1}</td><td>{r.name}</td><td>{asKm(r.total_km)}</td><td><button className="icon-btn" onClick={() => openPayments(r.id)} type="button"><Eye size={15} /></button></td></tr>)}</tbody></table></div></section>}

          {tab === 'payments' && <section className="card"><h3>Pagamentos</h3>{!payments ? <p>Selecione um atleta.</p> : <><p><strong>Total:</strong> {asMoney(payments.enrollment.total_amount_cents)} | <strong>Status:</strong> {payments.paymentStatus.label}</p><div className="table-wrap"><table><thead><tr><th>#</th><th>Vencimento</th><th>Status</th><th>Pagamento</th><th>Ação</th></tr></thead><tbody>{payments.installments.map((i) => <tr key={i.id}><td>{i.installment_number}</td><td>{asDate(i.due_date)}</td><td>{i.statusLabel}</td><td>{asDate(i.paid_at)}</td><td>{i.paid_at ? <button className="btn-secondary" onClick={() => reopenInstallment(i.id)} type="button">Reabrir</button> : <button className="btn-primary" onClick={() => payInstallment(i.id)} type="button">Marcar pago</button>}</td></tr>)}</tbody></table></div></>}</section>}

          {tab === 'pendencies' && <section className="card"><h3>Pendências</h3><div className="table-wrap"><table><thead><tr><th>Atleta</th><th>Parcela</th><th>Status</th><th>Ações</th></tr></thead><tbody>{pendencies.map((p) => <tr key={p.installment_id}><td>{p.athlete_name}</td><td>{p.installment_number}</td><td>{p.statusLabel}</td><td><div className="actions"><button className="btn-secondary" onClick={() => openPayments(p.athlete_id)} type="button">Abrir atleta</button><button className="btn-primary" onClick={() => payInstallment(p.installment_id)} type="button">Marcar pago</button></div></td></tr>)}</tbody></table></div></section>}

          {tab === 'finance' && <section className="card"><h3>Finanças</h3><div className="actions"><label>Início<input type="date" value={filters.startDate} onChange={(e) => setFilters((p) => ({ ...p, startDate: e.target.value }))} /></label><label>Fim<input type="date" value={filters.endDate} onChange={(e) => setFilters((p) => ({ ...p, endDate: e.target.value }))} /></label><button className="btn-secondary" type="button" onClick={() => callApi('getFinanceSummary', { userId: user.id, filters: { challengeId: challenge.id, ...filters } }).then((r) => setFinance(r.summary))}>Filtrar</button><button className="btn-primary" type="button" onClick={() => callApi('exportFinancePaidCsv', { userId: user.id, filters: { challengeId: challenge.id, ...filters }, fileTitle: `${challenge.title}_pagas` })}>CSV pagas</button><button className="btn-primary" type="button" onClick={() => callApi('exportFinanceOverdueCsv', { userId: user.id, filters: { challengeId: challenge.id, ...filters }, fileTitle: `${challenge.title}_vencidas` })}>CSV vencidas</button></div>{finance && <div className="stats-grid"><article className="card stat-card"><small>Previsto</small><h2>{asMoney(finance.totals.totalExpectedCents)}</h2></article><article className="card stat-card"><small>Recebido</small><h2>{asMoney(finance.totals.totalReceivedCents)}</h2></article><article className="card stat-card"><small>Em aberto</small><h2>{asMoney(finance.totals.totalOpenCents)}</h2></article><article className="card stat-card"><small>Inadimplência</small><h2>{finance.totals.delinquentAthletesCount} atleta(s)</h2><small>{asMoney(finance.totals.delinquentValueCents)}</small></article></div>}</section>}

          {tab === 'export' && <section className="card"><h3>Exportações</h3><div className="actions"><button className="btn-primary btn-inline" type="button" onClick={() => callApi('exportRankingCsv', { userId: user.id, challengeId: challenge.id, challengeTitle: challenge.title })}><FileSpreadsheet size={16} /> Ranking</button><button className="btn-primary btn-inline" type="button" onClick={() => callApi('exportActivitiesCsv', { userId: user.id, challengeId: challenge.id, challengeTitle: challenge.title })}><FileSpreadsheet size={16} /> Atividades</button></div></section>}
        </main>
      </div>
    </div>
  );
}

const bcrypt = require('bcryptjs');

class AppError extends Error {
  constructor(message, code = 'APP_ERROR') {
    super(message);
    this.code = code;
  }
}

function toNumber(value, fieldName, min = null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new AppError(`${fieldName} inválido.`);
  if (min !== null && parsed < min) throw new AppError(`${fieldName} deve ser maior ou igual a ${min}.`);
  return parsed;
}

function toInt(value, fieldName, min = null, max = null) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new AppError(`${fieldName} inválido.`);
  if (min !== null && parsed < min) throw new AppError(`${fieldName} deve ser maior ou igual a ${min}.`);
  if (max !== null && parsed > max) throw new AppError(`${fieldName} deve ser menor ou igual a ${max}.`);
  return parsed;
}

function requireText(value, fieldName) {
  if (!value || typeof value !== 'string' || !value.trim()) throw new AppError(`${fieldName} é obrigatório.`);
  return value.trim();
}

function requireDate(value, fieldName) {
  const text = requireText(value, fieldName);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new AppError(`${fieldName} deve estar no formato AAAA-MM-DD.`);
  return text;
}

function dateToLocalIsoToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addMonths(isoDate, monthsToAdd) {
  const [y, m, d] = isoDate.split('-').map((v) => Number(v));
  const dt = new Date(y, m - 1 + monthsToAdd, d);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function daysBetween(dateA, dateB) {
  const a = new Date(`${dateA}T00:00:00`);
  const b = new Date(`${dateB}T00:00:00`);
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

function splitAmount(totalCents, count) {
  const base = Math.floor(totalCents / count);
  let remainder = totalCents - base * count;
  const values = [];
  for (let i = 0; i < count; i += 1) {
    const plusOne = remainder > 0 ? 1 : 0;
    values.push(base + plusOne);
    remainder -= plusOne;
  }
  return values;
}

function createServices(db) {
  const statements = {
    createUser: db.prepare('INSERT INTO users (name, username, email, password_hash) VALUES (?, ?, ?, ?)'),
    getUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    getUserByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
    getUserById: db.prepare('SELECT id, name, username, email, created_at FROM users WHERE id = ?'),
    updateUserProfile: db.prepare('UPDATE users SET name = ?, username = ?, password_hash = ? WHERE id = ?'),

    listChallenges: db.prepare(`
      SELECT c.*, COALESCE(SUM(act.km), 0) AS total_km, COUNT(DISTINCT a.id) AS athletes_count
      FROM challenges c
      LEFT JOIN athletes a ON a.challenge_id = c.id
      LEFT JOIN activities act ON act.athlete_id = a.id
      WHERE c.user_id = ?
      GROUP BY c.id
      ORDER BY c.end_date ASC, c.created_at DESC
    `),
    getChallenge: db.prepare('SELECT * FROM challenges WHERE id = ? AND user_id = ?'),
    createChallenge: db.prepare('INSERT INTO challenges (user_id, title, description, goal_km, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)'),
    updateChallenge: db.prepare('UPDATE challenges SET title = ?, description = ?, goal_km = ?, start_date = ?, end_date = ? WHERE id = ? AND user_id = ?'),
    deleteChallenge: db.prepare('DELETE FROM challenges WHERE id = ? AND user_id = ?'),

    listAthletes: db.prepare(`
      SELECT a.*, COALESCE(SUM(act.km), 0) AS total_km, MAX(act.date) AS last_activity_date
      FROM athletes a
      LEFT JOIN activities act ON act.athlete_id = a.id
      WHERE a.challenge_id = ? AND LOWER(a.name) LIKE ?
      GROUP BY a.id
      ORDER BY a.name COLLATE NOCASE ASC
    `),
    getAthlete: db.prepare('SELECT * FROM athletes WHERE id = ? AND challenge_id = ?'),
    createAthlete: db.prepare(`
      INSERT INTO athletes (challenge_id, name, phone, bib_number, birth_date, gender, shirt_size, personal_goal_km)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateAthlete: db.prepare(`
      UPDATE athletes SET name = ?, phone = ?, bib_number = ?, birth_date = ?, gender = ?, shirt_size = ?, personal_goal_km = ?
      WHERE id = ? AND challenge_id = ?
    `),
    deleteAthlete: db.prepare('DELETE FROM athletes WHERE id = ? AND challenge_id = ?'),

    challengeOwnerByAthlete: db.prepare(`
      SELECT c.user_id, c.id AS challenge_id, a.name AS athlete_name
      FROM athletes a JOIN challenges c ON c.id = a.challenge_id
      WHERE a.id = ?
    `),
    createActivity: db.prepare('INSERT INTO activities (athlete_id, date, km, note) VALUES (?, ?, ?, ?)'),
    listActivitiesByChallenge: db.prepare(`
      SELECT act.id, act.athlete_id, at.name AS athlete_name, act.date, act.km, act.note, act.created_at
      FROM activities act
      JOIN athletes at ON at.id = act.athlete_id
      JOIN challenges c ON c.id = at.challenge_id
      WHERE c.id = ? AND c.user_id = ?
      ORDER BY act.date DESC, act.created_at DESC
    `),
    listActivitiesByAthlete: db.prepare(`
      SELECT act.id, act.athlete_id, at.name AS athlete_name, act.date, act.km, act.note, act.created_at
      FROM activities act
      JOIN athletes at ON at.id = act.athlete_id
      WHERE at.challenge_id = ?
      ORDER BY at.name COLLATE NOCASE ASC, act.date DESC, act.created_at DESC
    `),

    rankingBase: db.prepare(`
      SELECT a.id, a.name, a.phone, a.bib_number, a.personal_goal_km, a.created_at,
      COALESCE(SUM(act.km), 0) AS total_km, MAX(act.date) AS last_activity_date
      FROM athletes a
      LEFT JOIN activities act ON act.athlete_id = a.id
      WHERE a.challenge_id = ?
      GROUP BY a.id
    `),
    rankingActivities: db.prepare(`
      SELECT act.athlete_id, act.date, act.km, act.created_at
      FROM activities act
      JOIN athletes a ON a.id = act.athlete_id
      WHERE a.challenge_id = ?
      ORDER BY act.date ASC, act.created_at ASC, act.id ASC
    `),
    challengeProgress: db.prepare(`
      SELECT c.id, c.goal_km, COALESCE(SUM(act.km), 0) AS total_km
      FROM challenges c
      LEFT JOIN athletes a ON a.challenge_id = c.id
      LEFT JOIN activities act ON act.athlete_id = a.id
      WHERE c.id = ? AND c.user_id = ?
      GROUP BY c.id
    `),

    getEnrollmentByAthlete: db.prepare('SELECT * FROM enrollments WHERE athlete_id = ?'),
    deleteInstallmentsByEnrollment: db.prepare('DELETE FROM installments WHERE enrollment_id = ?'),
    insertEnrollment: db.prepare('INSERT INTO enrollments (athlete_id, total_amount_cents, payment_type, installments_count, first_due_date) VALUES (?, ?, ?, ?, ?)'),
    updateEnrollment: db.prepare('UPDATE enrollments SET total_amount_cents = ?, payment_type = ?, installments_count = ?, first_due_date = ? WHERE id = ?'),
    insertInstallment: db.prepare(`
      INSERT INTO installments (enrollment_id, installment_number, due_date, amount_cents, paid_at, note, updated_at)
      VALUES (?, ?, ?, ?, NULL, '', CURRENT_TIMESTAMP)
    `),
    listInstallmentsByAthlete: db.prepare(`
      SELECT i.*, e.total_amount_cents, e.payment_type, e.installments_count, e.first_due_date
      FROM installments i
      JOIN enrollments e ON e.id = i.enrollment_id
      JOIN athletes a ON a.id = e.athlete_id
      JOIN challenges c ON c.id = a.challenge_id
      WHERE a.id = ? AND c.user_id = ?
      ORDER BY i.installment_number ASC
    `),
    getInstallmentWithOwnership: db.prepare(`
      SELECT i.*, e.athlete_id, a.challenge_id, c.user_id
      FROM installments i
      JOIN enrollments e ON e.id = i.enrollment_id
      JOIN athletes a ON a.id = e.athlete_id
      JOIN challenges c ON c.id = a.challenge_id
      WHERE i.id = ?
    `),
    markInstallmentPaid: db.prepare('UPDATE installments SET paid_at = ?, note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
    clearInstallmentPaid: db.prepare('UPDATE installments SET paid_at = NULL, note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),

    overdueInstallmentsByAthlete: db.prepare(`
      SELECT i.id, i.installment_number, i.due_date, i.amount_cents
      FROM installments i
      JOIN enrollments e ON e.id = i.enrollment_id
      WHERE e.athlete_id = ? AND i.paid_at IS NULL AND i.due_date < ?
      ORDER BY i.due_date ASC
    `),
    listPendencies: db.prepare(`
      SELECT a.id AS athlete_id, a.name AS athlete_name, c.id AS challenge_id, c.title AS challenge_title,
      i.id AS installment_id, i.installment_number, i.due_date, i.amount_cents
      FROM installments i
      JOIN enrollments e ON e.id = i.enrollment_id
      JOIN athletes a ON a.id = e.athlete_id
      JOIN challenges c ON c.id = a.challenge_id
      WHERE c.user_id = ? AND (? IS NULL OR c.id = ?) AND i.paid_at IS NULL AND i.due_date < ?
      ORDER BY i.due_date ASC, a.name COLLATE NOCASE ASC
    `),
    financeInstallmentsByFilter: db.prepare(`
      SELECT i.id, i.installment_number, i.due_date, i.amount_cents, i.paid_at, i.note,
      a.id AS athlete_id, a.name AS athlete_name, c.id AS challenge_id, c.title AS challenge_title
      FROM installments i
      JOIN enrollments e ON e.id = i.enrollment_id
      JOIN athletes a ON a.id = e.athlete_id
      JOIN challenges c ON c.id = a.challenge_id
      WHERE c.user_id = ?
      AND (? IS NULL OR c.id = ?)
      AND (? IS NULL OR i.due_date >= ?)
      AND (? IS NULL OR i.due_date <= ?)
      ORDER BY i.due_date ASC, a.name COLLATE NOCASE ASC
    `),
    paidInstallmentsByFilter: db.prepare(`
      SELECT i.id, i.installment_number, i.due_date, i.amount_cents, i.paid_at, i.note,
      a.id AS athlete_id, a.name AS athlete_name, c.id AS challenge_id, c.title AS challenge_title
      FROM installments i
      JOIN enrollments e ON e.id = i.enrollment_id
      JOIN athletes a ON a.id = e.athlete_id
      JOIN challenges c ON c.id = a.challenge_id
      WHERE c.user_id = ?
      AND (? IS NULL OR c.id = ?)
      AND i.paid_at IS NOT NULL
      AND (? IS NULL OR i.paid_at >= ?)
      AND (? IS NULL OR i.paid_at <= ?)
      ORDER BY i.paid_at DESC
    `)
  };

  function ensureChallengeOwner(challengeId, userId) {
    const challenge = statements.getChallenge.get(challengeId, userId);
    if (!challenge) throw new AppError('Desafio não encontrado ou sem permissão.', 'FORBIDDEN');
    return challenge;
  }

  function ensureAthleteOwner(athleteId, userId) {
    const owner = statements.challengeOwnerByAthlete.get(athleteId);
    if (!owner || owner.user_id !== userId) throw new AppError('Atleta não encontrado ou sem permissão.', 'FORBIDDEN');
    return owner;
  }

  function parseEnrollmentInput(input) {
    if (!input) throw new AppError('Dados de inscrição são obrigatórios.');
    const totalAmount = toNumber(input.totalAmount, 'Valor total da inscrição', 0.01);
    const totalAmountCents = Math.round(totalAmount * 100);
    const paymentType = input.paymentType === 'cash' ? 'cash' : input.paymentType === 'installments' ? 'installments' : null;
    if (!paymentType) throw new AppError('Forma de pagamento inválida.');
    const installmentsCount = paymentType === 'cash' ? 1 : toInt(input.installmentsCount, 'Quantidade de parcelas', 2, 12);
    const firstDueDate = requireDate(input.firstDueDate, 'Data da primeira parcela');
    return { totalAmountCents, paymentType, installmentsCount, firstDueDate };
  }

  function upsertEnrollmentForAthlete(athleteId, enrollmentInput) {
    const parsed = parseEnrollmentInput(enrollmentInput);
    const existing = statements.getEnrollmentByAthlete.get(athleteId);
    let enrollmentId = null;
    if (existing) {
      statements.updateEnrollment.run(parsed.totalAmountCents, parsed.paymentType, parsed.installmentsCount, parsed.firstDueDate, existing.id);
      statements.deleteInstallmentsByEnrollment.run(existing.id);
      enrollmentId = existing.id;
    } else {
      const result = statements.insertEnrollment.run(
        athleteId,
        parsed.totalAmountCents,
        parsed.paymentType,
        parsed.installmentsCount,
        parsed.firstDueDate
      );
      enrollmentId = result.lastInsertRowid;
    }

    const parts = splitAmount(parsed.totalAmountCents, parsed.installmentsCount);
    for (let i = 0; i < parsed.installmentsCount; i += 1) {
      statements.insertInstallment.run(enrollmentId, i + 1, addMonths(parsed.firstDueDate, i), parts[i]);
    }
    return statements.getEnrollmentByAthlete.get(athleteId);
  }

  function computeInstallmentStatus(row, todayIso) {
    if (row.paid_at) return { code: 'PAGO', label: 'Pago', overdueDays: 0, blocked: false };
    if (todayIso <= row.due_date) return { code: 'EM_ABERTO', label: 'Em aberto', overdueDays: 0, blocked: false };
    const overdueDays = daysBetween(row.due_date, todayIso);
    if (overdueDays > 10) return { code: 'BLOQUEADO', label: 'Bloqueado', overdueDays, blocked: true };
    if (overdueDays > 1) return { code: 'VENCIDO_X_DIAS', label: `Vencido há ${overdueDays} dias`, overdueDays, blocked: false };
    return { code: 'VENCIDO', label: 'Vencido', overdueDays, blocked: false };
  }

  function athletePaymentStatus(userId, athleteId) {
    ensureAthleteOwner(athleteId, userId);
    const todayIso = dateToLocalIsoToday();
    const overdueRows = statements.overdueInstallmentsByAthlete.all(athleteId, todayIso);
    if (overdueRows.length === 0) {
      return {
        statusCode: 'EM_DIA',
        label: 'Em dia',
        blocked: false,
        maxOverdueDays: 0,
        blockReason: null
      };
    }
    const maxOverdue = overdueRows.reduce((max, row) => Math.max(max, daysBetween(row.due_date, todayIso)), 0);
    if (maxOverdue > 10) {
      return {
        statusCode: 'BLOQUEADO',
        label: 'Bloqueado por inadimplência',
        blocked: true,
        maxOverdueDays: maxOverdue,
        blockReason: `Existe parcela vencida há ${maxOverdue} dias (acima da tolerância de 10 dias).`
      };
    }
    return {
      statusCode: 'ATRASO_TOLERANCIA',
      label: `Atrasado ${maxOverdue} dia(s)`,
      blocked: false,
      maxOverdueDays: maxOverdue,
      blockReason: null
    };
  }

  function assertAthleteCanRegisterKm(userId, athleteId) {
    const status = athletePaymentStatus(userId, athleteId);
    if (status.blocked) throw new AppError('Atleta bloqueado por inadimplência: parcela vencida há mais de 10 dias.', 'PAYMENT_BLOCKED');
    return status;
  }

  function listInstallments(userId, athleteId) {
    const todayIso = dateToLocalIsoToday();
    const rows = statements.listInstallmentsByAthlete.all(athleteId, userId);
    return rows.map((row) => {
      const status = computeInstallmentStatus(row, todayIso);
      return {
        ...row,
        statusCode: status.code,
        statusLabel: status.label,
        overdueDays: status.overdueDays,
        blocked: status.blocked
      };
    });
  }

  function registerUser(input) {
    const name = requireText(input.name, 'Nome');
    const username = requireText(input.username, 'Usuário').toLowerCase().replace(/\s+/g, '_');
    const email = `${username}@local.challengeapp`;
    const password = requireText(input.password, 'Senha');
    if (password.length < 6) throw new AppError('A senha deve ter pelo menos 6 caracteres.');
    if (username.length < 3) throw new AppError('Usuário deve ter ao menos 3 caracteres.');
    if (!/^[a-z0-9._-]+$/.test(username)) throw new AppError('Usuário deve conter apenas letras minúsculas, números, ponto, underline ou hífen.');
    if (statements.getUserByUsername.get(username)) throw new AppError('Usuário já cadastrado.', 'CONFLICT');
    if (statements.getUserByEmail.get(email)) throw new AppError('E-mail já cadastrado.', 'CONFLICT');
    const hash = bcrypt.hashSync(password, 10);
    const result = statements.createUser.run(name, username, email, hash);
    return statements.getUserById.get(result.lastInsertRowid);
  }

  function login(input) {
    const username = requireText(input.username || input.email, 'Usuário').toLowerCase();
    const password = requireText(input.password, 'Senha');
    const user = statements.getUserByUsername.get(username) || statements.getUserByEmail.get(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) throw new AppError('Credenciais inválidas.', 'UNAUTHORIZED');
    return statements.getUserById.get(user.id);
  }

  function updateUserProfile(userId, input) {
    const current = statements.getUserById.get(userId);
    if (!current) throw new AppError('Usuário não encontrado.', 'FORBIDDEN');
    const name = requireText(input.name, 'Nome');
    const username = requireText(input.username, 'Usuário').toLowerCase().replace(/\s+/g, '_');
    if (username.length < 3) throw new AppError('Usuário deve ter ao menos 3 caracteres.');
    if (!/^[a-z0-9._-]+$/.test(username)) throw new AppError('Usuário deve conter apenas letras minúsculas, números, ponto, underline ou hífen.');
    const existing = statements.getUserByUsername.get(username);
    if (existing && Number(existing.id) !== Number(userId)) throw new AppError('Usuário já em uso.', 'CONFLICT');

    let passwordHash = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId).password_hash;
    if (input.newPassword) {
      const newPassword = requireText(input.newPassword, 'Nova senha');
      if (newPassword.length < 6) throw new AppError('Nova senha deve ter pelo menos 6 caracteres.');
      passwordHash = bcrypt.hashSync(newPassword, 10);
    }

    statements.updateUserProfile.run(name, username, passwordHash, userId);
    return statements.getUserById.get(userId);
  }

  function listChallenges(userId) {
    return statements.listChallenges.all(userId);
  }

  function createChallenge(userId, input) {
    const title = requireText(input.title, 'Título');
    const description = (input.description || '').trim();
    const goalKm = toNumber(input.goalKm, 'Meta (km)', 0);
    const startDate = requireDate(input.startDate, 'Data de início');
    const endDate = requireDate(input.endDate, 'Data limite');
    if (endDate < startDate) throw new AppError('Data limite deve ser maior ou igual à data de início.');
    const result = statements.createChallenge.run(userId, title, description, goalKm, startDate, endDate);
    return statements.getChallenge.get(result.lastInsertRowid, userId);
  }

  function updateChallenge(userId, challengeId, input) {
    ensureChallengeOwner(challengeId, userId);
    const title = requireText(input.title, 'Título');
    const description = (input.description || '').trim();
    const goalKm = toNumber(input.goalKm, 'Meta (km)', 0);
    const startDate = requireDate(input.startDate, 'Data de início');
    const endDate = requireDate(input.endDate, 'Data limite');
    if (endDate < startDate) throw new AppError('Data limite deve ser maior ou igual à data de início.');
    statements.updateChallenge.run(title, description, goalKm, startDate, endDate, challengeId, userId);
    return statements.getChallenge.get(challengeId, userId);
  }

  function deleteChallenge(userId, challengeId) {
    const result = statements.deleteChallenge.run(challengeId, userId);
    if (!result.changes) throw new AppError('Desafio não encontrado ou sem permissão.', 'FORBIDDEN');
    return { success: true };
  }

  function listAthletes(userId, challengeId, filter = '') {
    ensureChallengeOwner(challengeId, userId);
    const search = `%${String(filter).trim().toLowerCase()}%`;
    return statements.listAthletes.all(challengeId, search).map((row) => {
      const pay = athletePaymentStatus(userId, row.id);
      return { ...row, payment_status: pay };
    });
  }

  function createAthlete(userId, challengeId, input) {
    ensureChallengeOwner(challengeId, userId);
    const name = requireText(input.name, 'Nome do atleta');
    const phone = (input.phone || '').trim();
    const bibNumber = (input.bibNumber || '').trim();
    const birthDate = input.birthDate ? requireDate(input.birthDate, 'Data de nascimento') : null;
    const gender = (input.gender || '').trim();
    const shirtSize = (input.shirtSize || '').trim();
    const personalGoalKm = input.personalGoalKm === '' || input.personalGoalKm === null || input.personalGoalKm === undefined ? null : toNumber(input.personalGoalKm, 'Meta individual (km)', 0);
    const enrollmentInput = input.enrollment;
    if (!enrollmentInput) throw new AppError('Dados de inscrição são obrigatórios.');

    const trx = db.transaction(() => {
      const result = statements.createAthlete.run(challengeId, name, phone, bibNumber, birthDate, gender, shirtSize, personalGoalKm);
      const athleteId = result.lastInsertRowid;
      upsertEnrollmentForAthlete(athleteId, enrollmentInput);
      return statements.getAthlete.get(athleteId, challengeId);
    });
    return trx();
  }

  function updateAthlete(userId, challengeId, athleteId, input) {
    ensureChallengeOwner(challengeId, userId);
    const existing = statements.getAthlete.get(athleteId, challengeId);
    if (!existing) throw new AppError('Atleta não encontrado.');
    const name = requireText(input.name, 'Nome do atleta');
    const phone = (input.phone || '').trim();
    const bibNumber = (input.bibNumber || '').trim();
    const birthDate = input.birthDate ? requireDate(input.birthDate, 'Data de nascimento') : null;
    const gender = (input.gender || '').trim();
    const shirtSize = (input.shirtSize || '').trim();
    const personalGoalKm = input.personalGoalKm === '' || input.personalGoalKm === null || input.personalGoalKm === undefined ? null : toNumber(input.personalGoalKm, 'Meta individual (km)', 0);
    const enrollmentInput = input.enrollment;
    if (!enrollmentInput) throw new AppError('Dados de inscrição são obrigatórios.');

    const trx = db.transaction(() => {
      statements.updateAthlete.run(name, phone, bibNumber, birthDate, gender, shirtSize, personalGoalKm, athleteId, challengeId);
      upsertEnrollmentForAthlete(athleteId, enrollmentInput);
      return statements.getAthlete.get(athleteId, challengeId);
    });
    return trx();
  }

  function deleteAthlete(userId, challengeId, athleteId) {
    ensureChallengeOwner(challengeId, userId);
    const result = statements.deleteAthlete.run(athleteId, challengeId);
    if (!result.changes) throw new AppError('Atleta não encontrado.');
    return { success: true };
  }

  function saveEnrollmentPlan(userId, athleteId, input) {
    ensureAthleteOwner(athleteId, userId);
    const trx = db.transaction(() => upsertEnrollmentForAthlete(athleteId, input));
    const enrollment = trx();
    return { enrollment };
  }

  function getAthletePayments(userId, athleteId) {
    const owner = ensureAthleteOwner(athleteId, userId);
    const enrollment = statements.getEnrollmentByAthlete.get(athleteId);
    if (!enrollment) throw new AppError('Atleta sem inscrição financeira cadastrada.');
    const installments = listInstallments(userId, athleteId);
    const status = athletePaymentStatus(userId, athleteId);
    return { enrollment, installments, paymentStatus: status, challengeId: owner.challenge_id };
  }

  function setInstallmentPaid(userId, installmentId, input) {
    const row = statements.getInstallmentWithOwnership.get(Number(installmentId));
    if (!row || row.user_id !== userId) throw new AppError('Parcela não encontrada ou sem permissão.', 'FORBIDDEN');
    const paidAt = input.paidAt ? requireDate(input.paidAt, 'Data de pagamento') : dateToLocalIsoToday();
    const note = (input.note || '').trim();
    statements.markInstallmentPaid.run(paidAt, note, Number(installmentId));
    return { success: true };
  }

  function setInstallmentOpen(userId, installmentId, input) {
    const row = statements.getInstallmentWithOwnership.get(Number(installmentId));
    if (!row || row.user_id !== userId) throw new AppError('Parcela não encontrada ou sem permissão.', 'FORBIDDEN');
    const note = (input.note || '').trim();
    statements.clearInstallmentPaid.run(note, Number(installmentId));
    return { success: true };
  }

  function createActivity(userId, input) {
    const athleteId = Number(input.athleteId);
    if (!athleteId) throw new AppError('Selecione um atleta.');
    const owner = ensureAthleteOwner(athleteId, userId);
    const paymentCheck = assertAthleteCanRegisterKm(userId, athleteId);
    const date = requireDate(input.date, 'Data');
    const km = toNumber(input.km, 'Quilometragem', 0.01);
    const note = (input.note || '').trim();
    const result = statements.createActivity.run(athleteId, date, km, note);
    return { id: result.lastInsertRowid, challengeId: owner.challenge_id, paymentCheck };
  }

  function listActivitiesByChallenge(userId, challengeId) {
    ensureChallengeOwner(challengeId, userId);
    return statements.listActivitiesByChallenge.all(challengeId, userId);
  }

  function ranking(userId, challengeId) {
    const challenge = ensureChallengeOwner(challengeId, userId);
    const goalKm = Number(challenge.goal_km || 0);
    const baseRows = statements.rankingBase.all(challengeId).map((row) => ({
      ...row,
      total_km: Number(row.total_km || 0),
      reached_goal_at: null
    }));

    if (goalKm > 0) {
      const byAthlete = new Map(baseRows.map((row) => [row.id, row]));
      const cumulativeByAthlete = new Map();
      const activityRows = statements.rankingActivities.all(challengeId);

      for (const activity of activityRows) {
        const athleteId = Number(activity.athlete_id);
        const row = byAthlete.get(athleteId);
        if (!row || row.reached_goal_at) continue;

        const prev = cumulativeByAthlete.get(athleteId) || 0;
        const next = prev + Number(activity.km || 0);
        cumulativeByAthlete.set(athleteId, next);
        if (next >= goalKm) {
          row.reached_goal_at = `${activity.date} ${activity.created_at || ''}`.trim();
        }
      }
    }

    baseRows.sort((a, b) => {
      if (b.total_km !== a.total_km) return b.total_km - a.total_km;

      const aReached = !!a.reached_goal_at;
      const bReached = !!b.reached_goal_at;
      if (aReached && bReached) {
        if (a.reached_goal_at !== b.reached_goal_at) return a.reached_goal_at < b.reached_goal_at ? -1 : 1;
      } else if (aReached !== bReached) {
        return aReached ? -1 : 1;
      }

      const aLast = a.last_activity_date || '9999-12-31';
      const bLast = b.last_activity_date || '9999-12-31';
      if (aLast !== bLast) return aLast < bLast ? -1 : 1;
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });

    return baseRows;
  }

  function progress(userId, challengeId) {
    const row = statements.challengeProgress.get(challengeId, userId);
    if (!row) throw new AppError('Desafio não encontrado ou sem permissão.', 'FORBIDDEN');
    const goal = Number(row.goal_km || 0);
    const total = Number(row.total_km || 0);
    return { goalKm: goal, totalKm: total, percent: goal > 0 ? Math.min(100, (total / goal) * 100) : 0 };
  }

  function activitiesCsvRows(userId, challengeId) {
    ensureChallengeOwner(challengeId, userId);
    return statements.listActivitiesByAthlete.all(challengeId);
  }

  function listPaymentPendencies(userId, challengeId = null) {
    const todayIso = dateToLocalIsoToday();
    const rows = statements.listPendencies.all(userId, challengeId, challengeId, todayIso);
    return rows.map((row) => {
      const overdueDays = daysBetween(row.due_date, todayIso);
      const blocked = overdueDays > 10;
      return {
        ...row,
        overdueDays,
        severity: blocked ? 'blocked' : 'warning',
        statusLabel: blocked ? `Bloqueado (${overdueDays} dias)` : `Vencido há ${overdueDays} dias`
      };
    });
  }

  function financeSummary(userId, input = {}) {
    const challengeId = input.challengeId ? Number(input.challengeId) : null;
    const startDate = input.startDate || null;
    const endDate = input.endDate || null;
    const todayIso = dateToLocalIsoToday();
    const installments = statements.financeInstallmentsByFilter.all(userId, challengeId, challengeId, startDate, startDate, endDate, endDate);
    const paidList = statements.paidInstallmentsByFilter.all(userId, challengeId, challengeId, startDate, startDate, endDate, endDate);

    const totalExpectedCents = installments.reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
    const totalReceivedCents = installments.reduce((sum, row) => sum + (row.paid_at ? Number(row.amount_cents || 0) : 0), 0);
    const totalOpenCents = totalExpectedCents - totalReceivedCents;

    const overdueUnpaid = installments.filter((row) => !row.paid_at && row.due_date < todayIso);
    const delinquentValueCents = overdueUnpaid.reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
    const delinquentAthletesCount = new Set(overdueUnpaid.map((row) => row.athlete_id)).size;

    return {
      totals: {
        totalExpectedCents,
        totalReceivedCents,
        totalOpenCents,
        delinquentAthletesCount,
        delinquentValueCents
      },
      paidInstallments: paidList,
      overdueInstallments: overdueUnpaid.map((row) => ({
        ...row,
        overdueDays: daysBetween(row.due_date, todayIso),
        blocked: daysBetween(row.due_date, todayIso) > 10
      }))
    };
  }

  return {
    AppError,
    registerUser,
    login,
    updateUserProfile,
    listChallenges,
    createChallenge,
    updateChallenge,
    deleteChallenge,
    listAthletes,
    createAthlete,
    updateAthlete,
    deleteAthlete,
    saveEnrollmentPlan,
    getAthletePayments,
    setInstallmentPaid,
    setInstallmentOpen,
    athletePaymentStatus,
    listPaymentPendencies,
    financeSummary,
    createActivity,
    listActivitiesByChallenge,
    ranking,
    progress,
    activitiesCsvRows,
    ensureChallengeOwner
  };
}

module.exports = { createServices, AppError };


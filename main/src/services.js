const bcrypt = require('bcryptjs');

class AppError extends Error {
  constructor(message, code = 'APP_ERROR') {
    super(message);
    this.code = code;
  }
}

function toNumber(value, fieldName, min = null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AppError(`${fieldName} inválido.`);
  }
  if (min !== null && parsed < min) {
    throw new AppError(`${fieldName} deve ser maior ou igual a ${min}.`);
  }
  return parsed;
}

function requireText(value, fieldName) {
  if (!value || typeof value !== 'string' || !value.trim()) {
    throw new AppError(`${fieldName} é obrigatório.`);
  }
  return value.trim();
}

function requireDate(value, fieldName) {
  const text = requireText(value, fieldName);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new AppError(`${fieldName} deve estar no formato AAAA-MM-DD.`);
  }
  return text;
}

function createServices(db) {
  const statements = {
    createUser: db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)'),
    getUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    getUserById: db.prepare('SELECT id, name, email, created_at FROM users WHERE id = ?'),

    listChallenges: db.prepare(`
      SELECT c.*,
      COALESCE(SUM(act.km), 0) AS total_km,
      COUNT(DISTINCT a.id) AS athletes_count
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
    createAthlete: db.prepare('INSERT INTO athletes (challenge_id, name, phone, bib_number, personal_goal_km) VALUES (?, ?, ?, ?, ?)'),
    updateAthlete: db.prepare('UPDATE athletes SET name = ?, phone = ?, bib_number = ?, personal_goal_km = ? WHERE id = ? AND challenge_id = ?'),
    deleteAthlete: db.prepare('DELETE FROM athletes WHERE id = ? AND challenge_id = ?'),

    challengeOwnerByAthlete: db.prepare(`
      SELECT c.user_id, c.id AS challenge_id
      FROM athletes a
      JOIN challenges c ON c.id = a.challenge_id
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

    ranking: db.prepare(`
      SELECT a.id, a.name, a.phone, a.bib_number, a.personal_goal_km,
      COALESCE(SUM(act.km), 0) AS total_km,
      MAX(act.date) AS last_activity_date
      FROM athletes a
      LEFT JOIN activities act ON act.athlete_id = a.id
      WHERE a.challenge_id = ?
      GROUP BY a.id
      ORDER BY total_km DESC,
      CASE WHEN last_activity_date IS NULL THEN 1 ELSE 0 END ASC,
      last_activity_date ASC,
      a.created_at ASC
    `),

    challengeProgress: db.prepare(`
      SELECT c.id, c.goal_km, COALESCE(SUM(act.km), 0) AS total_km
      FROM challenges c
      LEFT JOIN athletes a ON a.challenge_id = c.id
      LEFT JOIN activities act ON act.athlete_id = a.id
      WHERE c.id = ? AND c.user_id = ?
      GROUP BY c.id
    `)
  };

  function ensureChallengeOwner(challengeId, userId) {
    const challenge = statements.getChallenge.get(challengeId, userId);
    if (!challenge) {
      throw new AppError('Desafio não encontrado ou sem permissão.', 'FORBIDDEN');
    }
    return challenge;
  }

  function registerUser(input) {
    const name = requireText(input.name, 'Nome');
    const email = requireText(input.email, 'E-mail').toLowerCase();
    const password = requireText(input.password, 'Senha');
    if (password.length < 6) {
      throw new AppError('A senha deve ter pelo menos 6 caracteres.');
    }
    if (statements.getUserByEmail.get(email)) {
      throw new AppError('E-mail já cadastrado.', 'CONFLICT');
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = statements.createUser.run(name, email, hash);
    return statements.getUserById.get(result.lastInsertRowid);
  }

  function login(input) {
    const email = requireText(input.email, 'E-mail').toLowerCase();
    const password = requireText(input.password, 'Senha');
    const user = statements.getUserByEmail.get(email);
    if (!user) {
      throw new AppError('Credenciais inválidas.', 'UNAUTHORIZED');
    }
    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      throw new AppError('Credenciais inválidas.', 'UNAUTHORIZED');
    }
    return statements.getUserById.get(user.id);
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
    if (endDate < startDate) {
      throw new AppError('Data limite deve ser maior ou igual à data de início.');
    }

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
    if (endDate < startDate) {
      throw new AppError('Data limite deve ser maior ou igual à data de início.');
    }

    statements.updateChallenge.run(title, description, goalKm, startDate, endDate, challengeId, userId);
    return statements.getChallenge.get(challengeId, userId);
  }

  function deleteChallenge(userId, challengeId) {
    const result = statements.deleteChallenge.run(challengeId, userId);
    if (!result.changes) {
      throw new AppError('Desafio não encontrado ou sem permissão.', 'FORBIDDEN');
    }
    return { success: true };
  }

  function listAthletes(userId, challengeId, filter = '') {
    ensureChallengeOwner(challengeId, userId);
    const search = `%${String(filter).trim().toLowerCase()}%`;
    return statements.listAthletes.all(challengeId, search);
  }

  function createAthlete(userId, challengeId, input) {
    ensureChallengeOwner(challengeId, userId);
    const name = requireText(input.name, 'Nome do atleta');
    const phone = (input.phone || '').trim();
    const bibNumber = (input.bibNumber || '').trim();
    const personalGoalKm = input.personalGoalKm === '' || input.personalGoalKm === null || input.personalGoalKm === undefined
      ? null
      : toNumber(input.personalGoalKm, 'Meta individual (km)', 0);

    const result = statements.createAthlete.run(challengeId, name, phone, bibNumber, personalGoalKm);
    return statements.getAthlete.get(result.lastInsertRowid, challengeId);
  }

  function updateAthlete(userId, challengeId, athleteId, input) {
    ensureChallengeOwner(challengeId, userId);
    const existing = statements.getAthlete.get(athleteId, challengeId);
    if (!existing) {
      throw new AppError('Atleta não encontrado.');
    }

    const name = requireText(input.name, 'Nome do atleta');
    const phone = (input.phone || '').trim();
    const bibNumber = (input.bibNumber || '').trim();
    const personalGoalKm = input.personalGoalKm === '' || input.personalGoalKm === null || input.personalGoalKm === undefined
      ? null
      : toNumber(input.personalGoalKm, 'Meta individual (km)', 0);

    statements.updateAthlete.run(name, phone, bibNumber, personalGoalKm, athleteId, challengeId);
    return statements.getAthlete.get(athleteId, challengeId);
  }

  function deleteAthlete(userId, challengeId, athleteId) {
    ensureChallengeOwner(challengeId, userId);
    const result = statements.deleteAthlete.run(athleteId, challengeId);
    if (!result.changes) {
      throw new AppError('Atleta não encontrado.');
    }
    return { success: true };
  }

  function createActivity(userId, input) {
    const athleteId = Number(input.athleteId);
    if (!athleteId) {
      throw new AppError('Selecione um atleta.');
    }
    const owner = statements.challengeOwnerByAthlete.get(athleteId);
    if (!owner || owner.user_id !== userId) {
      throw new AppError('Atleta não encontrado ou sem permissão.', 'FORBIDDEN');
    }

    const date = requireDate(input.date, 'Data');
    const km = toNumber(input.km, 'Quilometragem', 0.01);
    const note = (input.note || '').trim();

    const result = statements.createActivity.run(athleteId, date, km, note);
    return { id: result.lastInsertRowid, challengeId: owner.challenge_id };
  }

  function listActivitiesByChallenge(userId, challengeId) {
    ensureChallengeOwner(challengeId, userId);
    return statements.listActivitiesByChallenge.all(challengeId, userId);
  }

  function ranking(userId, challengeId) {
    ensureChallengeOwner(challengeId, userId);
    return statements.ranking.all(challengeId);
  }

  function progress(userId, challengeId) {
    const row = statements.challengeProgress.get(challengeId, userId);
    if (!row) {
      throw new AppError('Desafio não encontrado ou sem permissão.', 'FORBIDDEN');
    }
    const goal = Number(row.goal_km || 0);
    const total = Number(row.total_km || 0);
    return {
      goalKm: goal,
      totalKm: total,
      percent: goal > 0 ? Math.min(100, (total / goal) * 100) : 0
    };
  }

  function activitiesCsvRows(userId, challengeId) {
    ensureChallengeOwner(challengeId, userId);
    return statements.listActivitiesByAthlete.all(challengeId);
  }

  return {
    AppError,
    registerUser,
    login,
    listChallenges,
    createChallenge,
    updateChallenge,
    deleteChallenge,
    listAthletes,
    createAthlete,
    updateAthlete,
    deleteAthlete,
    createActivity,
    listActivitiesByChallenge,
    ranking,
    progress,
    activitiesCsvRows,
    ensureChallengeOwner
  };
}

module.exports = {
  createServices,
  AppError
};

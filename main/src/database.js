const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

function initializeDatabase(userDataPath) {
  const dbDir = path.join(userDataPath, 'database');
  fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, 'desafios.db');

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      goal_km REAL NOT NULL DEFAULT 0,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS athletes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenge_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      bib_number TEXT,
      birth_date TEXT,
      gender TEXT,
      shirt_size TEXT,
      personal_goal_km REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      km REAL NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_id INTEGER NOT NULL UNIQUE,
      total_amount_cents INTEGER NOT NULL,
      payment_type TEXT NOT NULL CHECK(payment_type IN ('cash', 'installments')),
      installments_count INTEGER NOT NULL,
      first_due_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS installments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      enrollment_id INTEGER NOT NULL,
      installment_number INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      paid_at TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_challenges_user_id ON challenges(user_id);
    CREATE INDEX IF NOT EXISTS idx_athletes_challenge_id ON athletes(challenge_id);
    CREATE INDEX IF NOT EXISTS idx_activities_athlete_id ON activities(athlete_id);
    CREATE INDEX IF NOT EXISTS idx_enrollments_athlete_id ON enrollments(athlete_id);
    CREATE INDEX IF NOT EXISTS idx_installments_enrollment_id ON installments(enrollment_id);
    CREATE INDEX IF NOT EXISTS idx_installments_due_date ON installments(due_date);
  `);

  const athleteColumns = db.prepare('PRAGMA table_info(athletes)').all().map((c) => c.name);
  if (!athleteColumns.includes('birth_date')) db.exec('ALTER TABLE athletes ADD COLUMN birth_date TEXT');
  if (!athleteColumns.includes('gender')) db.exec('ALTER TABLE athletes ADD COLUMN gender TEXT');
  if (!athleteColumns.includes('shirt_size')) db.exec('ALTER TABLE athletes ADD COLUMN shirt_size TEXT');

  const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!userColumns.includes('username')) db.exec('ALTER TABLE users ADD COLUMN username TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)');

  const usersWithoutUsername = db.prepare("SELECT id, name, email FROM users WHERE username IS NULL OR TRIM(username) = ''").all();
  const setUsername = db.prepare('UPDATE users SET username = ? WHERE id = ?');
  const usernameExists = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?');
  for (const u of usersWithoutUsername) {
    const fromEmail = String(u.email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '');
    const fromName = String(u.name || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const base = (fromEmail || fromName || `organizador_${u.id}`).slice(0, 24) || `organizador_${u.id}`;
    let candidate = base;
    let i = 1;
    while (usernameExists.get(candidate, u.id)) {
      candidate = `${base}_${i}`;
      i += 1;
    }
    setUsername.run(candidate, u.id);
  }

  return { db, dbPath };
}

module.exports = {
  initializeDatabase
};

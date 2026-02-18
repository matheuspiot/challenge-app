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

    CREATE INDEX IF NOT EXISTS idx_challenges_user_id ON challenges(user_id);
    CREATE INDEX IF NOT EXISTS idx_athletes_challenge_id ON athletes(challenge_id);
    CREATE INDEX IF NOT EXISTS idx_activities_athlete_id ON activities(athlete_id);
  `);

  return { db, dbPath };
}

module.exports = {
  initializeDatabase
};

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const { initializeDatabase } = require('./database');
const { createServices, AppError } = require('./services');
const logger = require('./logger');

const isDev = !app.isPackaged;
let mainWindow = null;
let dbCtx = null;
let services = null;

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(headers, rows) {
  const headerLine = headers.map((h) => csvEscape(h.label)).join(',');
  const body = rows.map((row) => headers.map((h) => csvEscape(row[h.key])).join(',')).join('\n');
  return `${headerLine}\n${body}`;
}

function initDb() {
  if (dbCtx?.db) {
    dbCtx.db.close();
  }
  dbCtx = initializeDatabase(app.getPath('userData'));
  services = createServices(dbCtx.db);
  logger.info('Banco inicializado', { dbPath: dbCtx.dbPath });
}

function asUserId(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new AppError('Usuário inválido.', 'UNAUTHORIZED');
  }
  return value;
}

function handle(channel, action) {
  ipcMain.handle(channel, async (_event, payload = {}) => {
    try {
      return await action(payload);
    } catch (error) {
      const code = error.code || 'APP_ERROR';
      const message = error.message || 'Erro inesperado.';
      logger.error(`Falha em ${channel}`, { message, code, payload });
      return { error: { code, message } };
    }
  });
}

function setupIpcHandlers() {
  handle('auth:register', (payload) => {
    const user = services.registerUser(payload);
    return { user };
  });

  handle('auth:login', (payload) => {
    const user = services.login(payload);
    return { user };
  });

  handle('challenges:list', ({ userId }) => {
    return { challenges: services.listChallenges(asUserId(userId)) };
  });

  handle('challenges:create', ({ userId, challenge }) => {
    const saved = services.createChallenge(asUserId(userId), challenge || {});
    return { challenge: saved };
  });

  handle('challenges:update', ({ userId, challengeId, challenge }) => {
    const saved = services.updateChallenge(asUserId(userId), Number(challengeId), challenge || {});
    return { challenge: saved };
  });

  handle('challenges:delete', ({ userId, challengeId }) => {
    return services.deleteChallenge(asUserId(userId), Number(challengeId));
  });

  handle('athletes:list', ({ userId, challengeId, filter }) => {
    const athletes = services.listAthletes(asUserId(userId), Number(challengeId), filter || '');
    return { athletes };
  });

  handle('athletes:create', ({ userId, challengeId, athlete }) => {
    const saved = services.createAthlete(asUserId(userId), Number(challengeId), athlete || {});
    return { athlete: saved };
  });

  handle('athletes:update', ({ userId, challengeId, athleteId, athlete }) => {
    const saved = services.updateAthlete(asUserId(userId), Number(challengeId), Number(athleteId), athlete || {});
    return { athlete: saved };
  });

  handle('athletes:delete', ({ userId, challengeId, athleteId }) => {
    return services.deleteAthlete(asUserId(userId), Number(challengeId), Number(athleteId));
  });

  handle('activities:create', ({ userId, activity }) => {
    const created = services.createActivity(asUserId(userId), activity || {});
    return { activity: created };
  });

  handle('activities:list', ({ userId, challengeId }) => {
    const activities = services.listActivitiesByChallenge(asUserId(userId), Number(challengeId));
    return { activities };
  });

  handle('ranking:get', ({ userId, challengeId }) => {
    const ranking = services.ranking(asUserId(userId), Number(challengeId));
    return { ranking };
  });

  handle('progress:get', ({ userId, challengeId }) => {
    const progress = services.progress(asUserId(userId), Number(challengeId));
    return { progress };
  });

  handle('export:ranking-csv', async ({ userId, challengeId, challengeTitle }) => {
    const ranking = services.ranking(asUserId(userId), Number(challengeId));
    const headers = [
      { key: 'position', label: 'Posicao' },
      { key: 'name', label: 'Atleta' },
      { key: 'total_km', label: 'Km Total' },
      { key: 'last_activity_date', label: 'Ultimo Registro' },
      { key: 'personal_goal_km', label: 'Meta Individual' }
    ];
    const rows = ranking.map((row, idx) => ({
      position: idx + 1,
      ...row
    }));

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Salvar ranking em CSV',
      defaultPath: `${(challengeTitle || 'ranking').replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    fs.writeFileSync(result.filePath, toCsv(headers, rows), 'utf8');
    return { canceled: false, filePath: result.filePath };
  });

  handle('export:activities-csv', async ({ userId, challengeId, challengeTitle }) => {
    const rows = services.activitiesCsvRows(asUserId(userId), Number(challengeId));
    const headers = [
      { key: 'athlete_name', label: 'Atleta' },
      { key: 'date', label: 'Data' },
      { key: 'km', label: 'Km' },
      { key: 'note', label: 'Observacao' },
      { key: 'created_at', label: 'Registrado Em' }
    ];

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Salvar atividades em CSV',
      defaultPath: `${(challengeTitle || 'atividades').replace(/[^a-zA-Z0-9_-]/g, '_')}_atividades.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    fs.writeFileSync(result.filePath, toCsv(headers, rows), 'utf8');
    return { canceled: false, filePath: result.filePath };
  });

  handle('backup:create', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Salvar backup do banco',
      defaultPath: `desafios-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'Banco SQLite', extensions: ['db'] }]
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    dbCtx.db.pragma('wal_checkpoint(TRUNCATE)');
    fs.copyFileSync(dbCtx.dbPath, result.filePath);
    return { canceled: false, filePath: result.filePath };
  });

  handle('backup:restore', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Selecionar backup',
      properties: ['openFile'],
      filters: [{ name: 'Banco SQLite', extensions: ['db'] }]
    });

    if (result.canceled || !result.filePaths?.[0]) {
      return { canceled: true };
    }

    const source = result.filePaths[0];
    dbCtx.db.close();
    fs.copyFileSync(source, dbCtx.dbPath);
    initDb();
    return { canceled: false, restoredFrom: source };
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    const rendererPath = path.join(process.resourcesPath, 'renderer', 'index.html');
    mainWindow.loadFile(rendererPath);
  }
}

app.whenReady().then(() => {
  logger.initLogger(app.getPath('userData'));
  initDb();
  setupIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (error) => {
  logger.error('uncaughtException', { message: error.message, stack: error.stack });
});

process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', { reason: String(reason) });
});

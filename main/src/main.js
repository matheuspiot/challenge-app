const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { autoUpdater } = require('electron-updater');

const { initializeDatabase } = require('./database');
const { createServices, AppError } = require('./services');
const logger = require('./logger');

const isDev = !app.isPackaged;
const isAutoUpdateDisabled = process.env.DISABLE_AUTO_UPDATE === '1';
const canUseAutoUpdate = !isDev && !isAutoUpdateDisabled;

let mainWindow = null;
let dbCtx = null;
let services = null;
let updateStatus = { status: 'idle', message: 'Atualizações não verificadas.', progress: null };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadDevRenderer(windowRef) {
  const preferred = process.env.RENDERER_DEV_URL;
  const candidates = [preferred, 'http://localhost:5173', 'http://localhost:5180'].filter(Boolean);
  const uniqueCandidates = [...new Set(candidates)];

  for (let attempt = 0; attempt < 5; attempt += 1) {
    for (const url of uniqueCandidates) {
      try {
        await windowRef.loadURL(url);
        logger.info('Renderer de desenvolvimento carregado', { url });
        return;
      } catch (_err) {
        logger.info('Falha ao carregar renderer de desenvolvimento', { url, attempt: attempt + 1 });
      }
    }
    await sleep(700);
  }

  throw new Error('Não foi possível conectar ao renderer de desenvolvimento (5173/5180).');
}

function setUpdateStatus(status, message, progress = null) {
  updateStatus = { status, message, progress };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updates:status', updateStatus);
  }
}

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
  if (dbCtx?.db) dbCtx.db.close();
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

async function triggerManualUpdateCheck(fromMenu = false) {
  if (!canUseAutoUpdate) {
    const message = isAutoUpdateDisabled
      ? 'Atualização automática desativada por variável de ambiente.'
      : 'Atualização automática indisponível no modo de desenvolvimento.';
    setUpdateStatus('disabled', message);
    if (fromMenu && mainWindow) {
      await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Atualizações',
        message
      });
    }
    return { started: false, disabled: true, message };
  }

  setUpdateStatus('checking', 'Verificando atualizações...');
  autoUpdater.checkForUpdates();
  return { started: true };
}

function setupAutoUpdater() {
  if (!canUseAutoUpdate) {
    const message = isAutoUpdateDisabled
      ? 'Atualização automática desativada por variável de ambiente.'
      : 'Atualização automática indisponível no modo de desenvolvimento.';
    setUpdateStatus('disabled', message);
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    setUpdateStatus('checking', 'Verificando atualizações...');
  });

  autoUpdater.on('update-available', () => {
    setUpdateStatus('downloading', 'Atualização encontrada. Iniciando download...');
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const percent = Math.round(progressObj.percent || 0);
    setUpdateStatus('downloading', `Baixando ${percent}%`, percent);
  });

  autoUpdater.on('update-not-available', () => {
    setUpdateStatus('up_to_date', 'Aplicativo atualizado.');
  });

  autoUpdater.on('error', (error) => {
    setUpdateStatus('idle', '');
    logger.error('Erro no autoUpdater', { message: error.message, stack: error.stack });
  });

  autoUpdater.on('update-downloaded', async () => {
    setUpdateStatus('ready', 'Atualização pronta.');
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Atualizar agora', 'Depois'],
      defaultId: 0,
      cancelId: 1,
      title: 'Atualização disponível',
      message: 'Nova versão disponível. Deseja reiniciar para atualizar?'
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
}

function createAppMenu() {
  const template = [
    {
      label: 'Arquivo',
      submenu: [{ role: 'quit', label: 'Sair' }]
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Verificar atualizações',
          click: () => {
            triggerManualUpdateCheck(true);
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setupIpcHandlers() {
  handle('auth:register', (payload) => ({ user: services.registerUser(payload) }));
  handle('auth:login', (payload) => ({ user: services.login(payload) }));
  handle('auth:update-profile', ({ userId, profile }) => ({ user: services.updateUserProfile(asUserId(userId), profile || {}) }));

  handle('challenges:list', ({ userId }) => ({ challenges: services.listChallenges(asUserId(userId)) }));
  handle('challenges:create', ({ userId, challenge }) => ({ challenge: services.createChallenge(asUserId(userId), challenge || {}) }));
  handle('challenges:update', ({ userId, challengeId, challenge }) => ({ challenge: services.updateChallenge(asUserId(userId), Number(challengeId), challenge || {}) }));
  handle('challenges:delete', ({ userId, challengeId }) => services.deleteChallenge(asUserId(userId), Number(challengeId)));

  handle('athletes:list', ({ userId, challengeId, filter }) => ({ athletes: services.listAthletes(asUserId(userId), Number(challengeId), filter || '') }));
  handle('athletes:create', ({ userId, challengeId, athlete }) => ({ athlete: services.createAthlete(asUserId(userId), Number(challengeId), athlete || {}) }));
  handle('athletes:update', ({ userId, challengeId, athleteId, athlete }) => ({
    athlete: services.updateAthlete(asUserId(userId), Number(challengeId), Number(athleteId), athlete || {})
  }));
  handle('athletes:delete', ({ userId, challengeId, athleteId }) => services.deleteAthlete(asUserId(userId), Number(challengeId), Number(athleteId)));
  handle('payments:save-plan', ({ userId, athleteId, enrollment }) => services.saveEnrollmentPlan(asUserId(userId), Number(athleteId), enrollment || {}));
  handle('payments:get-athlete', ({ userId, athleteId }) => services.getAthletePayments(asUserId(userId), Number(athleteId)));
  handle('payments:mark-paid', ({ userId, installmentId, payment }) => services.setInstallmentPaid(asUserId(userId), Number(installmentId), payment || {}));
  handle('payments:mark-open', ({ userId, installmentId, payment }) => services.setInstallmentOpen(asUserId(userId), Number(installmentId), payment || {}));
  handle('payments:athlete-status', ({ userId, athleteId }) => ({ paymentStatus: services.athletePaymentStatus(asUserId(userId), Number(athleteId)) }));
  handle('payments:pendencies', ({ userId, challengeId }) => ({
    pendencies: services.listPaymentPendencies(asUserId(userId), challengeId ? Number(challengeId) : null)
  }));
  handle('payments:finance-summary', ({ userId, filters }) => ({
    summary: services.financeSummary(asUserId(userId), filters || {})
  }));

  handle('activities:create', ({ userId, activity }) => ({ activity: services.createActivity(asUserId(userId), activity || {}) }));
  handle('activities:list', ({ userId, challengeId }) => ({ activities: services.listActivitiesByChallenge(asUserId(userId), Number(challengeId)) }));

  handle('ranking:get', ({ userId, challengeId }) => ({ ranking: services.ranking(asUserId(userId), Number(challengeId)) }));
  handle('progress:get', ({ userId, challengeId }) => ({ progress: services.progress(asUserId(userId), Number(challengeId)) }));

  handle('export:ranking-csv', async ({ userId, challengeId, challengeTitle }) => {
    const ranking = services.ranking(asUserId(userId), Number(challengeId));
    const headers = [
      { key: 'position', label: 'Posição' },
      { key: 'name', label: 'Atleta' },
      { key: 'total_km', label: 'Km Total' },
      { key: 'last_activity_date', label: 'Último Registro' },
      { key: 'personal_goal_km', label: 'Meta Individual' }
    ];
    const rows = ranking.map((row, idx) => ({ position: idx + 1, ...row }));

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Salvar ranking em CSV',
      defaultPath: `${(challengeTitle || 'ranking').replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    fs.writeFileSync(result.filePath, toCsv(headers, rows), 'utf8');
    return { canceled: false, filePath: result.filePath };
  });

  handle('export:activities-csv', async ({ userId, challengeId, challengeTitle }) => {
    const rows = services.activitiesCsvRows(asUserId(userId), Number(challengeId));
    const headers = [
      { key: 'athlete_name', label: 'Atleta' },
      { key: 'date', label: 'Data' },
      { key: 'km', label: 'Km' },
      { key: 'note', label: 'Observação' },
      { key: 'created_at', label: 'Registrado Em' }
    ];

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Salvar atividades em CSV',
      defaultPath: `${(challengeTitle || 'atividades').replace(/[^a-zA-Z0-9_-]/g, '_')}_atividades.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    fs.writeFileSync(result.filePath, toCsv(headers, rows), 'utf8');
    return { canceled: false, filePath: result.filePath };
  });

  handle('export:finance-paid-csv', async ({ userId, filters, fileTitle }) => {
    const summary = services.financeSummary(asUserId(userId), filters || {});
    const rows = summary.paidInstallments || [];
    const headers = [
      { key: 'challenge_title', label: 'Desafio' },
      { key: 'athlete_name', label: 'Atleta' },
      { key: 'installment_number', label: 'Parcela' },
      { key: 'due_date', label: 'Vencimento' },
      { key: 'paid_at', label: 'Pago Em' },
      { key: 'amount_cents', label: 'Valor (centavos)' },
      { key: 'note', label: 'Observação' }
    ];
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Exportar parcelas pagas (CSV)',
      defaultPath: `${(fileTitle || 'parcelas_pagas').replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    fs.writeFileSync(result.filePath, toCsv(headers, rows), 'utf8');
    return { canceled: false, filePath: result.filePath };
  });

  handle('export:finance-overdue-csv', async ({ userId, filters, fileTitle }) => {
    const summary = services.financeSummary(asUserId(userId), filters || {});
    const rows = summary.overdueInstallments || [];
    const headers = [
      { key: 'challenge_title', label: 'Desafio' },
      { key: 'athlete_name', label: 'Atleta' },
      { key: 'installment_number', label: 'Parcela' },
      { key: 'due_date', label: 'Vencimento' },
      { key: 'overdueDays', label: 'Dias em Atraso' },
      { key: 'amount_cents', label: 'Valor (centavos)' },
      { key: 'blocked', label: 'Bloqueado' }
    ];
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Exportar parcelas vencidas (CSV)',
      defaultPath: `${(fileTitle || 'parcelas_vencidas').replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    fs.writeFileSync(result.filePath, toCsv(headers, rows), 'utf8');
    return { canceled: false, filePath: result.filePath };
  });

  handle('backup:create', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Salvar backup do banco',
      defaultPath: `desafios-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'Banco SQLite', extensions: ['db'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
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
    if (result.canceled || !result.filePaths?.[0]) return { canceled: true };
    const source = result.filePaths[0];
    dbCtx.db.close();
    fs.copyFileSync(source, dbCtx.dbPath);
    initDb();
    return { canceled: false, restoredFrom: source };
  });

  handle('updates:get-status', () => updateStatus);
  handle('updates:check-manual', () => triggerManualUpdateCheck(false));
}

function createMainWindow() {
  const devIconPath = path.join(__dirname, '..', 'build', 'icon.png');
  mainWindow = new BrowserWindow({
    title: 'Challenge App',
    icon: fs.existsSync(devIconPath) ? devIconPath : undefined,
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
    loadDevRenderer(mainWindow).catch((error) => {
      logger.error('Falha ao abrir renderer em desenvolvimento', { message: error.message });
    });
  } else {
    const rendererPath = path.join(process.resourcesPath, 'renderer', 'index.html');
    mainWindow.loadFile(rendererPath);
  }

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('updates:status', updateStatus);
  });
}

app.whenReady().then(() => {
  logger.initLogger(app.getPath('userData'));
  initDb();
  setupIpcHandlers();
  createAppMenu();
  setupAutoUpdater();
  createMainWindow();

  if (canUseAutoUpdate) {
    setTimeout(() => {
      triggerManualUpdateCheck(false);
    }, 2000);
  }

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



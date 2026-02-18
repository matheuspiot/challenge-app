const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  register: (payload) => ipcRenderer.invoke('auth:register', payload),
  login: (payload) => ipcRenderer.invoke('auth:login', payload),
  updateProfile: (payload) => ipcRenderer.invoke('auth:update-profile', payload),

  listChallenges: (userId) => ipcRenderer.invoke('challenges:list', { userId }),
  createChallenge: (payload) => ipcRenderer.invoke('challenges:create', payload),
  updateChallenge: (payload) => ipcRenderer.invoke('challenges:update', payload),
  deleteChallenge: (payload) => ipcRenderer.invoke('challenges:delete', payload),

  listAthletes: (payload) => ipcRenderer.invoke('athletes:list', payload),
  createAthlete: (payload) => ipcRenderer.invoke('athletes:create', payload),
  updateAthlete: (payload) => ipcRenderer.invoke('athletes:update', payload),
  deleteAthlete: (payload) => ipcRenderer.invoke('athletes:delete', payload),

  savePaymentPlan: (payload) => ipcRenderer.invoke('payments:save-plan', payload),
  getAthletePayments: (payload) => ipcRenderer.invoke('payments:get-athlete', payload),
  markInstallmentPaid: (payload) => ipcRenderer.invoke('payments:mark-paid', payload),
  markInstallmentOpen: (payload) => ipcRenderer.invoke('payments:mark-open', payload),
  getAthletePaymentStatus: (payload) => ipcRenderer.invoke('payments:athlete-status', payload),
  listPaymentPendencies: (payload) => ipcRenderer.invoke('payments:pendencies', payload),
  getFinanceSummary: (payload) => ipcRenderer.invoke('payments:finance-summary', payload),

  createActivity: (payload) => ipcRenderer.invoke('activities:create', payload),
  listActivities: (payload) => ipcRenderer.invoke('activities:list', payload),

  getRanking: (payload) => ipcRenderer.invoke('ranking:get', payload),
  getProgress: (payload) => ipcRenderer.invoke('progress:get', payload),

  exportRankingCsv: (payload) => ipcRenderer.invoke('export:ranking-csv', payload),
  exportActivitiesCsv: (payload) => ipcRenderer.invoke('export:activities-csv', payload),
  exportFinancePaidCsv: (payload) => ipcRenderer.invoke('export:finance-paid-csv', payload),
  exportFinanceOverdueCsv: (payload) => ipcRenderer.invoke('export:finance-overdue-csv', payload),

  backupDatabase: () => ipcRenderer.invoke('backup:create'),
  restoreDatabase: () => ipcRenderer.invoke('backup:restore'),

  getUpdateStatus: () => ipcRenderer.invoke('updates:get-status'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check-manual'),
  onUpdateStatus: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('updates:status', handler);
    return () => ipcRenderer.removeListener('updates:status', handler);
  }
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  register: (payload) => ipcRenderer.invoke('auth:register', payload),
  login: (payload) => ipcRenderer.invoke('auth:login', payload),

  listChallenges: (userId) => ipcRenderer.invoke('challenges:list', { userId }),
  createChallenge: (payload) => ipcRenderer.invoke('challenges:create', payload),
  updateChallenge: (payload) => ipcRenderer.invoke('challenges:update', payload),
  deleteChallenge: (payload) => ipcRenderer.invoke('challenges:delete', payload),

  listAthletes: (payload) => ipcRenderer.invoke('athletes:list', payload),
  createAthlete: (payload) => ipcRenderer.invoke('athletes:create', payload),
  updateAthlete: (payload) => ipcRenderer.invoke('athletes:update', payload),
  deleteAthlete: (payload) => ipcRenderer.invoke('athletes:delete', payload),

  createActivity: (payload) => ipcRenderer.invoke('activities:create', payload),
  listActivities: (payload) => ipcRenderer.invoke('activities:list', payload),

  getRanking: (payload) => ipcRenderer.invoke('ranking:get', payload),
  getProgress: (payload) => ipcRenderer.invoke('progress:get', payload),

  exportRankingCsv: (payload) => ipcRenderer.invoke('export:ranking-csv', payload),
  exportActivitiesCsv: (payload) => ipcRenderer.invoke('export:activities-csv', payload),

  backupDatabase: () => ipcRenderer.invoke('backup:create'),
  restoreDatabase: () => ipcRenderer.invoke('backup:restore')
});

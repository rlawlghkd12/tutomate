const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 파일 I/O
  saveData: (key, data) =>
    ipcRenderer.invoke('save-data', key, data),
  loadData: (key) =>
    ipcRenderer.invoke('load-data', key),

  // 백업
  createBackup: (orgName) =>
    ipcRenderer.invoke('create-backup', orgName),
  listBackups: () =>
    ipcRenderer.invoke('list-backups'),
  restoreBackup: (filename) =>
    ipcRenderer.invoke('restore-backup', filename),
  deleteBackup: (filename) =>
    ipcRenderer.invoke('delete-backup', filename),
  importBackup: (sourcePath, orgName) =>
    ipcRenderer.invoke('import-backup', sourcePath, orgName),
  exportBackupFile: (filename, destPath) =>
    ipcRenderer.invoke('export-backup-file', filename, destPath),

  // 머신 ID
  getMachineId: () =>
    ipcRenderer.invoke('get-machine-id'),

  // 다이얼로그
  showOpenDialog: (options) =>
    ipcRenderer.invoke('show-open-dialog', options),
  showSaveDialog: (options) =>
    ipcRenderer.invoke('show-save-dialog', options),

  // 앱 정보
  getAppVersion: () =>
    ipcRenderer.invoke('get-app-version'),

  // 자동 업데이트
  checkForUpdates: () =>
    ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () =>
    ipcRenderer.invoke('download-update'),
  installUpdate: () =>
    ipcRenderer.invoke('install-update'),
  onUpdateEvent: (callback) => {
    const handler = (_event, type, data) => callback(type, data);
    ipcRenderer.on('update-event', handler);
    return () => ipcRenderer.removeListener('update-event', handler);
  },

  // 앱 제어
  relaunch: () =>
    ipcRenderer.invoke('app-relaunch'),

  // OAuth
  openOAuthUrl: (url) =>
    ipcRenderer.invoke('oauth-open-external', url),
  onOAuthCallback: (callback) => {
    const handler = (_event, url) => callback(url);
    ipcRenderer.on('oauth-callback', handler);
    return () => ipcRenderer.removeListener('oauth-callback', handler);
  },
});

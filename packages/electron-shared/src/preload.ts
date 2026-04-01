import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // 파일 I/O
  saveData: (key: string, data: string) =>
    ipcRenderer.invoke('save-data', key, data),
  loadData: (key: string) =>
    ipcRenderer.invoke('load-data', key),

  // 백업
  createBackup: (orgName?: string) =>
    ipcRenderer.invoke('create-backup', orgName),
  listBackups: () =>
    ipcRenderer.invoke('list-backups'),
  restoreBackup: (filename: string) =>
    ipcRenderer.invoke('restore-backup', filename),
  deleteBackup: (filename: string) =>
    ipcRenderer.invoke('delete-backup', filename),
  importBackup: (sourcePath: string, orgName?: string) =>
    ipcRenderer.invoke('import-backup', sourcePath, orgName),
  exportBackupFile: (filename: string, destPath: string) =>
    ipcRenderer.invoke('export-backup-file', filename, destPath),

  // 머신 ID
  getMachineId: () =>
    ipcRenderer.invoke('get-machine-id'),

  // 다이얼로그
  showOpenDialog: (options: any) =>
    ipcRenderer.invoke('show-open-dialog', options),
  showSaveDialog: (options: any) =>
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
  onUpdateEvent: (callback: (event: string, data: any) => void) => {
    const handler = (_event: any, type: string, data: any) => callback(type, data);
    ipcRenderer.on('update-event', handler);
    return () => ipcRenderer.removeListener('update-event', handler);
  },

  // 앱 제어
  relaunch: () =>
    ipcRenderer.invoke('app-relaunch'),

  // OAuth
  openOAuthUrl: (url: string) =>
    ipcRenderer.invoke('oauth-open-external', url),
  onOAuthCallback: (callback: (url: string) => void) => {
    const handler = (_event: any, url: string) => callback(url);
    ipcRenderer.on('oauth-callback', handler);
    return () => ipcRenderer.removeListener('oauth-callback', handler);
  },
});

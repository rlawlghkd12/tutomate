const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 파일 I/O
  saveData: (key, data) =>
    ipcRenderer.invoke('save-data', key, data),
  loadData: (key) =>
    ipcRenderer.invoke('load-data', key),

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

  // 첨부 파일 임시 저장 (챗봇 도구용)
  fileStashSave: (name, buffer) =>
    ipcRenderer.invoke('file-stash:save', name, buffer),
  fileStashDelete: (fileId) =>
    ipcRenderer.invoke('file-stash:delete', fileId),

  // AI 챗봇
  aiStatus: () => ipcRenderer.invoke('ai:status'),
  aiDiagnose: () => ipcRenderer.invoke('ai:diagnose'),
  aiNeeds: () => ipcRenderer.invoke('ai:needs'),
  aiDownload: () => ipcRenderer.invoke('ai:download'),
  aiDownloadEngine: () => ipcRenderer.invoke('ai:download-engine'),
  aiEnsureVcRedist: () => ipcRenderer.invoke('ai:ensure-vcredist'),
  aiCancel: () => ipcRenderer.invoke('ai:cancel'),
  aiResetSession: () => ipcRenderer.invoke('ai:reset-session'),
  aiSummarize: (payload) => ipcRenderer.invoke('ai:summarize', payload),
  aiDispatch: (payload) => ipcRenderer.invoke('ai:dispatch', payload),
  aiUninstall: () => ipcRenderer.invoke('ai:uninstall'),
  aiChat: (payload) => ipcRenderer.invoke('ai:chat', payload),
  aiDirectImport: (fileId, orgId, userId) =>
    ipcRenderer.invoke('ai:direct-import', fileId, orgId, userId),
  onAiDownloadEvent: (callback) => {
    const handler = (_event, e) => callback(e);
    ipcRenderer.on('ai:download-event', handler);
    return () => ipcRenderer.removeListener('ai:download-event', handler);
  },
  onAiEngineDownloadEvent: (callback) => {
    const handler = (_event, e) => callback(e);
    ipcRenderer.on('ai:engine-download-event', handler);
    return () => ipcRenderer.removeListener('ai:engine-download-event', handler);
  },
  onAiChatEvent: (callback) => {
    const handler = (_event, e) => callback(e);
    ipcRenderer.on('ai:chat-event', handler);
    return () => ipcRenderer.removeListener('ai:chat-event', handler);
  },
});

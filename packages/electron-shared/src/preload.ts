import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // 파일 I/O
  saveData: (key: string, data: string) =>
    ipcRenderer.invoke('save-data', key, data),
  loadData: (key: string) =>
    ipcRenderer.invoke('load-data', key),

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

  // 첨부 파일 임시 저장 (챗봇 도구용)
  fileStashSave: (name: string, buffer: ArrayBuffer) =>
    ipcRenderer.invoke('file-stash:save', name, buffer),
  fileStashDelete: (fileId: string) =>
    ipcRenderer.invoke('file-stash:delete', fileId),

  // AI 챗봇
  aiStatus: () => ipcRenderer.invoke('ai:status'),
  aiBackendInfo: () => ipcRenderer.invoke('ai:backend-info'),
  aiUsage: (payload?: unknown) => ipcRenderer.invoke('ai:usage', payload),
  aiDiagnose: () => ipcRenderer.invoke('ai:diagnose'),
  aiDownload: () => ipcRenderer.invoke('ai:download'),
  aiCancel: () => ipcRenderer.invoke('ai:cancel'),
  aiResetSession: () => ipcRenderer.invoke('ai:reset-session'),
  aiSummarize: (payload: unknown) => ipcRenderer.invoke('ai:summarize', payload),
  aiDispatch: (payload: unknown) => ipcRenderer.invoke('ai:dispatch', payload),
  aiUninstall: () => ipcRenderer.invoke('ai:uninstall'),
  aiChat: (payload: { messages: unknown[]; orgId: string; userId: string }) =>
    ipcRenderer.invoke('ai:chat', payload),
  aiDirectImport: (fileId: string, orgId: string, userId: string) =>
    ipcRenderer.invoke('ai:direct-import', fileId, orgId, userId),
  onAiDownloadEvent: (callback: (e: any) => void) => {
    const handler = (_event: any, e: any) => callback(e);
    ipcRenderer.on('ai:download-event', handler);
    return () => ipcRenderer.removeListener('ai:download-event', handler);
  },
  onAiChatEvent: (callback: (e: any) => void) => {
    const handler = (_event: any, e: any) => callback(e);
    ipcRenderer.on('ai:chat-event', handler);
    return () => ipcRenderer.removeListener('ai:chat-event', handler);
  },
});

interface UpdateInfo {
  version: string;
  releaseNotes: string | null;
  currentVersion: string;
}

interface ElectronAPI {
  // 파일 I/O
  saveData(key: string, data: string): Promise<void>;
  loadData(key: string): Promise<string>;

  // 머신 ID
  getMachineId(): Promise<string>;

  // 다이얼로그
  showOpenDialog(options: any): Promise<string | null>;
  showSaveDialog(options: any): Promise<string | null>;

  // 앱 정보
  getAppVersion(): Promise<string>;

  // 자동 업데이트
  checkForUpdates(): Promise<UpdateInfo | null>;
  downloadUpdate(): Promise<void>;
  installUpdate(): void;
  onUpdateEvent(callback: (event: string, data: any) => void): () => void;

  // 앱 제어
  relaunch(): Promise<void>;

  // OAuth
  openOAuthUrl(url: string): Promise<void>;
  onOAuthCallback(callback: (url: string) => void): () => void;

  // 첨부 파일 임시 저장 (챗봇 도구용)
  fileStashSave(name: string, buffer: ArrayBuffer): Promise<{ fileId: string; name: string }>;
  fileStashDelete(fileId: string): Promise<void>;

  // AI 챗봇
  aiStatus(): Promise<'not_installed' | 'loading_pending' | 'ready' | 'disabled'>;
  aiDiagnose(): Promise<{
    ramGB: number;
    diskGB: number;
    recommendation: 'ok' | 'warn' | 'block';
    tier: 'fast' | 'slow' | 'unsupported';
  }>;
  aiDownload(): Promise<void>;
  aiCancel(): Promise<void>;
  aiUninstall(): Promise<void>;
  aiChat(payload: { messages: unknown[]; orgId: string; userId: string }): Promise<void>;
  aiDirectImport(fileId: string): Promise<{ card: any }>;
  onAiDownloadEvent(callback: (e: any) => void): () => void;
  onAiChatEvent(callback: (e: any) => void): () => void;
}

interface Window {
  electronAPI: ElectronAPI;
}

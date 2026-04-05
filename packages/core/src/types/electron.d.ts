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
}

interface Window {
  electronAPI: ElectronAPI;
}

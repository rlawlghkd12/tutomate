import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerFileHandlers } from './ipc/fileHandler';
import { registerBackupHandlers } from './ipc/backupHandler';
import { registerMachineIdHandler } from './ipc/machineId';
import { registerDialogHandlers } from './ipc/dialogHandler';
import { setupUpdater } from './updater';
import log from 'electron-log/main';

// ESM 환경에서 __dirname 대체
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 로그 설정
log.transports.file.maxSize = 50 * 1024; // 50KB
log.initialize();

// Vite dev server URL (개발 모드)
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: '수강생 관리 프로그램',
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// 단일 인스턴스 보장
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // IPC 핸들러 등록
    registerFileHandlers(ipcMain);
    registerBackupHandlers(ipcMain);
    registerMachineIdHandler(ipcMain);
    registerDialogHandlers(ipcMain);

    createWindow();

    // 자동 업데이트 설정 (프로덕션 전용)
    if (!VITE_DEV_SERVER_URL && mainWindow) {
      setupUpdater(mainWindow);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

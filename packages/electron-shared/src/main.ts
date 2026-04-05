import { app, BrowserWindow, ipcMain, Menu, nativeImage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerFileHandlers } from './ipc/fileHandler';
import { registerMachineIdHandler } from './ipc/machineId';
import { registerDialogHandlers } from './ipc/dialogHandler';
import { registerAuthHandlers } from './ipc/authHandler';
import { setupUpdater } from './updater';
import log from 'electron-log/main';

// 앱 스킴 (vite define으로 빌드 시 주입)
declare const __APP_SCHEME__: string;
const APP_SCHEME = typeof __APP_SCHEME__ !== 'undefined' ? __APP_SCHEME__ : 'tutomate';

// ESM 환경에서 __dirname 대체
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 로그 설정
log.transports.file.maxSize = 50 * 1024; // 50KB
log.initialize();

// Vite dev server URL (개발 모드)
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;
let pendingDeepLinkUrl: string | null = null;

// 프로토콜 등록 (app.ready 이전에 호출)
if (process.defaultApp) {
  app.setAsDefaultProtocolClient(APP_SCHEME, process.execPath, [
    path.resolve(process.argv[1])
  ]);
} else {
  app.setAsDefaultProtocolClient(APP_SCHEME);
}

// macOS: open-url 이벤트로 deep link 수신
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('oauth-callback', url);
  } else {
    pendingDeepLinkUrl = url;
  }
});

// 개발: project root의 build/icon.png, 프로덕션: dist-electron/icon.png
const iconPath = VITE_DEV_SERVER_URL
  ? path.join(__dirname, '..', 'build', 'icon.png')
  : path.join(__dirname, 'icon.png');

function createWindow() {
  const appIcon = nativeImage.createFromPath(iconPath);

  // macOS dock 아이콘 설정 (개발 모드에서도 적용)
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(appIcon);
  }

  // Windows/Linux에서 메뉴바 제거 (macOS는 시스템 메뉴 유지)
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  }

  mainWindow = new BrowserWindow({
    title: '수강생 관리 프로그램',
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    icon: appIcon,
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
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    // Windows/Linux: argv에서 deep link URL 추출
    const deepLinkUrl = argv.find(arg => arg.startsWith(`${APP_SCHEME}://`));
    if (deepLinkUrl && mainWindow) {
      mainWindow.webContents.send('oauth-callback', deepLinkUrl);
    }
  });

  app.whenReady().then(() => {
    // IPC 핸들러 등록
    registerFileHandlers(ipcMain);
    registerMachineIdHandler(ipcMain);
    registerDialogHandlers(ipcMain);

    createWindow();

    registerAuthHandlers(mainWindow!);

    // 앱 로드 완료 후 pending deep link URL 전달
    if (mainWindow) {
      mainWindow.webContents.once('did-finish-load', () => {
        if (pendingDeepLinkUrl) {
          mainWindow!.webContents.send('oauth-callback', pendingDeepLinkUrl);
          pendingDeepLinkUrl = null;
        }
      });
    }

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

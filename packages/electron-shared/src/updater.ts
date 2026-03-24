import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;
import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';
import log from 'electron-log/main';

export function setupUpdater(mainWindow: BrowserWindow) {
  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  const send = (type: string, data?: any) => {
    mainWindow.webContents.send('update-event', type, data);
  };

  autoUpdater.on('checking-for-update', () => {
    send('checking-for-update');
  });

  autoUpdater.on('update-available', (info) => {
    send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('update-not-available', () => {
    send('update-not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    send('download-progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    send('update-downloaded', {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('error', (err) => {
    send('error', { message: err.message });
  });

  // IPC 핸들러
  ipcMain.handle('check-for-updates', async () => {
    try {
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000));
      const check = autoUpdater.checkForUpdates().then((result) => {
        if (!result || !result.updateInfo) return null;
        const latestVersion = result.updateInfo.version;
        const currentVersion = autoUpdater.currentVersion.version;
        if (latestVersion === currentVersion) return null;
        return {
          version: latestVersion,
          releaseNotes: result.updateInfo.releaseNotes,
          currentVersion,
        };
      });
      return await Promise.race([check, timeout]);
    } catch {
      return null;
    }
  });

  ipcMain.handle('download-update', async () => {
    await autoUpdater.downloadUpdate();
  });

  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall(true, true);
  });
}

import { app, dialog, type IpcMain } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

export function registerDialogHandlers(ipcMain: IpcMain) {
  ipcMain.handle('show-open-dialog', async (_event, options: Electron.OpenDialogOptions) => {
    const result = await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('show-save-dialog', async (_event, options: Electron.SaveDialogOptions) => {
    const result = await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });

  ipcMain.handle('get-app-version', async () => {
    // 패키징된 앱: asar 내부, 개발 모드: 프로젝트 루트까지 탐색
    const candidates = app.isPackaged
      ? [join(process.resourcesPath, 'app.asar', 'package.json')]
      : [join(app.getAppPath(), 'package.json'), join(dirname(app.getAppPath()), 'package.json')];
    for (const p of candidates) {
      try {
        if (!existsSync(p)) continue;
        const pkg = JSON.parse(readFileSync(p, 'utf-8'));
        if (pkg.version) return pkg.version;
      } catch { /* next */ }
    }
    return app.getVersion();
  });

  ipcMain.handle('app-relaunch', async () => {
    app.relaunch();
    app.exit(0);
  });
}

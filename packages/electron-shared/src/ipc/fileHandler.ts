import { app, type IpcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import log from 'electron-log/main';

function getDataDir(): string {
  const dataDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

export function registerFileHandlers(ipcMain: IpcMain) {
  ipcMain.handle('save-data', async (_event, key: string, data: string) => {
    const filePath = path.join(getDataDir(), `${key}.json`);
    log.info(`Saving data for key: ${key} (${data.length} bytes)`);
    fs.writeFileSync(filePath, data, 'utf-8');
  });

  ipcMain.handle('load-data', async (_event, key: string) => {
    const filePath = path.join(getDataDir(), `${key}.json`);
    log.info(`Loading data for key: ${key}`);
    if (!fs.existsSync(filePath)) {
      log.warn(`File does not exist for key: ${key}, returning empty array`);
      return '[]';
    }
    return fs.readFileSync(filePath, 'utf-8');
  });
}

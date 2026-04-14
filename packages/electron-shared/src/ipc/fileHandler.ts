import { app, type IpcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import log from 'electron-log/main';

const VALID_KEY = /^[a-zA-Z0-9_-]+$/;
const MAX_DATA_BYTES = 10 * 1024 * 1024; // 10MB

function getDataDir(): string {
  const dataDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

function validateKey(key: string): void {
  if (!VALID_KEY.test(key)) {
    throw new Error(`Invalid data key: ${JSON.stringify(key)}`);
  }
}

export function registerFileHandlers(ipcMain: IpcMain) {
  ipcMain.handle('save-data', async (_event, key: string, data: string) => {
    validateKey(key);
    const byteLength = Buffer.byteLength(data, 'utf-8');
    if (byteLength > MAX_DATA_BYTES) {
      throw new Error(`Data too large: ${byteLength} bytes (max ${MAX_DATA_BYTES})`);
    }
    const filePath = path.join(getDataDir(), `${key}.json`);
    log.info(`Saving data for key: ${key} (${byteLength} bytes)`);
    await fs.promises.writeFile(filePath, data, 'utf-8');
  });

  ipcMain.handle('load-data', async (_event, key: string) => {
    validateKey(key);
    const filePath = path.join(getDataDir(), `${key}.json`);
    log.info(`Loading data for key: ${key}`);
    try {
      return await fs.promises.readFile(filePath, 'utf-8');
    } catch {
      log.warn(`File does not exist for key: ${key}, returning empty array`);
      return '[]';
    }
  });
}

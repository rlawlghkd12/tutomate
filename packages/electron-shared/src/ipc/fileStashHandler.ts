import { app, type IpcMain } from 'electron';
import path from 'node:path';
import { createFileStash, type FileStash } from '../ai/FileStash';

let stash: FileStash | null = null;

export function getFileStash(): FileStash {
  if (!stash) {
    const dir = path.join(app.getPath('userData'), '.stash');
    stash = createFileStash({ baseDir: dir });
  }
  return stash;
}

export function registerFileStashHandlers(ipcMain: IpcMain) {
  const s = getFileStash();
  ipcMain.handle(
    'file-stash:save',
    async (_e, name: string, buffer: ArrayBuffer) => {
      const { fileId } = await s.save(Buffer.from(buffer));
      return { fileId, name };
    },
  );
  ipcMain.handle('file-stash:delete', async (_e, fileId: string) => {
    await s.delete(fileId);
  });
  // 시작 후 만료 청소
  setTimeout(() => s.cleanupExpired().catch(() => undefined), 5000);
}

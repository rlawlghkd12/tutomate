import { app, type IpcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import yauzl from 'yauzl';
import log from 'electron-log/main';

interface BackupInfo {
  filename: string;
  size: number;
  created_at: string;
}

function getDataDir(): string {
  const dataDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

function getBackupDir(): string {
  const backupDir = path.join(app.getPath('userData'), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  return backupDir;
}

function formatTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function createBackupZip(orgName?: string): Promise<BackupInfo> {
  const dataDir = getDataDir();
  const backupDir = getBackupDir();
  const timestamp = formatTimestamp();
  const prefix = orgName || '';
  const filename = prefix ? `${prefix}_백업_${timestamp}.zip` : `백업_${timestamp}.zip`;
  const backupPath = path.join(backupDir, filename);

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(backupPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      const stats = fs.statSync(backupPath);
      log.info(`Backup created: ${filename} (${stats.size} bytes)`);
      resolve({
        filename,
        size: stats.size,
        created_at: new Date().toISOString(),
      });
    });

    archive.on('error', (err) => reject(err));
    archive.pipe(output);

    // data 디렉토리의 모든 JSON 파일을 ZIP에 추가
    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        archive.file(path.join(dataDir, file), { name: file });
      }
    }

    archive.finalize();
  });
}

function extractZip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err || new Error('Failed to open zip'));

      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        if (/\/$/.test(entry.fileName)) {
          zipfile.readEntry();
          return;
        }
        zipfile.openReadStream(entry, (err2, readStream) => {
          if (err2 || !readStream) return reject(err2 || new Error('Failed to read stream'));
          const outPath = path.join(destDir, entry.fileName);
          const writeStream = fs.createWriteStream(outPath);
          readStream.pipe(writeStream);
          writeStream.on('finish', () => zipfile.readEntry());
          writeStream.on('error', reject);
        });
      });
      zipfile.on('end', resolve);
      zipfile.on('error', reject);
    });
  });
}

export function registerBackupHandlers(ipcMain: IpcMain) {
  ipcMain.handle('create-backup', async (_event, orgName?: string) => {
    return createBackupZip(orgName);
  });

  ipcMain.handle('list-backups', async () => {
    const backupDir = getBackupDir();
    if (!fs.existsSync(backupDir)) return [];

    const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.zip'));
    const backups: BackupInfo[] = files.map((filename) => {
      const filePath = path.join(backupDir, filename);
      const stats = fs.statSync(filePath);
      return {
        filename,
        size: stats.size,
        created_at: stats.mtime.toISOString(),
      };
    });

    // 최신순 정렬
    backups.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return backups;
  });

  ipcMain.handle('restore-backup', async (_event, filename: string) => {
    const backupDir = getBackupDir();
    const dataDir = getDataDir();
    const backupPath = path.join(backupDir, filename);

    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${filename}`);
    }

    // 기존 데이터 파일 삭제
    const existingFiles = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
    for (const file of existingFiles) {
      fs.unlinkSync(path.join(dataDir, file));
    }

    // ZIP 추출
    await extractZip(backupPath, dataDir);
    log.info(`Backup restored: ${filename}`);
  });

  ipcMain.handle('delete-backup', async (_event, filename: string) => {
    const backupPath = path.join(getBackupDir(), filename);
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${filename}`);
    }
    fs.unlinkSync(backupPath);
    log.info(`Backup deleted: ${filename}`);
  });

  ipcMain.handle('import-backup', async (_event, sourcePath: string, orgName?: string) => {
    if (!fs.existsSync(sourcePath)) {
      throw new Error('파일을 찾을 수 없습니다.');
    }

    // ZIP 파일 검증
    const isValidZip = await new Promise<boolean>((resolve) => {
      yauzl.open(sourcePath, { lazyEntries: true }, (err, zipfile) => {
        if (err || !zipfile) return resolve(false);
        const validKeys = ['courses.json', 'students.json', 'enrollments.json'];
        let found = false;
        zipfile.readEntry();
        zipfile.on('entry', (entry) => {
          if (validKeys.includes(entry.fileName)) found = true;
          zipfile.readEntry();
        });
        zipfile.on('end', () => {
          zipfile.close();
          resolve(found);
        });
        zipfile.on('error', () => resolve(false));
      });
    });

    if (!isValidZip) {
      throw new Error('유효한 백업 파일이 아닙니다. (courses.json, students.json, enrollments.json 필요)');
    }

    const backupDir = getBackupDir();
    const timestamp = formatTimestamp();
    const prefix = orgName || '';
    const filename = prefix ? `${prefix}_백업_외부_${timestamp}.zip` : `백업_외부_${timestamp}.zip`;
    const destPath = path.join(backupDir, filename);

    fs.copyFileSync(sourcePath, destPath);
    const stats = fs.statSync(destPath);

    log.info(`Backup imported: ${filename}`);
    return {
      filename,
      size: stats.size,
      created_at: new Date().toISOString(),
    } as BackupInfo;
  });

  ipcMain.handle('export-backup-file', async (_event, filename: string, destPath: string) => {
    const backupPath = path.join(getBackupDir(), filename);
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${filename}`);
    }
    fs.copyFileSync(backupPath, destPath);
    log.info(`Backup exported: ${filename} -> ${destPath}`);
  });
}

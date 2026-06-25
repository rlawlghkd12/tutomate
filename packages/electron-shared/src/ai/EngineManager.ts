import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import yauzl from 'yauzl';
import { detectPlatformDir, llamaBinDownloadUrl, findLlamaServerBin } from './llamaServerBin';

export type EngineEvent =
  | { type: 'progress'; received: number; total: number }
  | { type: 'extracting' }
  | { type: 'done' }
  | { type: 'error'; message: string };

/**
 * llama-server 실행 엔진(바이너리)을 런타임에 다운로드·설치.
 * 모델과 마찬가지로 설치파일에 번들하지 않고 사용자가 직접 받게 한다.
 *
 * 설치 위치: `<aiBaseDir>/llama-bin/<platform>/`
 *   - aiBaseDir는 호출자(aiHandler)가 getAiBaseDir()로 결정해 전달.
 *     영문 사용자는 기존대로 `%APPDATA%\<앱>\AI`, 한글 사용자는 ASCII 보장 경로
 *     (`%PROGRAMDATA%\<앱>\AI`)가 들어온다.
 */
export class EngineManager {
  constructor(
    private aiBaseDir: string,
    private resourcesPath?: string,
  ) {}

  /** 실행 가능한 llama-server를 이미 찾을 수 있는가 (다운로드/번들/PATH 무관). */
  isInstalled(): boolean {
    return findLlamaServerBin(this.aiBaseDir, this.resourcesPath) !== null;
  }

  private destDir(): string | null {
    const platform = detectPlatformDir();
    if (!platform) return null;
    return path.join(this.aiBaseDir, 'llama-bin', platform);
  }

  async download(onEvent: (e: EngineEvent) => void, signal?: AbortSignal): Promise<void> {
    const url = llamaBinDownloadUrl();
    const dest = this.destDir();
    if (!url || !dest) {
      onEvent({ type: 'error', message: '지원하지 않는 플랫폼입니다.' });
      throw new Error('unsupported platform');
    }

    const isZip = url.endsWith('.zip');
    fs.mkdirSync(dest, { recursive: true });
    const tmpDir = fs.mkdtempSync(path.join(this.aiBaseDir, 'engine-dl-'));
    const archivePath = path.join(tmpDir, isZip ? 'llama.zip' : 'llama.tar.gz');

    try {
      // 1) 아카이브 다운로드 (진행률)
      const res = await fetch(url, { signal });
      if (!res.ok) {
        onEvent({ type: 'error', message: `엔진 다운로드 실패: HTTP ${res.status}` });
        throw new Error(`HTTP ${res.status}`);
      }
      const total = Number(res.headers.get('content-length')) || 0;
      if (!res.body) throw new Error('빈 응답 본문');
      let received = 0;
      const stream = Readable.fromWeb(res.body as never);
      stream.on('data', (chunk: Buffer) => {
        received += chunk.length;
        onEvent({ type: 'progress', received, total });
      });
      await pipeline(stream, fs.createWriteStream(archivePath));

      // 2) 압축 해제 — Windows는 .zip(yauzl), macOS/Linux는 .tar.gz(system tar)
      onEvent({ type: 'extracting' });
      const extractDir = path.join(tmpDir, 'extracted');
      fs.mkdirSync(extractDir, { recursive: true });
      if (isZip) {
        await extractZip(archivePath, extractDir);
      } else {
        execFileSync('tar', ['-xzf', archivePath, '-C', extractDir]);
      }

      // 3) llama-server 위치 찾아 같은 폴더 파일 통째로 복사 (동봉 라이브러리 포함)
      const exe = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
      const found = findFile(extractDir, exe);
      if (!found) {
        onEvent({ type: 'error', message: '내려받은 엔진에서 실행 파일을 찾지 못했습니다.' });
        throw new Error('llama-server not found in archive');
      }
      const binDir = path.dirname(found);
      for (const name of fs.readdirSync(binDir)) {
        const src = path.join(binDir, name);
        if (fs.statSync(src).isFile()) fs.copyFileSync(src, path.join(dest, name));
      }
      // 실행 권한 부여 (unix)
      if (process.platform !== 'win32') {
        try {
          fs.chmodSync(path.join(dest, exe), 0o755);
        } catch {
          /* best effort */
        }
      }

      onEvent({ type: 'done' });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

/** zip 전체를 destDir에 해제 (yauzl). 디렉토리 구조 보존. */
function extractZip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error('zip open 실패'));
      zip.on('error', reject);
      zip.on('end', resolve);
      zip.readEntry();
      zip.on('entry', (entry) => {
        const outPath = path.join(destDir, entry.fileName);
        if (/\/$/.test(entry.fileName)) {
          fs.mkdirSync(outPath, { recursive: true });
          zip.readEntry();
          return;
        }
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        zip.openReadStream(entry, (e, rs) => {
          if (e || !rs) return reject(e ?? new Error('entry 읽기 실패'));
          const ws = fs.createWriteStream(outPath);
          ws.on('close', () => zip.readEntry());
          ws.on('error', reject);
          rs.pipe(ws);
        });
      });
    });
  });
}

/** dir 트리에서 파일명이 일치하는 첫 파일의 전체 경로. */
function findFile(dir: string, name: string): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = findFile(full, name);
      if (hit) return hit;
    } else if (entry.name === name) {
      return full;
    }
  }
  return null;
}

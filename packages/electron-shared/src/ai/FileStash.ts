import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface FileStashOptions {
  baseDir: string;
  /** 만료 TTL ms (기본 30분) */
  ttlMs?: number;
}

export interface FileStash {
  save(buf: Buffer): Promise<{ fileId: string }>;
  read(fileId: string): Promise<Buffer>;
  delete(fileId: string): Promise<void>;
  cleanupExpired(): Promise<void>;
}

const META_SUFFIX = '.json';
const FILE_ID_RE = /^[0-9a-f-]{36}$/i;

/**
 * 챗봇 첨부 파일 임시 저장소.
 * - LLM 컨텍스트 부담 회피: 큰 파일을 LLM에 보내지 않고 fileId만 전달.
 * - 도구가 fileId로 데이터 접근.
 * - TTL 후 만료, 메인 프로세스가 cleanupExpired() 주기 호출.
 */
export function createFileStash(opts: FileStashOptions): FileStash {
  const ttlMs = opts.ttlMs ?? 30 * 60_000;
  fs.mkdirSync(opts.baseDir, { recursive: true });

  function pathOf(fileId: string): string {
    if (!FILE_ID_RE.test(fileId)) throw new Error('invalid fileId');
    return path.join(opts.baseDir, fileId);
  }

  return {
    async save(buf: Buffer) {
      const fileId = randomUUID();
      const p = pathOf(fileId);
      await fs.promises.writeFile(p, buf);
      await fs.promises.writeFile(p + META_SUFFIX, JSON.stringify({ created: Date.now() }));
      return { fileId };
    },

    async read(fileId) {
      const p = pathOf(fileId);
      let metaRaw: string;
      try {
        metaRaw = await fs.promises.readFile(p + META_SUFFIX, 'utf-8');
      } catch {
        throw new Error(`첨부 파일이 존재하지 않습니다: ${fileId}`);
      }
      const meta = JSON.parse(metaRaw) as { created: number };
      if (Date.now() - meta.created > ttlMs) {
        throw new Error(`첨부 파일이 만료되었습니다: ${fileId}`);
      }
      return fs.promises.readFile(p);
    },

    async delete(fileId) {
      const p = pathOf(fileId);
      await fs.promises.rm(p, { force: true });
      await fs.promises.rm(p + META_SUFFIX, { force: true });
    },

    async cleanupExpired() {
      const entries = await fs.promises.readdir(opts.baseDir);
      const now = Date.now();
      for (const e of entries) {
        if (!e.endsWith(META_SUFFIX)) continue;
        const metaPath = path.join(opts.baseDir, e);
        try {
          const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf-8')) as { created: number };
          if (now - meta.created > ttlMs) {
            const fileId = e.slice(0, -META_SUFFIX.length);
            await fs.promises.rm(path.join(opts.baseDir, fileId), { force: true });
            await fs.promises.rm(metaPath, { force: true });
          }
        } catch {
          // 손상된 메타는 무시
        }
      }
    },
  };
}

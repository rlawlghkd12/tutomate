import { describe, it, expect, beforeEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createFileStash } from '../FileStash';

const TMP = path.join(os.tmpdir(), 'tutomate-stash-test-' + Date.now());

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
});

describe('FileStash', () => {
  it('save → fileId 반환, read 시 동일 buffer', async () => {
    const stash = createFileStash({ baseDir: TMP, ttlMs: 60_000 });
    const buf = Buffer.from('hello world');
    const { fileId } = await stash.save(buf);
    expect(fileId).toMatch(/^[0-9a-f-]{36}$/i);
    const read = await stash.read(fileId);
    expect(read.equals(buf)).toBe(true);
  });

  it('TTL 지난 파일은 read 시 에러', async () => {
    const stash = createFileStash({ baseDir: TMP, ttlMs: 1 });
    const { fileId } = await stash.save(Buffer.from('x'));
    await new Promise((r) => setTimeout(r, 10));
    await expect(stash.read(fileId)).rejects.toThrow(/만료|존재/);
  });

  it('delete 후 read 시 존재하지 않음 에러', async () => {
    const stash = createFileStash({ baseDir: TMP, ttlMs: 60_000 });
    const { fileId } = await stash.save(Buffer.from('y'));
    await stash.delete(fileId);
    await expect(stash.read(fileId)).rejects.toThrow(/존재하지/);
  });

  it('cleanupExpired — TTL 지난 파일만 삭제', async () => {
    const stash = createFileStash({ baseDir: TMP, ttlMs: 60_000 });
    const { fileId: oldId } = await stash.save(Buffer.from('old'));
    const { fileId: newId } = await stash.save(Buffer.from('new'));

    // 첫 파일의 메타를 과거 timestamp로 강제 (TTL 초과 시뮬레이션)
    const oldMetaPath = path.join(TMP, oldId + '.json');
    fs.writeFileSync(oldMetaPath, JSON.stringify({ created: Date.now() - 90 * 60_000 }));

    await stash.cleanupExpired();
    await expect(stash.read(oldId)).rejects.toThrow();
    expect((await stash.read(newId)).toString()).toBe('new');
  });

  it('잘못된 fileId 형식 → 에러', async () => {
    const stash = createFileStash({ baseDir: TMP });
    await expect(stash.read('../etc/passwd')).rejects.toThrow(/invalid fileId/);
  });
});

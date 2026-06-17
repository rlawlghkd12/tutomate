import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

export interface ModelSpec {
  id: string;
  filename: string;
  url: string;
  /** 첫 다운로드 후 측정·갱신. 'TBD-...' 이면 검증 생략. */
  sha256: string;
  sizeBytes: number;
}

/**
 * Qwen 3.5 4B Instruct (Q4_K_M).
 * 선정 근거: TAU2 agentic 27 (도구 호출 정확도 — 동급 대비 4배 안정).
 * 한국어 자연스러움 ★★★★, 함수 호출 chat template fix 적용된 빌드.
 *
 * 첫 다운로드 후 sha256 측정해 갱신.
 */
export const QWEN_3_5_4B_Q4: ModelSpec = {
  id: 'qwen-3.5-4b-instruct-q4',
  filename: 'qwen3.5-4b-q4_k_m.gguf',
  url: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf',
  sha256: 'TBD-FILL-AFTER-FIRST-DOWNLOAD',
  sizeBytes: 2_740_937_888, // ~2.74GB
};

/** @deprecated v0.7.0부터 QWEN_3_5_4B_Q4 사용. 호환성 위해 alias 유지. */
export const QWEN_2_5_3B_Q4 = QWEN_3_5_4B_Q4;

export type ModelEvent =
  | { type: 'progress'; received: number; total: number }
  | { type: 'verifying' }
  | { type: 'done' }
  | { type: 'error'; message: string };

export class ModelManager {
  constructor(private baseDir: string) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  modelPath(spec: ModelSpec): string {
    return path.join(this.baseDir, spec.filename);
  }

  isInstalled(spec: ModelSpec): boolean {
    return fs.existsSync(this.modelPath(spec));
  }

  /**
   * GGUF 파일 다운로드 + 재개 + sha256 검증.
   * - 진행 이벤트는 onEvent 콜백으로
   * - signal로 취소 가능
   */
  async download(
    spec: ModelSpec,
    onEvent: (e: ModelEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const dest = this.modelPath(spec);
    const tmp = dest + '.part';
    const startBytes = fs.existsSync(tmp) ? fs.statSync(tmp).size : 0;

    const headers: Record<string, string> = {};
    if (startBytes > 0) headers['Range'] = `bytes=${startBytes}-`;

    const res = await fetch(spec.url, { headers, signal });
    if (!res.ok && res.status !== 206) {
      onEvent({ type: 'error', message: `다운로드 실패: HTTP ${res.status}` });
      throw new Error(`HTTP ${res.status}`);
    }

    const totalHeader = res.headers.get('content-length');
    const total = totalHeader
      ? Number(totalHeader) + startBytes
      : spec.sizeBytes;
    const writer = fs.createWriteStream(tmp, {
      flags: startBytes > 0 ? 'a' : 'w',
    });

    let received = startBytes;
    if (!res.body) throw new Error('빈 응답 본문');
    const stream = Readable.fromWeb(res.body as never);
    stream.on('data', (chunk: Buffer) => {
      received += chunk.length;
      onEvent({ type: 'progress', received, total });
    });

    await pipeline(stream, writer);

    onEvent({ type: 'verifying' });
    if (spec.sha256 && !spec.sha256.startsWith('TBD')) {
      const hash = crypto.createHash('sha256');
      const verifyStream = fs.createReadStream(tmp);
      for await (const chunk of verifyStream) hash.update(chunk as Buffer);
      const got = hash.digest('hex');
      if (got !== spec.sha256) {
        await fs.promises.rm(tmp, { force: true });
        onEvent({ type: 'error', message: 'sha256 불일치 — 다시 시도해주세요' });
        throw new Error('sha256 mismatch');
      }
    }
    await fs.promises.rename(tmp, dest);
    onEvent({ type: 'done' });
  }

  async uninstall(spec: ModelSpec): Promise<void> {
    await fs.promises.rm(this.modelPath(spec), { force: true });
  }
}

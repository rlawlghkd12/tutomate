/**
 * LLM Lab — 모델 비교 테스트 서버.
 * 사용법: pnpm --filter @tutomate/llm-lab dev
 * 브라우저: http://localhost:5180
 */

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATALOG, findModel, type LabModel } from './catalog.ts';
import { createDispatcher, toToolDefinitions } from '@tutomate/core';
import { createFileStash } from '@tutomate/electron-shared/src/ai/FileStash';
import { ModelManager } from '@tutomate/electron-shared/src/ai/ModelManager';
import { MOCK_TOOLS } from './mockTools.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '.data');
const MODELS_DIR = path.join(DATA_DIR, 'models');
const STASH_DIR = path.join(DATA_DIR, 'stash');
fs.mkdirSync(MODELS_DIR, { recursive: true });
fs.mkdirSync(STASH_DIR, { recursive: true });

const fileStash = createFileStash({ baseDir: STASH_DIR, ttlMs: 60 * 60_000 });
const dispatcher = createDispatcher(MOCK_TOOLS as any);
const toolDefs = toToolDefinitions(MOCK_TOOLS as any);

// 모델별 ModelManager — 카탈로그 entry를 spec 형태로 변환
function toSpec(m: LabModel) {
  return {
    id: m.id,
    filename: m.filename,
    url: m.url,
    sha256: 'TBD',
    sizeBytes: m.sizeBytes,
  };
}

const manager = new ModelManager(MODELS_DIR);

// 활성 런타임 캐시
const runtimes = new Map<string, any>();

async function loadRuntime(model: LabModel) {
  if (runtimes.has(model.id)) return runtimes.get(model.id);
  const llamaPkg: any = await import('node-llama-cpp');
  const llama = await llamaPkg.getLlama();
  const llamaModel = await llama.loadModel({ modelPath: manager.modelPath(toSpec(model)) });
  const context = await llamaModel.createContext({ contextSize: model.contextSize });
  const session = new llamaPkg.LlamaChatSession({ contextSequence: context.getSequence() });
  const runtime = { llama, llamaModel, context, session, llamaPkg };
  runtimes.set(model.id, runtime);
  return runtime;
}

// ─── HTTP ─────────────────────────────────────────────────────

function send(res: http.ServerResponse, code: number, body: any, headers: Record<string, string> = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

    // ─── 정적 ───
    if (req.method === 'GET' && url.pathname === '/') {
      const html = fs.readFileSync(path.join(__dirname, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    // ─── 모델 목록 + 설치 상태 ───
    if (req.method === 'GET' && url.pathname === '/api/models') {
      return send(res, 200, {
        models: CATALOG.map((m) => ({
          ...m,
          installed: manager.isInstalled(toSpec(m)),
        })),
      });
    }

    // ─── 모델 다운로드 (SSE 진행률) ───
    if (req.method === 'POST' && url.pathname === '/api/models/download') {
      const id = url.searchParams.get('id');
      const m = findModel(id ?? '');
      if (!m) return send(res, 404, { error: 'unknown model' });
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      try {
        await manager.download(toSpec(m), (e) => {
          res.write(`data: ${JSON.stringify(e)}\n\n`);
        });
      } catch (e: any) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: e?.message ?? String(e) })}\n\n`);
      }
      return res.end();
    }

    // ─── 모델 삭제 ───
    if (req.method === 'POST' && url.pathname === '/api/models/uninstall') {
      const id = url.searchParams.get('id');
      const m = findModel(id ?? '');
      if (!m) return send(res, 404, { error: 'unknown model' });
      const rt = runtimes.get(m.id);
      if (rt) {
        try { await rt.context?.dispose?.(); } catch {}
        runtimes.delete(m.id);
      }
      await manager.uninstall(toSpec(m));
      return send(res, 200, { ok: true });
    }

    // ─── 파일 첨부 (FileStash) ───
    if (req.method === 'POST' && url.pathname === '/api/upload') {
      const buf = await readBody(req);
      const { fileId } = await fileStash.save(buf);
      return send(res, 200, { fileId });
    }

    // ─── 도구 카탈로그 노출 ───
    if (req.method === 'GET' && url.pathname === '/api/tools') {
      return send(res, 200, { tools: toolDefs });
    }

    // ─── 챗 (스트림) ───
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const id = url.searchParams.get('id');
      const m = findModel(id ?? '');
      if (!m) return send(res, 404, { error: 'unknown model' });
      if (!manager.isInstalled(toSpec(m))) {
        return send(res, 400, { error: 'model not installed' });
      }

      const body = JSON.parse((await readBody(req)).toString('utf-8')) as {
        prompt: string;
        attachmentFileId?: string;
      };

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      });
      const startedAt = Date.now();
      let firstTokenAt = 0;
      let tokens = 0;

      const ctx = {
        orgId: 'lab',
        userId: 'lab',
        fileStash,
        emit: (card: unknown) => {
          res.write(`data: ${JSON.stringify({ type: 'card', card })}\n\n`);
        },
      };

      try {
        const rt = await loadRuntime(m);
        const functions: Record<string, any> = {};
        for (const t of toolDefs) {
          functions[t.name] = {
            description: t.description,
            params: t.parameters,
            handler: async (args: unknown) => {
              const t0 = Date.now();
              const result = await dispatcher.dispatch(t.name, args, ctx);
              res.write(
                `data: ${JSON.stringify({
                  type: 'tool_call',
                  name: t.name,
                  args,
                  result,
                  ms: Date.now() - t0,
                })}\n\n`,
              );
              return result;
            },
          };
        }

        const userText = body.attachmentFileId
          ? `${body.prompt}\n\n(첨부 fileId="${body.attachmentFileId}")`
          : body.prompt;

        await rt.session.prompt(userText, {
          functions,
          maxTokens: 1024,
          onTextChunk: (chunk: string) => {
            if (!firstTokenAt) firstTokenAt = Date.now();
            tokens++;
            res.write(`data: ${JSON.stringify({ type: 'token', token: chunk })}\n\n`);
          },
        });

        res.write(
          `data: ${JSON.stringify({
            type: 'done',
            metrics: {
              totalMs: Date.now() - startedAt,
              firstTokenMs: firstTokenAt - startedAt,
              tokens,
              tokensPerSec: tokens / Math.max(1, (Date.now() - firstTokenAt) / 1000),
            },
          })}\n\n`,
        );
      } catch (e: any) {
        res.write(
          `data: ${JSON.stringify({ type: 'error', message: e?.message ?? String(e) })}\n\n`,
        );
      }
      return res.end();
    }

    return send(res, 404, { error: 'not found' });
  } catch (err: any) {
    return send(res, 500, { error: err?.message ?? String(err) });
  }
});

const PORT = Number(process.env.PORT ?? 5180);
server.listen(PORT, () => {
  console.log(`\n  llm-lab → http://localhost:${PORT}\n  models dir: ${MODELS_DIR}\n`);
});

/**
 * LLM Lab — 모델 비교 테스트 서버.
 *
 * 모델 추론은 brew로 설치한 llama-server (llama.cpp 9030+)에 위임:
 *   brew install llama.cpp
 * 이유: node-llama-cpp 3.18.1은 Gemma 4 지원이 없는 구 llama.cpp(b8390)를 번들.
 * llama-server는 OpenAI 호환 /v1/chat/completions 제공, 툴 콜링 지원, Gemma 4 OK.
 *
 * 사용법: pnpm --filter @tutomate/llm-lab dev → http://localhost:5180
 */

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
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

function toSpec(m: LabModel) {
  return { id: m.id, filename: m.filename, url: m.url, sha256: 'TBD', sizeBytes: m.sizeBytes };
}
const manager = new ModelManager(MODELS_DIR);

// ─── llama-server 프로세스 풀 ─────────────────────────────
interface ServerInfo {
  port: number;
  process: ChildProcess;
  ready: Promise<void>;
}
const servers = new Map<string, ServerInfo>();
let nextPort = 5200;

async function startLlamaServer(model: LabModel): Promise<ServerInfo> {
  const existing = servers.get(model.id);
  if (existing) return existing;

  const port = nextPort++;
  const modelPath = manager.modelPath(toSpec(model));
  console.log(`[${model.id}] llama-server start on :${port}`);

  const proc = spawn('llama-server', [
    '-m', modelPath,
    '--port', String(port),
    '--host', '127.0.0.1',
    '-c', String(model.contextSize),
    '--jinja',          // 함수 호출 chat template 활성
    '-ngl', '99',       // GPU 레이어 모두 (Metal/CUDA)
    '--no-warmup',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  proc.stdout?.on('data', (d) => process.stdout.write(`[${model.id}] ${d}`));
  proc.stderr?.on('data', (d) => process.stderr.write(`[${model.id}] ${d}`));

  const ready = new Promise<void>((resolve, reject) => {
    const onExit = (code: number | null) => reject(new Error(`llama-server exited ${code} before ready`));
    proc.once('exit', onExit);

    // health check polling
    const checkInterval = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        if (res.ok) {
          clearInterval(checkInterval);
          proc.off('exit', onExit);
          resolve();
        }
      } catch { /* not ready yet */ }
    }, 500);

    setTimeout(() => {
      clearInterval(checkInterval);
      proc.off('exit', onExit);
      reject(new Error('llama-server timeout (90s)'));
    }, 90_000);
  });

  const info: ServerInfo = { port, process: proc, ready };
  servers.set(model.id, info);
  return info;
}

function stopLlamaServer(modelId: string) {
  const info = servers.get(modelId);
  if (!info) return;
  info.process.kill('SIGTERM');
  servers.delete(modelId);
}

process.on('SIGINT', () => {
  for (const id of servers.keys()) stopLlamaServer(id);
  process.exit(0);
});

// ─── HTTP helpers ──────────────────────────────────────────
function send(res: http.ServerResponse, code: number, body: any, headers: Record<string, string> = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}
async function readBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

// ─── 챗 핸들러: 도구 호출 루프 ─────────────────────────────
async function runChat(
  model: LabModel,
  prompt: string,
  attachmentFileId: string | undefined,
  res: http.ServerResponse,
) {
  const startedAt = Date.now();
  let firstTokenAt = 0;
  let tokens = 0;

  const ctx = {
    orgId: 'lab', userId: 'lab', fileStash,
    emit: (card: unknown) => res.write(`data: ${JSON.stringify({ type: 'card', card })}\n\n`),
  };

  let info: ServerInfo;
  try {
    info = await startLlamaServer(model);
    await info.ready;
  } catch (e: any) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: `서버 기동 실패: ${e.message}` })}\n\n`);
    return;
  }

  // OpenAI tool 형식으로 변환
  const tools = toolDefs.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const userText = attachmentFileId
    ? `${prompt}\n\n(첨부 fileId="${attachmentFileId}")`
    : prompt;

  const messages: any[] = [
    { role: 'system', content: '당신은 학원 운영을 돕는 한국어 어시스턴트입니다. 결제·출석·미납 정보는 반드시 도구를 호출해 확인하고, 절대 추측하지 마세요. 사용자가 엑셀을 첨부했다면 parseExcelHeaders → mapColumns → previewImport 순으로 호출하세요.' },
    { role: 'user', content: userText },
  ];

  for (let round = 0; round < 5; round++) {
    let assistantText = '';
    const toolCalls: { id: string; name: string; args: string }[] = [];
    let finishReason: string | null = null;

    const resp = await fetch(`http://127.0.0.1:${info.port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        tools,
        tool_choice: 'auto',
        stream: true,
        max_tokens: 1024,
        temperature: 0.3,
      }),
    });

    if (!resp.ok || !resp.body) {
      const text = await resp.text();
      res.write(`data: ${JSON.stringify({ type: 'error', message: `LLM API ${resp.status}: ${text.slice(0, 200)}` })}\n\n`);
      return;
    }

    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const ev = JSON.parse(data);
          const delta = ev.choices?.[0]?.delta;
          if (delta?.content) {
            if (!firstTokenAt) firstTokenAt = Date.now();
            tokens++;
            assistantText += delta.content;
            res.write(`data: ${JSON.stringify({ type: 'token', token: delta.content })}\n\n`);
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCalls[idx]) {
                toolCalls[idx] = { id: tc.id ?? `call_${idx}`, name: tc.function?.name ?? '', args: '' };
              }
              if (tc.function?.name) toolCalls[idx].name = tc.function.name;
              if (tc.function?.arguments) toolCalls[idx].args += tc.function.arguments;
            }
          }
          if (ev.choices?.[0]?.finish_reason) finishReason = ev.choices[0].finish_reason;
        } catch { /* skip malformed */ }
      }
    }

    if (toolCalls.length === 0) {
      // 종료
      break;
    }

    // 도구 호출 실행 + assistant 메시지 + tool 결과 메시지 추가
    messages.push({
      role: 'assistant',
      content: assistantText || null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.args },
      })),
    });

    for (const tc of toolCalls) {
      let parsedArgs: unknown;
      try { parsedArgs = JSON.parse(tc.args || '{}'); } catch { parsedArgs = {}; }
      const t0 = Date.now();
      const result = await dispatcher.dispatch(tc.name, parsedArgs, ctx);
      res.write(`data: ${JSON.stringify({
        type: 'tool_call',
        name: tc.name,
        args: parsedArgs,
        result,
        ms: Date.now() - t0,
      })}\n\n`);
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
  }

  res.write(`data: ${JSON.stringify({
    type: 'done',
    metrics: {
      totalMs: Date.now() - startedAt,
      firstTokenMs: firstTokenAt ? firstTokenAt - startedAt : 0,
      tokens,
      tokensPerSec: firstTokenAt ? tokens / Math.max(0.001, (Date.now() - firstTokenAt) / 1000) : 0,
    },
  })}\n\n`);
}

// ─── 라우터 ────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/') {
      const html = fs.readFileSync(path.join(__dirname, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    if (req.method === 'GET' && url.pathname === '/api/models') {
      return send(res, 200, {
        models: CATALOG.map((m) => ({
          ...m,
          installed: manager.isInstalled(toSpec(m)),
          loaded: servers.has(m.id),
        })),
      });
    }

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

    if (req.method === 'POST' && url.pathname === '/api/models/uninstall') {
      const id = url.searchParams.get('id');
      const m = findModel(id ?? '');
      if (!m) return send(res, 404, { error: 'unknown model' });
      stopLlamaServer(m.id);
      await manager.uninstall(toSpec(m));
      return send(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/models/unload') {
      const id = url.searchParams.get('id');
      if (!id) return send(res, 400, { error: 'id required' });
      stopLlamaServer(id);
      return send(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/upload') {
      const buf = await readBody(req);
      const { fileId } = await fileStash.save(buf);
      return send(res, 200, { fileId });
    }

    if (req.method === 'GET' && url.pathname === '/api/tools') {
      return send(res, 200, { tools: toolDefs });
    }

    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const id = url.searchParams.get('id');
      const m = findModel(id ?? '');
      if (!m) return send(res, 404, { error: 'unknown model' });
      if (!manager.isInstalled(toSpec(m))) return send(res, 400, { error: 'model not installed' });

      const body = JSON.parse((await readBody(req)).toString('utf-8')) as {
        prompt: string;
        attachmentFileId?: string;
      };

      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      await runChat(m, body.prompt, body.attachmentFileId, res);
      return res.end();
    }

    return send(res, 404, { error: 'not found' });
  } catch (err: any) {
    return send(res, 500, { error: err?.message ?? String(err) });
  }
});

const PORT = Number(process.env.PORT ?? 5180);
server.listen(PORT, () => {
  console.log(`\n  llm-lab → http://localhost:${PORT}`);
  console.log(`  models dir: ${MODELS_DIR}`);
  console.log(`  llama-server (brew llama.cpp) for inference\n`);
});

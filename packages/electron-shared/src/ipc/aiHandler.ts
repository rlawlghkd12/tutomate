import { app, type IpcMain } from 'electron';
import path from 'node:path';
import {
  ModelManager,
  QWEN_2_5_3B_Q4,
  diagnose,
  createLlamaRuntime,
  type LlamaRuntime,
} from '../ai';
import {
  ALL_TOOLS,
  createDispatcher,
  toToolDefinitions,
  type ChatMessage,
  type SmartCard,
  type ToolContext,
} from '@tutomate/core';
import { getFileStash } from './fileStashHandler';

const aiDir = path.join(app.getPath('userData'), 'AI');
const manager = new ModelManager(aiDir);
let runtime: LlamaRuntime | null = null;
let abort: AbortController | null = null;

const dispatcher = createDispatcher(ALL_TOOLS);
const toolDefs = toToolDefinitions(ALL_TOOLS);

export function registerAiHandlers(ipcMain: IpcMain) {
  ipcMain.handle('ai:status', () => {
    if (!manager.isInstalled(QWEN_2_5_3B_Q4)) return 'not_installed';
    return runtime ? 'ready' : 'loading_pending';
  });

  ipcMain.handle('ai:diagnose', async () => diagnose(aiDir));

  ipcMain.handle('ai:download', async (event) => {
    const sender = event.sender;
    abort = new AbortController();
    try {
      await manager.download(
        QWEN_2_5_3B_Q4,
        (e) => sender.send('ai:download-event', e),
        abort.signal,
      );
    } catch (err: any) {
      sender.send('ai:download-event', {
        type: 'error',
        message: err?.message ?? String(err),
      });
    } finally {
      abort = null;
    }
  });

  ipcMain.handle('ai:cancel', () => {
    abort?.abort();
  });

  ipcMain.handle('ai:uninstall', async () => {
    if (runtime) {
      await runtime.unload();
      runtime = null;
    }
    await manager.uninstall(QWEN_2_5_3B_Q4);
  });

  ipcMain.handle(
    'ai:chat',
    async (
      event,
      payload: { messages: ChatMessage[]; orgId: string; userId: string },
    ) => {
      const sender = event.sender;
      if (!runtime) {
        runtime = await createLlamaRuntime({
          modelPath: manager.modelPath(QWEN_2_5_3B_Q4),
        });
        await runtime.load();
      }
      abort = new AbortController();

      const ctx: ToolContext = {
        orgId: payload.orgId,
        userId: payload.userId,
        fileStash: getFileStash(),
        emit: (card: SmartCard) =>
          sender.send('ai:chat-event', { type: 'card', card }),
      };

      await runtime.chat(
        payload.messages,
        toolDefs,
        (e) => sender.send('ai:chat-event', e),
        async (name, args) => dispatcher.dispatch(name, args, ctx),
        abort.signal,
      );

      abort = null;
    },
  );

  // AI 비활성 PC용: LLM 우회로 직접 임포트 도구 실행
  ipcMain.handle(
    'ai:direct-import',
    async (
      _event,
      fileId: string,
      orgId: string,
      userId: string,
    ): Promise<{ card: SmartCard | null }> => {
      let captured: SmartCard | null = null;
      const ctx: ToolContext = {
        orgId,
        userId,
        fileStash: getFileStash(),
        emit: (card) => {
          captured = card;
        },
      };

      const headersResult = (await dispatcher.dispatch(
        'parseExcelHeaders',
        { fileId },
        ctx,
      )) as any;
      if (headersResult?.error) {
        return { card: null };
      }

      const mapResult = (await dispatcher.dispatch(
        'mapColumns',
        { headers: headersResult.headers },
        ctx,
      )) as any;

      if (mapResult.status === 'mismatch') {
        return {
          card: {
            type: 'mappingError',
            matched: mapResult.matched,
            unmatched: mapResult.unmatched,
          },
        };
      }

      // 매핑 결과로 students/payments 자동 구분
      const kind: 'students' | 'payments' =
        Object.values(mapResult.mapping).some(
          (v) => v === 'paymentDate' || v === 'amount',
        )
          ? 'payments'
          : 'students';

      await dispatcher.dispatch(
        'previewImport',
        { fileId, mapping: mapResult.mapping, kind },
        ctx,
      );
      return { card: captured };
    },
  );
}

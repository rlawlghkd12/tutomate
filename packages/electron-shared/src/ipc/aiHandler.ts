import { app, type IpcMain } from 'electron';
import path from 'node:path';
import {
  ModelManager,
  QWEN_3_5_4B_Q4,
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

/**
 * 시스템 프롬프트 — 챗봇이 항상 지켜야 할 규칙.
 * lab에서 검증된 톤. 환각 방지·도구 우선·확정 동의 절차 강조.
 */
const SYSTEM_PROMPT = `당신은 학원·공방·교습소 등 수강 관리 조직을 돕는 한국어 AI 어시스턴트입니다.

핵심 원칙:
- 사용자에게 되묻지 말고 적절한 도구를 직접 골라 호출하세요. 도구가 부족해도 "함수가 없다"고 사용자에게 떠넘기지 말고, 가용한 도구로 추론하세요.
- 결제·출석·미납·학생 정보는 반드시 도구를 호출해 확인합니다. 절대 추측하거나 임의로 만들어내지 마세요.

도구 사용 가이드:
- "총 몇 명?", "전체 학생", "이번 달 매출" 같은 요약 질문 → \`getOrgStats\` 호출.
- 특정 학생 → \`searchStudent\`로 후보 찾기 (동명이인 가능). 인자 없이 호출 시 전체 명단도 가능.
- 결제 이력 → \`getPaymentHistory\` (period 옵션으로 기간 필터).
- 미납자 → \`getUnpaidStudents\` (월 미지정 시 이번 달).
- 강좌 명단 → \`getClassRoster\` 또는 \`listClasses\`.

엑셀 임포트:
- 파일 첨부 시: parseExcelHeaders → mapColumns → previewImport 순서.
- 매핑 실패 → 표준 양식 안내 후 멈춤.
- previewImport 결과 요약 후 사용자 명시 동의 시에만 \`confirmImport\` 호출.

응답 톤:
- 간결한 한국어, 짧은 문장 + 줄바꿈.
- 60대 이상도 읽기 쉽게.
- 도구 결과를 직접 인용해 답변. 모르면 "그 정보는 못 찾았어요"라고 명시.`;

export function registerAiHandlers(ipcMain: IpcMain) {
  ipcMain.handle('ai:status', () => {
    if (!manager.isInstalled(QWEN_3_5_4B_Q4)) return 'not_installed';
    return runtime ? 'ready' : 'loading_pending';
  });

  ipcMain.handle('ai:diagnose', async () => diagnose(aiDir));

  ipcMain.handle('ai:download', async (event) => {
    const sender = event.sender;
    abort = new AbortController();
    try {
      await manager.download(
        QWEN_3_5_4B_Q4,
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

  ipcMain.handle('ai:reset-session', async () => {
    if (runtime) await runtime.resetSession();
  });

  ipcMain.handle('ai:uninstall', async () => {
    if (runtime) {
      await runtime.unload();
      runtime = null;
    }
    await manager.uninstall(QWEN_3_5_4B_Q4);
  });

  ipcMain.handle(
    'ai:chat',
    async (
      event,
      payload: { messages: ChatMessage[]; orgId: string; userId: string },
    ) => {
      const sender = event.sender;
      const sendEvent = (e: unknown) => sender.send('ai:chat-event', e);

      try {
        if (!runtime) {
          console.log('[ai:chat] LlamaRuntime 생성 시작');
          runtime = await createLlamaRuntime({
            modelPath: manager.modelPath(QWEN_3_5_4B_Q4),
          });
          console.log('[ai:chat] runtime.load() 호출');
          await runtime.load();
          console.log('[ai:chat] runtime 로드 완료');
        }
      } catch (e: any) {
        console.error('[ai:chat] 모델 로드 실패:', e);
        sendEvent({
          type: 'error',
          message: `모델 로드 실패: ${e?.message ?? String(e)}\n\n원인 가능성: node-llama-cpp(${'3.18.1'})가 Qwen 3.5 아키텍처를 인식 못 할 수 있어요. 콘솔에서 자세한 에러 확인.`,
        });
        sendEvent({ type: 'done' });
        runtime = null;
        return;
      }

      abort = new AbortController();

      const ctx: ToolContext = {
        orgId: payload.orgId,
        userId: payload.userId,
        fileStash: getFileStash(),
        emit: (card: SmartCard) =>
          sender.send('ai:chat-event', { type: 'card', card }),
      };

      // 시스템 프롬프트가 메시지 첫 자리에 오도록 보장
      const messagesWithSystem: ChatMessage[] =
        payload.messages[0]?.role === 'system'
          ? payload.messages
          : [{ role: 'system', content: SYSTEM_PROMPT }, ...payload.messages];

      try {
        await runtime.chat(
          messagesWithSystem,
          toolDefs,
          sendEvent,
          async (name, args) => dispatcher.dispatch(name, args, ctx),
          abort.signal,
        );
      } catch (e: any) {
        console.error('[ai:chat] chat 실행 중 예외:', e);
        sendEvent({
          type: 'error',
          message: `답변 생성 실패: ${e?.message ?? String(e)}`,
        });
        sendEvent({ type: 'done' });
      }

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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createOpenRouterRuntime, friendlyProxyError, fetchUsageSummary } from '../OpenRouterRuntime';
import { createPiiVault } from '@tutomate/core';
import type { ChatMessage, ToolDefinition } from '@tutomate/core';

// OpenRouter SSE 응답을 흉내내는 ReadableStream — 이벤트 배열을 data: 라인으로 직렬화.
function sse(events: unknown[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(body));
      c.close();
    },
  });
}

const contentEvent = (content: string, finish: string | null = null) => ({
  choices: [{ delta: { content }, finish_reason: finish }],
});
const finishEvent = (finish: string) => ({ choices: [{ delta: {}, finish_reason: finish }] });
const toolCallEvent = (name: string, args: string) => ({
  choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name, arguments: args } }] }, finish_reason: null }],
});

const NO_TOOLS: ToolDefinition[] = [];
const opts = () => ({ proxyUrl: 'http://proxy.test', getAccessToken: () => 'access-token' });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function runChat(
  rt: ReturnType<typeof createOpenRouterRuntime>,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  onToolCall: (name: string, args: unknown) => Promise<unknown>,
) {
  const events: any[] = [];
  await rt.chat(messages, tools, (e) => events.push(e), onToolCall, undefined);
  return events;
}

describe('OpenRouterRuntime', () => {
  it('토큰을 스트리밍하고 done으로 끝낸다', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, body: sse([contentEvent('안'), contentEvent('녕'), finishEvent('stop')]) });
    const rt = createOpenRouterRuntime(opts());
    const events = await runChat(rt, [{ role: 'user', content: '안녕' }], NO_TOOLS, async () => ({}));

    const text = events.filter((e) => e.type === 'token').map((e) => e.token).join('');
    expect(text).toBe('안녕');
    expect(events.at(-1)).toEqual({ type: 'done' });
  });

  it('로그인 토큰이 없으면 error+done만 내고 fetch하지 않는다', async () => {
    const rt = createOpenRouterRuntime({ proxyUrl: 'http://proxy.test', getAccessToken: () => null });
    const events = await runChat(rt, [{ role: 'user', content: 'x' }], NO_TOOLS, async () => ({}));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === 'error')).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'done' });
  });

  it('도구 호출 라운드: 인자를 파싱해 onToolCall 실행 후 최종 답을 생성한다', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, body: sse([toolCallEvent('searchStudent', '{"name":"김철수"}'), finishEvent('tool_calls')]) })
      .mockResolvedValueOnce({ ok: true, body: sse([contentEvent('찾았어요', 'stop')]) });

    const onToolCall = vi.fn().mockResolvedValue({ students: [{ id: 'u1' }] });
    const rt = createOpenRouterRuntime(opts());
    const events = await runChat(rt, [{ role: 'user', content: '김철수 찾아줘' }], NO_TOOLS, onToolCall);

    expect(onToolCall).toHaveBeenCalledWith('searchStudent', { name: '김철수' });
    expect(events.some((e) => e.type === 'tool_call' && e.toolCall.name === 'searchStudent')).toBe(true);
    expect(events.some((e) => e.type === 'tool_result')).toBe(true);
    const text = events.filter((e) => e.type === 'token').map((e) => e.token).join('');
    expect(text).toBe('찾았어요');
  });

  it('finish_reason=length면 자동으로 이어쓰기 한다', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, body: sse([contentEvent('앞부분', 'length')]) })
      .mockResolvedValueOnce({ ok: true, body: sse([contentEvent('뒷부분', 'stop')]) });

    const rt = createOpenRouterRuntime(opts());
    const events = await runChat(rt, [{ role: 'user', content: '길게 써줘' }], NO_TOOLS, async () => ({}));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const text = events.filter((e) => e.type === 'token').map((e) => e.token).join('');
    expect(text).toBe('앞부분뒷부분');
  });

  it('프록시 402(quota_exceeded)를 친화적 메시지로 바꿔 보여준다', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 402,
      body: null,
      text: async () => JSON.stringify({ error: 'quota_exceeded', used: 6_000_000, cap: 5_000_000 }),
    });
    const rt = createOpenRouterRuntime(opts());
    const events = await runChat(rt, [{ role: 'user', content: 'x' }], NO_TOOLS, async () => ({}));
    const err = events.find((e) => e.type === 'error');
    expect(err.message).toContain('한도');
    expect(err.message).not.toContain('quota_exceeded'); // 내부 코드 노출 안 함
    expect(events.at(-1)).toEqual({ type: 'done' });
  });

  describe('fetchUsageSummary', () => {
    it('usage 액션을 프록시에 POST하고 요약을 반환한다', async () => {
      const summary = { used: 4_200_000, cap: 5_000_000, scope: 'org', percent: 84, remaining: 800_000, level: 'warn' };
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => summary });
      const res = await fetchUsageSummary({ proxyUrl: 'http://proxy.test', getAccessToken: () => 'access-token' });
      expect(res).toEqual(summary);
      const [url, req] = fetchMock.mock.calls[0];
      expect(url).toBe('http://proxy.test');
      expect(JSON.parse(req.body)).toEqual({ action: 'usage' });
      expect(req.headers.Authorization).toBe('Bearer access-token');
    });
    it('로그인 토큰 없으면 fetch 없이 null', async () => {
      const res = await fetchUsageSummary({ proxyUrl: 'http://proxy.test', getAccessToken: () => null });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(res).toBeNull();
    });
    it('프록시 오류(!ok)면 null — 사용량 표시는 부가 정보', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
      expect(await fetchUsageSummary({ proxyUrl: 'http://proxy.test', getAccessToken: () => 'access-token' })).toBeNull();
    });
    it('네트워크 실패(오프라인)면 null', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      expect(await fetchUsageSummary({ proxyUrl: 'http://proxy.test', getAccessToken: () => 'access-token' })).toBeNull();
    });
  });

  describe('friendlyProxyError', () => {
    it('구조화된 에러 코드를 한국어로 매핑한다', () => {
      expect(friendlyProxyError(402, '{"error":"quota_exceeded"}')).toContain('한도');
      expect(friendlyProxyError(429, '{"error":"rate_limited"}')).toContain('몰렸');
      expect(friendlyProxyError(401, '{"error":"unauthorized"}')).toContain('로그인');
      expect(friendlyProxyError(500, '{"error":"openrouter_not_configured"}')).toContain('준비');
    });
    it('상태코드 기반 폴백 · 내부 상세는 감춘다', () => {
      expect(friendlyProxyError(429, 'nonsense')).toContain('잠시');
      expect(friendlyProxyError(503, '<html>gateway</html>')).toContain('일시적');
      expect(friendlyProxyError(503, '<html>gateway</html>')).not.toContain('html');
    });
  });

  // 재시도가 백오프로 setTimeout을 쓰므로, 재시도가 얽힌 테스트는 fake timer로 즉시 진행시킨다.
  async function runChatFakeTimers(
    rt: ReturnType<typeof createOpenRouterRuntime>,
    messages: ChatMessage[],
  ) {
    vi.useFakeTimers();
    try {
      const events: any[] = [];
      const p = rt.chat(messages, NO_TOOLS, (e) => events.push(e), async () => ({}), undefined);
      await vi.runAllTimersAsync(); // 백오프 대기·중간 마이크로태스크 모두 소진
      await p;
      return events;
    } finally {
      vi.useRealTimers();
    }
  }

  it('네트워크 실패(오프라인)가 지속되면 재시도 소진 후 인터넷 연결 안내를 준다', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const rt = createOpenRouterRuntime(opts());
    const events = await runChatFakeTimers(rt, [{ role: 'user', content: 'x' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1 + 2); // 최초 1 + 재시도 2
    const err = events.find((e) => e.type === 'error');
    expect(err.message).toContain('인터넷');
    expect(events.at(-1)).toEqual({ type: 'done' });
  });

  it('일시적 5xx면 자동 재시도 후 성공한다', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503, body: null, text: async () => 'gateway' })
      .mockResolvedValueOnce({ ok: true, body: sse([contentEvent('됐어요', 'stop')]) });
    const rt = createOpenRouterRuntime(opts());
    const events = await runChatFakeTimers(rt, [{ role: 'user', content: 'x' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const text = events.filter((e) => e.type === 'token').map((e) => e.token).join('');
    expect(text).toBe('됐어요');
    expect(events.some((e) => e.type === 'error')).toBe(false);
  });

  it('일시적 오류(429)가 계속되면 재시도 소진 후 친화 메시지로 종료', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, body: null, text: async () => 'rate' });
    const rt = createOpenRouterRuntime(opts());
    const events = await runChatFakeTimers(rt, [{ role: 'user', content: 'x' }]);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 + 2 재시도
    const err = events.find((e) => e.type === 'error');
    expect(err.message).toContain('잠시'); // 429 폴백 메시지
    expect(events.at(-1)).toEqual({ type: 'done' });
  });

  it('비일시적 오류(402 한도)는 재시도하지 않고 즉시 안내', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 402,
      body: null,
      text: async () => JSON.stringify({ error: 'quota_exceeded' }),
    });
    const rt = createOpenRouterRuntime(opts());
    const events = await runChat(rt, [{ role: 'user', content: 'x' }], NO_TOOLS, async () => ({}));
    expect(fetchMock).toHaveBeenCalledTimes(1); // 재시도 없음
    const err = events.find((e) => e.type === 'error');
    expect(err.message).toContain('한도');
  });

  describe('PII 볼트 훅', () => {
    it('H2 도구 인자 복원 · H1 모델 컨텍스트 토큰화 · H3 출력 실명 복원', async () => {
      const vault = createPiiVault();
      // 볼트에 실명·연락처 등록 → 김철수=⟦S1⟧, 010-1234-5678=⟦T1⟧
      const reg = vault.tokenizeObject({ name: '김철수', phone: '010-1234-5678' }) as any;
      const sTok: string = reg.name;

      fetchMock
        // 모델은 토큰으로 인자를 넘긴다 (H2로 실명 복원되어야 함)
        .mockResolvedValueOnce({ ok: true, body: sse([toolCallEvent('searchStudent', `{"name":"${sTok}"}`), finishEvent('tool_calls')]) })
        // 최종 답은 토큰을 포함 (H3로 UI엔 실명 표시)
        .mockResolvedValueOnce({ ok: true, body: sse([contentEvent(`${sTok}님 확인했어요`, 'stop')]) });

      const toolResult = { students: [{ id: 'u1', name: '김철수', phone: '010-1234-5678' }] };
      const onToolCall = vi.fn().mockResolvedValue(toolResult);
      const rt = createOpenRouterRuntime({ ...opts(), vault });
      const events = await runChat(rt, [{ role: 'user', content: `${sTok} 확인` }], NO_TOOLS, onToolCall);

      // H2: onToolCall은 복원된 실명을 받는다
      expect(onToolCall).toHaveBeenCalledWith('searchStudent', { name: '김철수' });

      // tool_result 이벤트(UI용)는 실명 원본 유지
      const toolResultEvent = events.find((e) => e.type === 'tool_result');
      expect(JSON.stringify(toolResultEvent.toolResult)).toContain('김철수');

      // H1: 두 번째 요청(모델 컨텍스트)엔 토큰만, 실명은 없어야 한다
      const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      const toolMsg = secondBody.messages.find((m: any) => m.role === 'tool');
      expect(toolMsg.content).toContain(sTok);
      expect(toolMsg.content).not.toContain('김철수');

      // H3: UI 토큰은 실명으로 복원되어 스트리밍
      const shown = events.filter((e) => e.type === 'token').map((e) => e.token).join('');
      expect(shown).toContain('김철수님');
      expect(shown).not.toContain(sTok);
    });
  });
});

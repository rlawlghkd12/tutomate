import { describe, it, expect, vi, beforeEach } from 'vitest';

// Logger는 import.meta.env.DEV가 true여야 콘솔에 출력
// vitest는 기본적으로 DEV=true 환경

import { logger, logDebug, logInfo, logWarn, logError } from '../logger';

describe('logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('logDebug → console.debug 호출', async () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    await logDebug('테스트 디버그');
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toContain('[DEBUG]');
    expect(spy.mock.calls[0][0]).toContain('테스트 디버그');
  });

  it('logInfo → console.info 호출', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    await logInfo('정보 메시지');
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toContain('[INFO]');
  });

  it('logWarn → console.warn 호출', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await logWarn('경고 메시지');
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toContain('[WARN]');
  });

  it('logError → console.error 호출', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await logError('에러 메시지');
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toContain('[ERROR]');
  });

  it('context.component 포함 시 메시지에 표시', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    await logInfo('테스트', { component: 'MyComponent' });
    expect(spy.mock.calls[0][0]).toContain('[MyComponent]');
  });

  it('context.action 포함 시 메시지에 표시', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    await logInfo('테스트', { action: 'save' });
    expect(spy.mock.calls[0][0]).toContain('[save]');
  });

  it('timestamp 포함', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    await logInfo('테스트');
    // ISO timestamp 패턴: [2026-...]
    expect(spy.mock.calls[0][0]).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
  });

  it('context.data가 두 번째 인자로 전달됨', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const data = { key: 'value' };
    await logInfo('테스트', { data });
    expect(spy.mock.calls[0][1]).toBe(data);
  });

  it('logError — context.error가 두 번째 인자로 전달됨', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('original');
    await logError('에러', { error: err });
    expect(spy.mock.calls[0][1]).toBe(err);
  });

  it('startTimer → end() 호출 시 디버그 로그', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const end = logger.startTimer('test-op');
    end();
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toContain('Performance: test-op');
  });
});

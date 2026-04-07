// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockGetSession = vi.fn();
const mockInsert = vi.fn().mockResolvedValue({ error: null });

vi.mock('../../config/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
    from: () => ({
      insert: mockInsert,
    }),
  },
}));

import { reportError } from '../errorReporter';

describe('errorReporter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as any).__APP_CONFIG__;
  });

  it('세션이 없으면 insert 호출하지 않음', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await reportError(new Error('test error'));

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('세션이 있으면 error_logs에 insert 호출', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: { user: { id: 'user-123' } },
      },
    });

    await reportError(new Error('test error'), 'TestComponent');

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        error_message: 'test error',
        component: 'TestComponent',
        app_version: 'unknown',
        app_name: 'unknown',
      }),
    );
  });

  it('__APP_CONFIG__ 설정 시 version, appName 반영', async () => {
    (globalThis as any).__APP_CONFIG__ = {
      version: '1.2.3',
      appName: 'TutorMate',
    };

    mockGetSession.mockResolvedValue({
      data: {
        session: { user: { id: 'user-123' } },
      },
    });

    await reportError(new Error('test error'));

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        app_version: '1.2.3',
        app_name: 'TutorMate',
      }),
    );
  });

  it('component 미전달 시 null 전달', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: { user: { id: 'user-123' } },
      },
    });

    await reportError(new Error('test error'));

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        component: null,
      }),
    );
  });

  it('insert 예외 발생해도 에러 전파 안 됨', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: { user: { id: 'user-123' } },
      },
    });
    mockInsert.mockRejectedValueOnce(new Error('insert failed'));

    // 에러 전파 없이 정상 완료
    await expect(reportError(new Error('test'))).resolves.toBeUndefined();
  });

  it('getSession 예외 발생해도 에러 전파 안 됨', async () => {
    mockGetSession.mockRejectedValue(new Error('session error'));

    await expect(reportError(new Error('test'))).resolves.toBeUndefined();
  });
});

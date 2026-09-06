import { describe, it, expect } from 'vitest';
import { dispatchErrorMessage } from '../dispatchResult';

describe('dispatchErrorMessage', () => {
  it('성공 결과 → null', () => {
    expect(dispatchErrorMessage({ result: { status: 'done', added: 3 } })).toBeNull();
  });
  it('도구 실행 에러(result.error) 감지', () => {
    expect(
      dispatchErrorMessage({ result: { error: { code: 'execution_failed', message: 'Supabase 오류' } } }),
    ).toBe('Supabase 오류');
  });
  it('최상위 에러(forbidden 등) 감지', () => {
    expect(dispatchErrorMessage({ error: { code: 'forbidden', message: '권한 없음' } })).toBe('권한 없음');
  });
  it('메시지 없는 에러 → 기본 문구', () => {
    expect(dispatchErrorMessage({ result: { error: {} } })).toBe('알 수 없는 오류');
  });
  it('null/undefined → null', () => {
    expect(dispatchErrorMessage(null)).toBeNull();
    expect(dispatchErrorMessage(undefined)).toBeNull();
  });
});

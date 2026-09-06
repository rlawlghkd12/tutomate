/**
 * ai:dispatch(IPC) 결과에서 에러를 추출하는 순수 헬퍼.
 *
 * 반환 형태: `{ result?, error? }`.
 * - 최상위 `error`: 인증/권한(forbidden) 등 핸들러 레벨 오류.
 * - `result.error`: 도구 실행 오류 — ActionDispatcher가 throw를 `{error:{code,message}}`로 감싸
 *   `result`에 담아 반환하므로 여기로 온다. (이걸 놓치면 저장 실패를 성공으로 오인함)
 */
export interface DispatchEnvelope {
  result?: unknown;
  error?: { code?: string; message?: string };
}

/** 에러가 있으면 사용자용 메시지, 없으면 null. 두 위치(최상위·result.error)를 모두 확인. */
export function dispatchErrorMessage(r: DispatchEnvelope | null | undefined): string | null {
  const inner = (r?.result as { error?: { message?: string } } | undefined)?.error;
  const e = r?.error ?? inner;
  return e ? e.message ?? '알 수 없는 오류' : null;
}

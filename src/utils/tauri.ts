/**
 * Tauri 환경 감지 유틸리티
 * 브라우저에서 실행 시 Tauri API가 없으므로 폴백 처리에 사용
 */
export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Electron 환경 감지 유틸리티
 * 브라우저에서 실행 시 Electron API가 없으므로 폴백 처리에 사용
 *
 * NOTE: 하위 호환을 위해 isTauri도 isElectron의 alias로 유지
 */
export const isElectron = (): boolean =>
  typeof window !== 'undefined' && 'electronAPI' in window;

/** @deprecated isElectron()을 사용하세요 */
export const isTauri = isElectron;

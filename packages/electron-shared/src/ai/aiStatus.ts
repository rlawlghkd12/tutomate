/**
 * ai:status 결정 로직 (순수) — Electron IPC 핸들러(전기·파일시스템 의존)에서 분리해 단위 테스트 가능하게.
 *
 * 핵심 불변식: **클라우드(OpenRouter) 백엔드는 로컬 모델·엔진·VC++가 전혀 필요 없다.**
 * 이 검사를 건너뛰지 않으면 클라우드 사용자에게 불필요한 4GB 로컬 모델 다운로드를 강요하게 된다
 * (실제로 그런 버그가 있었다). 그래서 cloud=true면 로컬 자산 상태와 무관하게 'ready'.
 */

export type AiRuntimeStatus = 'not_installed' | 'engine_missing' | 'ready' | 'loading_pending';

export interface AiStatusInputs {
  /** 클라우드 경로 활성 여부 = 백엔드가 openrouter이고 proxyUrl이 있음(ensureRuntime과 동일 조건). */
  cloud: boolean;
  /** 로컬 모델(gguf) 설치됨. */
  modelInstalled: boolean;
  /** 로컬 엔진(llama-server 바이너리) 존재. */
  enginePresent: boolean;
  /** Windows VC++ 재배포 설치됨(비 Windows는 true로 전달). */
  vcRedistInstalled: boolean;
  /** 런타임이 이미 로드(spawn)됐는지 — 로컬에서 loading_pending↔ready 구분용. */
  runtimeLoaded: boolean;
}

export function resolveAiStatus(inputs: AiStatusInputs): AiRuntimeStatus {
  // 클라우드: 로컬 자산 검사를 아예 건너뛴다(원격 프록시 경유이므로 준비 완료).
  if (inputs.cloud) return 'ready';
  if (!inputs.modelInstalled) return 'not_installed';
  if (!inputs.enginePresent) return 'engine_missing';
  // 엔진·모델은 있는데 VC++만 빠진 케이스 — 다운로드 모달이 ensure-vcredist로 자동 복구.
  if (!inputs.vcRedistInstalled) return 'engine_missing';
  return inputs.runtimeLoaded ? 'ready' : 'loading_pending';
}

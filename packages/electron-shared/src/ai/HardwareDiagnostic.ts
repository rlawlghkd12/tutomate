import os from 'node:os';
import fs from 'node:fs';

export type Recommendation = 'ok' | 'warn' | 'block';
export type Tier = 'fast' | 'slow' | 'unsupported';

export interface DiagnosticInput {
  ramGB: number;
  diskGB: number;
}

export interface DiagnosticResult {
  ramGB: number;
  diskGB: number;
  recommendation: Recommendation;
  tier: Tier;
}

/**
 * 사양 분기 결정 — Qwen 3.5 4B (UD-Q4_K_XL, 2.91GB) 기준. 순수 함수, 테스트 가능.
 *
 * 4B 모델 추론 시 메모리 점유: 모델 ~3GB + KV cache ~1GB + OS/앱 ~2GB → 8GB는 빡빡.
 * - 16GB+ RAM, 4GB+ disk → ok / fast (쾌적, 응답 빠름)
 * - 8GB RAM, 4GB+ disk → ok / slow (응답 15~30초 가능, 다른 앱 종료 권장)
 * - 6~7GB RAM 또는 디스크 부족 → warn / slow
 * - 6GB 미만 또는 디스크 3GB 미만 → block / unsupported
 */
export function decideRecommendation(input: DiagnosticInput): {
  recommendation: Recommendation;
  tier: Tier;
} {
  const { ramGB, diskGB } = input;
  if (ramGB < 6 || diskGB < 3) return { recommendation: 'block', tier: 'unsupported' };
  if (ramGB >= 16 && diskGB >= 4) return { recommendation: 'ok', tier: 'fast' };
  if (ramGB >= 8 && diskGB >= 4) return { recommendation: 'ok', tier: 'slow' };
  return { recommendation: 'warn', tier: 'slow' };
}

/**
 * RAM 용량에 따른 llama-server 컨텍스트 크기 결정 (순수 함수, 테스트 가능).
 *
 * 컨텍스트가 클수록 KV 캐시가 커지고, prefill(첫 토큰까지 시간)도 컨텍스트 길이에
 * 비례해 느려진다. 저사양일수록 작게 잡아 체감 응답을 빠르게 한다.
 * (llama-server는 KV 양자화 q8_0과 flash attention을 함께 써서 메모리·속도 모두 개선.)
 *
 * Qwen 4B Q4 + KV q8_0 기준 KV 캐시 메모리:
 *   4096 ≈ 0.25GB,  8192 ≈ 0.5GB,  16384 ≈ 1GB,  32768 ≈ 2GB
 *
 * 분기:
 * - 8GB 미만 → 4096 (저사양에서 prefill 부담 절반으로 — "한세월" 방지)
 * - 16GB 미만 → 8192 (8GB 사용자가 여기 들어옴 — 컨텍스트 절반으로 줄여 체감 응답↑)
 *   ↑ 위 두 줄은 동일 라이브러리에서 8GB가 4096으로 떨어지도록 8 기준으로 분기.
 * - 32GB 미만 → 16384
 * - 32GB+ → 32768
 */
export function decideContextSize(ramGB: number): number {
  if (ramGB >= 32) return 32768;
  if (ramGB >= 16) return 16384;
  if (ramGB >= 8) return 8192;
  return 4096;
}

/**
 * 실 시스템 진단. targetDir의 디스크 여유 측정.
 * statfs 실패 시 999GB로 가정 (디스크 영향 배제) — RAM 단독 분기.
 */
export async function diagnose(targetDir: string): Promise<DiagnosticResult> {
  const ramGB = os.totalmem() / 1024 ** 3;
  let diskGB = 999;
  try {
    const stats = await fs.promises.statfs(targetDir);
    diskGB = (stats.bavail * stats.bsize) / 1024 ** 3;
  } catch {
    // statfs 미지원/접근 불가 → 디스크 영향 배제
  }
  const decision = decideRecommendation({ ramGB, diskGB });
  return {
    ramGB: Math.round(ramGB * 10) / 10,
    diskGB: Math.round(diskGB * 10) / 10,
    ...decision,
  };
}

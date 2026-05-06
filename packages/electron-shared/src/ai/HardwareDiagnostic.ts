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
 * 사양 분기 결정 — Qwen 3.5 4B (Q4_K_M, 2.74GB) 기준. 순수 함수, 테스트 가능.
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

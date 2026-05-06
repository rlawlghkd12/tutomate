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
 * 사양 분기 결정 — 순수 함수, 테스트 가능.
 * - 16GB+ RAM, 5GB+ disk → ok / fast (쾌적)
 * - 8GB RAM, 3GB+ disk → ok / slow ("응답 10~20초 걸릴 수 있어요")
 * - 4~7GB RAM 또는 8GB지만 disk 부족 → warn / slow
 * - 4GB 미만 또는 디스크 2GB 미만 → block / unsupported
 */
export function decideRecommendation(input: DiagnosticInput): {
  recommendation: Recommendation;
  tier: Tier;
} {
  const { ramGB, diskGB } = input;
  if (ramGB < 4 || diskGB < 2) return { recommendation: 'block', tier: 'unsupported' };
  if (ramGB >= 16 && diskGB >= 5) return { recommendation: 'ok', tier: 'fast' };
  if (ramGB >= 8 && diskGB >= 3) return { recommendation: 'ok', tier: 'slow' };
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

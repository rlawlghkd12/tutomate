import { describe, it, expect } from 'vitest';
import { decideRecommendation } from '../HardwareDiagnostic';

describe('decideRecommendation (Qwen 3.5 4B 기준)', () => {
  it('16GB+ RAM, 4GB+ disk → ok / fast', () => {
    expect(decideRecommendation({ ramGB: 16, diskGB: 10 })).toEqual({
      recommendation: 'ok', tier: 'fast',
    });
    expect(decideRecommendation({ ramGB: 32, diskGB: 100 })).toEqual({
      recommendation: 'ok', tier: 'fast',
    });
  });

  it('8GB RAM, 4GB+ disk → ok / slow', () => {
    expect(decideRecommendation({ ramGB: 8, diskGB: 4 })).toEqual({
      recommendation: 'ok', tier: 'slow',
    });
    expect(decideRecommendation({ ramGB: 12, diskGB: 5 })).toEqual({
      recommendation: 'ok', tier: 'slow',
    });
  });

  it('6~7GB RAM → warn', () => {
    expect(decideRecommendation({ ramGB: 6, diskGB: 4 }).recommendation).toBe('warn');
    expect(decideRecommendation({ ramGB: 7, diskGB: 4 }).recommendation).toBe('warn');
  });

  it('6GB 미만 또는 디스크 3GB 미만 → block', () => {
    expect(decideRecommendation({ ramGB: 5, diskGB: 4 }).recommendation).toBe('block');
    expect(decideRecommendation({ ramGB: 16, diskGB: 2 }).recommendation).toBe('block');
    expect(decideRecommendation({ ramGB: 8, diskGB: 2.5 }).recommendation).toBe('block');
  });
});

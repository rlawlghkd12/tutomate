import { describe, it, expect } from 'vitest';
import { decideRecommendation } from '../HardwareDiagnostic';

describe('decideRecommendation', () => {
  it('16GB+ RAM, 5GB+ disk → ok / fast', () => {
    expect(decideRecommendation({ ramGB: 16, diskGB: 10 })).toEqual({
      recommendation: 'ok', tier: 'fast',
    });
    expect(decideRecommendation({ ramGB: 32, diskGB: 100 })).toEqual({
      recommendation: 'ok', tier: 'fast',
    });
  });

  it('8GB RAM, 3GB+ disk → ok / slow', () => {
    expect(decideRecommendation({ ramGB: 8, diskGB: 3 })).toEqual({
      recommendation: 'ok', tier: 'slow',
    });
    expect(decideRecommendation({ ramGB: 12, diskGB: 4 })).toEqual({
      recommendation: 'ok', tier: 'slow',
    });
  });

  it('4~7GB RAM → warn', () => {
    expect(decideRecommendation({ ramGB: 5, diskGB: 4 }).recommendation).toBe('warn');
    expect(decideRecommendation({ ramGB: 7, diskGB: 4 }).recommendation).toBe('warn');
  });

  it('4GB 미만 또는 디스크 2GB 미만 → block', () => {
    expect(decideRecommendation({ ramGB: 3, diskGB: 4 }).recommendation).toBe('block');
    expect(decideRecommendation({ ramGB: 16, diskGB: 1 }).recommendation).toBe('block');
    expect(decideRecommendation({ ramGB: 8, diskGB: 1.5 }).recommendation).toBe('block');
  });
});

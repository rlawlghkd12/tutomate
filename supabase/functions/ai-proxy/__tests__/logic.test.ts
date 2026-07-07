import { describe, it, expect } from 'vitest';
import { selectModel, pickActiveOrgId, usageFromDataLine, isRateLimited, summarizeUsage, ALLOWED_MODELS } from '../logic';

describe('selectModel', () => {
  it('allowlist에 있는 요청 모델은 그대로 쓴다', () => {
    expect(selectModel('deepseek/deepseek-v4-flash', 'qwen/qwen3-30b-a3b')).toBe('deepseek/deepseek-v4-flash');
  });
  it('allowlist 밖·비문자열·미지정은 기본 모델로 강제', () => {
    expect(selectModel('gpt-4o', 'qwen/qwen3-30b-a3b')).toBe('qwen/qwen3-30b-a3b');
    expect(selectModel(undefined, 'qwen/qwen3-30b-a3b')).toBe('qwen/qwen3-30b-a3b');
    expect(selectModel(123, 'qwen/qwen3-30b-a3b')).toBe('qwen/qwen3-30b-a3b');
  });
  it('후보 모델을 노출한다', () => {
    expect(ALLOWED_MODELS).toContain('google/gemini-2.5-flash-lite');
    expect(ALLOWED_MODELS).toContain('google/gemini-3.1-flash-lite');
    expect(ALLOWED_MODELS.length).toBe(4);
  });
});

describe('pickActiveOrgId', () => {
  it('active를 최우선으로 고른다', () => {
    const rows = [
      { organization_id: 'a', role: 'owner', is_active: false },
      { organization_id: 'b', role: 'member', is_active: true },
    ];
    expect(pickActiveOrgId(rows)).toBe('b');
  });
  it('active가 없으면 owner를 고른다', () => {
    const rows = [
      { organization_id: 'a', role: 'member', is_active: false },
      { organization_id: 'b', role: 'owner', is_active: false },
    ];
    expect(pickActiveOrgId(rows)).toBe('b');
  });
  it('active·owner 모두 없으면 첫 번째', () => {
    const rows = [
      { organization_id: 'a', role: 'member', is_active: false },
      { organization_id: 'b', role: 'member', is_active: false },
    ];
    expect(pickActiveOrgId(rows)).toBe('a');
  });
  it('빈 배열·null은 null', () => {
    expect(pickActiveOrgId([])).toBeNull();
    expect(pickActiveOrgId(null)).toBeNull();
    expect(pickActiveOrgId(undefined)).toBeNull();
  });
});

describe('isRateLimited', () => {
  it('한도 이상이면 true', () => {
    expect(isRateLimited(10, 10)).toBe(true);
    expect(isRateLimited(11, 10)).toBe(true);
  });
  it('한도 미만이면 false', () => {
    expect(isRateLimited(9, 10)).toBe(false);
  });
  it('limit<=0이면 비활성(항상 false)', () => {
    expect(isRateLimited(9999, 0)).toBe(false);
    expect(isRateLimited(9999, -1)).toBe(false);
  });
});

describe('summarizeUsage', () => {
  it('정상 범위: percent·remaining·level(none) 계산', () => {
    expect(summarizeUsage(1_000_000, 5_000_000, 'org')).toEqual({
      used: 1_000_000, cap: 5_000_000, scope: 'org', percent: 20, remaining: 4_000_000, level: 'none',
    });
  });
  it('80% 이상이면 level=warn', () => {
    const s = summarizeUsage(4_200_000, 5_000_000, 'user');
    expect(s.percent).toBe(84);
    expect(s.level).toBe('warn');
  });
  it('한도 도달·초과면 level=exceeded, percent는 100으로 클램프, remaining 0', () => {
    const s = summarizeUsage(6_000_000, 5_000_000, 'org');
    expect(s.percent).toBe(100);
    expect(s.remaining).toBe(0);
    expect(s.level).toBe('exceeded');
  });
  it('cap<=0(무제한)은 percent 0·remaining null·level none', () => {
    expect(summarizeUsage(9_999, 0, 'user')).toEqual({
      used: 9_999, cap: 0, scope: 'user', percent: 0, remaining: null, level: 'none',
    });
  });
  it('비정상 used(음수·NaN)는 0으로 처리', () => {
    expect(summarizeUsage(-5, 5_000_000, 'org').used).toBe(0);
    expect(summarizeUsage(NaN, 5_000_000, 'org').used).toBe(0);
  });
});

describe('usageFromDataLine', () => {
  it('usage가 담긴 data 라인을 파싱한다', () => {
    const line = 'data: ' + JSON.stringify({ usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
    expect(usageFromDataLine(line)).toEqual({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
  });
  it('usage 없는 delta 라인은 null', () => {
    expect(usageFromDataLine('data: ' + JSON.stringify({ choices: [{ delta: { content: '안' } }] }))).toBeNull();
  });
  it('[DONE]·비 data·malformed는 null', () => {
    expect(usageFromDataLine('data: [DONE]')).toBeNull();
    expect(usageFromDataLine(': keep-alive')).toBeNull();
    expect(usageFromDataLine('data: {not json')).toBeNull();
    expect(usageFromDataLine('')).toBeNull();
  });
});

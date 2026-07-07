import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getAiBackend, getAiProxyUrl, getAiModelOverride } from '../openRouterConfig';

const ENV_KEYS = [
  'TUTOMATE_AI_BACKEND',
  'TUTOMATE_AI_PROXY_URL',
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'TUTOMATE_AI_MODEL',
] as const;

let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('getAiBackend', () => {
  it('TUTOMATE_AI_BACKEND=openrouter일 때만 openrouter', () => {
    process.env.TUTOMATE_AI_BACKEND = 'openrouter';
    expect(getAiBackend()).toBe('openrouter');
  });
  it('미설정·다른 값이면 llama(로컬)', () => {
    expect(getAiBackend()).toBe('llama');
    process.env.TUTOMATE_AI_BACKEND = 'local';
    expect(getAiBackend()).toBe('llama');
  });
});

describe('getAiProxyUrl', () => {
  it('명시적 URL이 최우선', () => {
    process.env.TUTOMATE_AI_PROXY_URL = 'https://custom/proxy';
    process.env.SUPABASE_URL = 'https://proj.supabase.co';
    expect(getAiProxyUrl()).toBe('https://custom/proxy');
  });
  it('SUPABASE_URL에서 유도하며 끝 슬래시를 제거한다', () => {
    process.env.SUPABASE_URL = 'https://proj.supabase.co/';
    expect(getAiProxyUrl()).toBe('https://proj.supabase.co/functions/v1/ai-proxy');
  });
  it('SUPABASE_URL 없으면 VITE_SUPABASE_URL로 폴백', () => {
    process.env.VITE_SUPABASE_URL = 'https://vite.supabase.co';
    expect(getAiProxyUrl()).toBe('https://vite.supabase.co/functions/v1/ai-proxy');
  });
  it('아무 것도 없으면 null', () => {
    expect(getAiProxyUrl()).toBeNull();
  });
});

describe('getAiModelOverride', () => {
  it('후보에 있는 모델만 override로 통과', () => {
    process.env.TUTOMATE_AI_MODEL = 'deepseek/deepseek-v4-flash';
    expect(getAiModelOverride()).toBe('deepseek/deepseek-v4-flash');
  });
  it('후보 밖·미설정은 undefined(프록시 기본값 사용)', () => {
    expect(getAiModelOverride()).toBeUndefined();
    process.env.TUTOMATE_AI_MODEL = 'openai/gpt-4o';
    expect(getAiModelOverride()).toBeUndefined();
  });
});

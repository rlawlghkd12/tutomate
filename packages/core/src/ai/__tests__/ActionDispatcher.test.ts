import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createDispatcher } from '../ActionDispatcher';

const echoTool = {
  name: 'echo',
  description: 'echoes input',
  schema: z.object({ text: z.string() }),
  execute: vi.fn(async (a) => ({ echoed: a.text })),
};

const ctx = { orgId: 'o1', userId: 'u1' };

describe('ActionDispatcher', () => {
  it('정상 인자 → execute 호출, 결과 반환', async () => {
    const d = createDispatcher([echoTool]);
    const r = await d.dispatch('echo', { text: 'hi' }, ctx);
    expect(r).toEqual({ echoed: 'hi' });
  });

  it('존재하지 않는 도구 → 에러 객체', async () => {
    const d = createDispatcher([echoTool]);
    const r = await d.dispatch('nope', {}, ctx);
    expect(r).toMatchObject({ error: { code: 'unknown_tool' } });
  });

  it('zod 검증 실패 → invalid_args', async () => {
    const d = createDispatcher([echoTool]);
    const r = await d.dispatch('echo', { text: 123 }, ctx);
    expect(r).toMatchObject({ error: { code: 'invalid_args' } });
  });

  it('execute 예외 → execution_failed', async () => {
    const failing = {
      ...echoTool,
      name: 'fail',
      execute: vi.fn(async () => { throw new Error('boom'); }),
    };
    const d = createDispatcher([failing]);
    const r = await d.dispatch('fail', { text: 'x' }, ctx);
    expect(r).toMatchObject({ error: { code: 'execution_failed', message: 'boom' } });
  });

  it('list / has 조회', () => {
    const d = createDispatcher([echoTool]);
    expect(d.list()).toEqual([{ name: 'echo', description: 'echoes input' }]);
    expect(d.has('echo')).toBe(true);
    expect(d.has('nope')).toBe(false);
  });
});

import type { ToolContext, ToolHandler } from './types';

export interface Dispatcher {
  dispatch(name: string, args: unknown, ctx: ToolContext): Promise<unknown>;
  list(): { name: string; description: string }[];
  has(name: string): boolean;
}

/**
 * 도구 호출 라우터.
 * - 존재하지 않는 도구: { error: { code: 'unknown_tool' } }
 * - zod 검증 실패: { error: { code: 'invalid_args' } }
 * - 실행 예외: { error: { code: 'execution_failed' } }
 *
 * LLM이 환각으로 잘못된 도구를 호출해도 안전하게 차단.
 */
type AnyTool = ToolHandler<any>;

export function createDispatcher(tools: AnyTool[]): Dispatcher {
  const map = new Map<string, AnyTool>();
  for (const t of tools) map.set(t.name, t);

  return {
    async dispatch(name, args, ctx) {
      const tool = map.get(name);
      if (!tool) {
        return {
          error: {
            code: 'unknown_tool',
            message: `존재하지 않는 도구: ${name}`,
          },
        };
      }
      const parsed = tool.schema.safeParse(args);
      if (!parsed.success) {
        return {
          error: {
            code: 'invalid_args',
            message: parsed.error.message,
          },
        };
      }
      try {
        return await tool.execute(parsed.data, ctx);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          error: { code: 'execution_failed', message: msg },
        };
      }
    },
    list() {
      return Array.from(map.values()).map((t) => ({
        name: t.name,
        description: t.description,
      }));
    },
    has(name) {
      return map.has(name);
    },
  };
}

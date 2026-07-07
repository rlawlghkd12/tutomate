import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// preload.cjs가 Electron이 실제로 로드하는 런타임 preload다(각 앱 vite.config의 copy-preload가
// src/preload.cjs → dist-electron/preload.cjs로 복사). preload.ts는 참조/타입용 미러라
// 여기에만 메서드를 추가하고 .cjs를 빠뜨리면, 렌더러의 window.electronAPI.xxx 호출이
// 런타임에 조용히 undefined가 되어 기능이 죽는다(실제로 aiBackendInfo·aiUsage가 그랬다).
// 이 테스트는 그 드리프트를 CI에서 잡는다.

function methodNames(src: string): Set<string> {
  const names = new Set<string>();
  // contextBridge 노출 객체의 2칸 들여쓴 최상위 키(`name:`)만 추출.
  for (const m of src.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*):/gm)) names.add(m[1]);
  return names;
}

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('preload 패리티 (.ts ↔ 런타임 .cjs)', () => {
  it('preload.ts에 선언된 모든 메서드는 런타임 preload.cjs에도 존재해야 한다', () => {
    const ts = methodNames(read('../preload.ts'));
    const cjs = methodNames(read('../preload.cjs'));
    const missingInRuntime = [...ts].filter((n) => !cjs.has(n));
    expect(missingInRuntime).toEqual([]);
  });

  it('클라우드 마이그레이션이 의존하는 AI 메서드가 런타임 preload에 있다', () => {
    const cjs = methodNames(read('../preload.cjs'));
    for (const m of ['aiStatus', 'aiBackendInfo', 'aiUsage', 'aiChat', 'aiSummarize', 'aiResetSession']) {
      expect(cjs.has(m)).toBe(true);
    }
  });
});

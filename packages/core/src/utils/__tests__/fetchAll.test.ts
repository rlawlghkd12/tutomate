import { describe, it, expect, vi } from 'vitest';
import {
  fetchAllPages,
  fetchAllByIds,
  errorMessage,
  FETCH_PAGE_SIZE,
  IN_CHUNK_SIZE,
  MAX_FETCH_PAGES,
} from '../fetchAll';

const rows = (start: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `r${start + i}` }));

/** 서버 흉내: 전체 행을 들고 있다가 range 요청에 한도(cap)만큼 잘라 준다 */
function server(total: { id: string }[], cap = FETCH_PAGE_SIZE) {
  return vi.fn((from: number, to: number) =>
    Promise.resolve({ data: total.slice(from, Math.min(to + 1, from + cap)), error: null }),
  );
}

describe('fetchAllPages', () => {
  it('한 페이지 미만이면 그대로 반환 (빈 페이지 확인까지 2번 요청)', async () => {
    const page = server(rows(0, 3));
    const res = await fetchAllPages(page);
    expect(res).toEqual({ data: rows(0, 3), error: null, truncated: false });
    expect(page).toHaveBeenNthCalledWith(1, 0, FETCH_PAGE_SIZE - 1);
    expect(page).toHaveBeenCalledTimes(2);
  });

  it('1,000행을 넘으면 끝까지 읽음 (2,577행)', async () => {
    const res = await fetchAllPages(server(rows(0, 2577)));
    expect(res.data).toHaveLength(2577);
    expect(res.truncated).toBe(false);
  });

  it('서버 한도(500)가 페이지보다 작아도 빠짐없이 읽음', async () => {
    const page = server(rows(0, 1200), 500);
    const res = await fetchAllPages(page);
    expect(res.data).toHaveLength(1200);
    expect(page).toHaveBeenNthCalledWith(2, 500, 1499);
  });

  it('data가 null이면 빈 결과', async () => {
    const res = await fetchAllPages(() => Promise.resolve({ data: null, error: null }));
    expect(res).toEqual({ data: [], error: null, truncated: false });
  });

  it('중간 페이지 에러 → 빈 data와 error (부분 결과 안 줌)', async () => {
    const err = { message: 'timeout' };
    const page = vi
      .fn()
      .mockResolvedValueOnce({ data: rows(0, 1000), error: null })
      .mockResolvedValueOnce({ data: null, error: err });
    const res = await fetchAllPages(page);
    expect(res).toEqual({ data: [], error: err, truncated: false });
  });

  it('경계에서 같은 id가 다시 오면 한 번만, id 없는 행은 모두 담음', async () => {
    const page = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: 'a' }, { id: 'b' }, { n: 1 }], error: null })
      .mockResolvedValueOnce({ data: [{ id: 'b' }, { id: 'c' }, { n: 1 }, null], error: null })
      .mockResolvedValue({ data: [], error: null });
    const res = await fetchAllPages<any>(page);
    expect(res.data).toEqual([{ id: 'a' }, { id: 'b' }, { n: 1 }, { id: 'c' }, { n: 1 }, null]);
  });

  it('페이지 상한에서 멈추고 truncated=true', async () => {
    const page = vi.fn((from: number) => Promise.resolve({ data: [{ id: `p${from}` }], error: null }));
    const res = await fetchAllPages(page);
    expect(page).toHaveBeenCalledTimes(MAX_FETCH_PAGES);
    expect(res.truncated).toBe(true);
    expect(res.data).toHaveLength(MAX_FETCH_PAGES);
  });
});

describe('fetchAllByIds', () => {
  it('id를 200개씩 나눠 조회하고 합침 (중복 id는 한 번만 요청)', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `e${i}`);
    const chunks: string[][] = [];
    const res = await fetchAllByIds([...ids, 'e0', 'e1'], (chunk, from) => {
      if (from === 0) chunks.push(chunk);
      return Promise.resolve({
        data: from === 0 ? chunk.map((id) => ({ id: `pay-${id}` })) : [],
        error: null,
      });
    });
    expect(chunks.map((c) => c.length)).toEqual([IN_CHUNK_SIZE, IN_CHUNK_SIZE, 50]);
    expect(res.data).toHaveLength(450);
    expect(res.error).toBeNull();
    expect(res.truncated).toBe(false);
  });

  it('빈 목록이면 요청 없이 빈 결과', async () => {
    const page = vi.fn();
    expect(await fetchAllByIds([], page)).toEqual({ data: [], error: null, truncated: false });
    expect(page).not.toHaveBeenCalled();
  });

  it('한 묶음이라도 에러면 빈 data와 error', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `e${i}`);
    const err = { message: 'boom' };
    const page = vi.fn((chunk: string[], from: number) =>
      Promise.resolve(
        chunk[0] === 'e200'
          ? { data: null, error: err }
          : { data: from === 0 ? [{ id: 'x' }] : [], error: null },
      ),
    );
    expect(await fetchAllByIds(ids, page)).toEqual({ data: [], error: err, truncated: false });
  });

  it('묶음이 페이지 상한에 걸리면 truncated=true', async () => {
    const page = vi.fn((_c: string[], from: number) =>
      Promise.resolve({ data: [{ id: `p${from}` }], error: null }),
    );
    const res = await fetchAllByIds(['a'], page);
    expect(res.truncated).toBe(true);
  });
});

describe('errorMessage', () => {
  it('message 속성 / 그 외 값', () => {
    expect(errorMessage({ message: 'x' })).toBe('x');
    expect(errorMessage(new Error('y'))).toBe('y');
    expect(errorMessage('z')).toBe('z');
    expect(errorMessage(null)).toBe('null');
  });
});

import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIncrementalRows, LoadMoreButton, INCREMENTAL_PAGE_SIZE } from '../useIncrementalRows';

const items = (n: number) => Array.from({ length: n }, (_, i) => i);

function List({ total, resetKey }: { total: number; resetKey?: string }) {
  const { visible, remaining, loadMore, sentinelRef } = useIncrementalRows(items(total), { resetKey });
  return (
    <div>
      <span data-testid="count">{visible.length}</span>
      <LoadMoreButton remaining={remaining} onClick={loadMore} sentinelRef={sentinelRef} />
    </div>
  );
}

describe('useIncrementalRows', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('100행 이하면 전부 그리고 더 보기 없음', () => {
    render(<List total={80} />);
    expect(screen.getByTestId('count').textContent).toBe('80');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('처음 100행만 그리고, 더 보기를 누르면 100행씩 늘어남', async () => {
    render(<List total={250} />);
    expect(screen.getByTestId('count').textContent).toBe(String(INCREMENTAL_PAGE_SIZE));
    await userEvent.click(screen.getByRole('button', { name: '더 보기 (남은 150건)' }));
    expect(screen.getByTestId('count').textContent).toBe('200');
    await userEvent.click(screen.getByRole('button', { name: '더 보기 (남은 50건)' }));
    expect(screen.getByTestId('count').textContent).toBe('250');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('resetKey가 바뀌면(검색·정렬) 처음 묶음으로 돌아감', async () => {
    const { rerender } = render(<List total={250} resetKey="a" />);
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('count').textContent).toBe('200');
    rerender(<List total={250} resetKey="b" />);
    expect(screen.getByTestId('count').textContent).toBe('100');
  });

  it('감시 요소가 화면에 닿으면 자동으로 다음 묶음을 그림', () => {
    let trigger: (hit: boolean) => void = () => {};
    const disconnect = vi.fn();
    class FakeObserver {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        trigger = (hit) => cb([{ isIntersecting: hit }]);
      }
      observe() {}
      disconnect = disconnect;
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver);

    const { unmount } = render(<List total={250} />);
    act(() => trigger(false));
    expect(screen.getByTestId('count').textContent).toBe('100');
    act(() => trigger(true));
    expect(screen.getByTestId('count').textContent).toBe('200');
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it('pageSize 지정 가능', () => {
    const { result } = renderHook(() => useIncrementalRows(items(30), { pageSize: 10 }));
    expect(result.current.visible).toHaveLength(10);
    expect(result.current.remaining).toBe(20);
  });
});

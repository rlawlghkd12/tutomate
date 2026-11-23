import { useCallback, useEffect, useRef, useState } from 'react';

/** 처음 그리는 행 수이자 한 번에 더 그리는 행 수 */
export const INCREMENTAL_PAGE_SIZE = 100;

export interface IncrementalRows<T> {
  /** 지금 화면에 그릴 행 */
  visible: T[];
  /** 아직 안 그린 행 수 */
  remaining: number;
  /** 다음 묶음을 그린다 */
  loadMore: () => void;
  /** 목록 끝에 붙이는 감시 요소 ref — 화면에 가까워지면 자동으로 loadMore */
  sentinelRef: (node: Element | null) => void;
}

/**
 * 긴 목록을 무한 스크롤로 나눠 그린다 (데이터는 이미 메모리에 있고, DOM만 나눠 그림).
 *
 * 검색·정렬·필터가 바뀌면 `resetKey`를 바꿔 처음 묶음으로 되돌린다.
 * IntersectionObserver가 없는 환경(테스트 등)에서는 자동 로드 대신 "더 보기" 버튼으로 동작한다.
 */
export function useIncrementalRows<T>(
  items: readonly T[],
  { pageSize = INCREMENTAL_PAGE_SIZE, resetKey }: { pageSize?: number; resetKey?: unknown } = {},
): IncrementalRows<T> {
  const [limit, setLimit] = useState(pageSize);

  useEffect(() => {
    setLimit(pageSize);
  }, [resetKey, pageSize]);

  const remaining = Math.max(0, items.length - limit);
  const loadMore = useCallback(() => setLimit((l) => l + pageSize), [pageSize]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: Element | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!node || typeof IntersectionObserver === 'undefined') return;
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) loadMore();
        },
        // 끝에 닿기 조금 전에 미리 그려 스크롤이 끊기지 않게
        { rootMargin: '400px 0px' },
      );
      observer.observe(node);
      observerRef.current = observer;
    },
    // 한 묶음을 그린 뒤에도 감시 요소가 여전히 보이면 다시 불러오도록 limit 변화마다 다시 붙인다
    [loadMore, limit],
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return {
    visible: remaining > 0 ? items.slice(0, limit) : (items as T[]),
    remaining,
    loadMore,
    sentinelRef,
  };
}

/** 목록 끝 "더 보기" 표시. 스크롤로 닿으면 자동으로, 아니면 버튼으로 다음 묶음을 그린다. */
export function LoadMoreButton({
  remaining,
  onClick,
  sentinelRef,
  className,
}: {
  remaining: number;
  onClick: () => void;
  sentinelRef: (node: Element | null) => void;
  className?: string;
}) {
  if (remaining <= 0) return null;
  return (
    <button
      ref={sentinelRef}
      type="button"
      onClick={onClick}
      className={
        className ??
        'w-full py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors'
      }
    >
      더 보기 (남은 {remaining.toLocaleString()}건)
    </button>
  );
}

export default useIncrementalRows;

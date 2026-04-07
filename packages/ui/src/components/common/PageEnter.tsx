import { useRef, useEffect } from 'react';
import type React from 'react';

interface PageEnterProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/** 마운트 시 1회만 stagger 애니메이션 적용. 완료 후 클래스 제거하여 리렌더링 시 재생 방지. */
export function PageEnter({ children, className = '', style }: PageEnterProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.add('page-enter-active');
    const timer = setTimeout(() => {
      el.classList.remove('page-enter-active');
    }, 600); // 최대 animation-delay(0.4s) + duration(0.4s)보다 약간 짧게
    return () => clearTimeout(timer);
  }, []);

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}

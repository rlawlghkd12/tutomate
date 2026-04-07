import { useRef, useEffect } from 'react';
import type React from 'react';

interface PageEnterProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/** 마운트 시 1회만 stagger reveal. JS transition 기반 — CSS animation replay 문제 없음. */
export function PageEnter({ children, className = '', style }: PageEnterProps) {
  const ref = useRef<HTMLDivElement>(null);
  const animated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || animated.current) return;
    animated.current = true;

    const kids = Array.from(el.children) as HTMLElement[];
    kids.forEach((child, i) => {
      child.style.opacity = '0';
      child.style.transform = 'translateY(8px)';
      child.style.transition = 'opacity 0.4s cubic-bezier(0.4,0,0.2,1), transform 0.4s cubic-bezier(0.4,0,0.2,1)';
      child.style.transitionDelay = `${Math.min(i * 0.04, 0.4)}s`;
    });

    // rAF로 다음 프레임에서 최종 상태로 전환
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        kids.forEach((child) => {
          child.style.opacity = '1';
          child.style.transform = 'translateY(0)';
        });
        // transition 완료 후 인라인 스타일 정리
        setTimeout(() => {
          kids.forEach((child) => {
            child.style.opacity = '';
            child.style.transform = '';
            child.style.transition = '';
            child.style.transitionDelay = '';
          });
        }, 800);
      });
    });
  }, []);

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}

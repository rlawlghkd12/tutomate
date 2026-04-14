import React from 'react';
import { motion } from 'motion/react';

interface PageEnterProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 페이지 마운트 시 spring stagger reveal.
 * Apple 스타일 — opacity + y 스프링, 자식마다 0.04s 딜레이.
 */
export function PageEnter({ children, className = '', style }: PageEnterProps) {
  const items = React.Children.toArray(children);

  return (
    <div className={className} style={style}>
      {items.map((child, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            type: 'spring',
            stiffness: 420,
            damping: 36,
            delay: Math.min(i * 0.045, 0.35),
          }}
          style={{ willChange: 'opacity, transform' }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}

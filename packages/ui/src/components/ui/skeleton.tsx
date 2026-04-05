function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={className}
      style={{
        borderRadius: 8,
        background: 'hsl(var(--muted))',
        animation: 'skeleton-pulse 1.5s ease-in-out infinite',
        ...props.style,
      }}
      {...props}
    />
  );
}

export { Skeleton };

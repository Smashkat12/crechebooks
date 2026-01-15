import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
}

/**
 * Base skeleton component for loading states.
 * Re-exports with additional width/height style props for convenience.
 */
export function Skeleton({
  className,
  width,
  height,
  style,
  ...props
}: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        ...style
      }}
      {...props}
    />
  );
}

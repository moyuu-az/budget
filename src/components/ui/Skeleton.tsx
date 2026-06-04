import type { HTMLAttributes, ReactElement } from 'react';
import { cn } from '../../lib/cn';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'rect' | 'circle';
  width?: number | string;
  height?: number | string;
}

export function Skeleton({
  variant = 'rect',
  width,
  height,
  className,
  style,
  ...rest
}: SkeletonProps): ReactElement {
  const shape =
    variant === 'circle'
      ? 'rounded-full'
      : variant === 'text'
        ? 'rounded-[var(--radius-sm)] h-3'
        : 'rounded-[var(--radius-md)]';
  return (
    <div
      aria-hidden="true"
      style={{ width, height, ...style }}
      className={cn(
        'animate-pulse bg-[var(--color-surface-raised)]/80 border border-[var(--color-border-subtle)]',
        shape,
        className,
      )}
      {...rest}
    />
  );
}

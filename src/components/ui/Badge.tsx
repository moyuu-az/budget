import type { HTMLAttributes, ReactNode, ReactElement } from 'react';
import { cn } from '../../lib/cn';

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children: ReactNode;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral:
    'bg-[var(--color-surface-raised)] text-[var(--color-content-secondary)] border-[var(--color-border-subtle)]',
  success:
    'bg-[var(--color-semantic-success)]/15 text-[var(--color-semantic-success)] border-[var(--color-semantic-success)]/30',
  warning:
    'bg-[var(--color-semantic-warning)]/15 text-[var(--color-semantic-warning)] border-[var(--color-semantic-warning)]/30',
  danger:
    'bg-[var(--color-semantic-danger)]/15 text-[var(--color-semantic-danger)] border-[var(--color-semantic-danger)]/30',
  info:
    'bg-[var(--color-semantic-info)]/15 text-[var(--color-semantic-info)] border-[var(--color-semantic-info)]/30',
  accent:
    'bg-[var(--color-accent-primary)]/15 text-[var(--color-accent-primary)] border-[var(--color-accent-primary)]/30',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
  ...rest
}: BadgeProps): ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 h-6 text-xs font-medium',
        'rounded-[var(--radius-pill)] border',
        toneClasses[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

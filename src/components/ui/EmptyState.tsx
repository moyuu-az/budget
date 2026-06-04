import type { ReactNode, ReactElement } from 'react';
import { cn } from '../../lib/cn';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps): ReactElement {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        'py-12 px-6 gap-3',
        className,
      )}
    >
      {icon && (
        <div className="text-[var(--color-content-muted)] h-10 w-10 flex items-center justify-center">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-[var(--color-content-primary)]">{title}</h3>
      {description && (
        <p className="text-sm text-[var(--color-content-muted)] max-w-sm">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

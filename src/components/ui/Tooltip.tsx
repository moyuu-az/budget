import { useId, type ReactNode, type ReactElement } from 'react';
import { cn } from '../../lib/cn';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}

export function Tooltip({
  content,
  children,
  side = 'top',
  className,
}: TooltipProps): ReactElement {
  const id = useId();
  return (
    <span className="relative inline-flex group" aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 -translate-x-1/2 z-30',
          side === 'top' ? '-top-1 -translate-y-full' : '-bottom-1 translate-y-full',
          'whitespace-nowrap px-2 py-1 text-xs rounded-[var(--radius-sm)]',
          'bg-[var(--color-content-primary)] text-[var(--color-surface-base)] shadow-[var(--shadow-md)]',
          'opacity-0 scale-95 transition-[opacity,transform] duration-[var(--duration-fast)]',
          'group-hover:opacity-100 group-hover:scale-100',
          'group-focus-within:opacity-100 group-focus-within:scale-100',
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}

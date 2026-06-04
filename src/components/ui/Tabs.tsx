import { useRef, type ReactNode, type KeyboardEvent, type ReactElement } from 'react';
import { cn } from '../../lib/cn';

export interface TabItem<T extends string = string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  className,
}: TabsProps<T>): ReactElement {
  const listRef = useRef<HTMLDivElement>(null);

  const handleKey = (e: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const delta = e.key === 'ArrowRight' ? 1 : -1;
    const enabled = items.map((it, i) => ({ it, i })).filter((x) => !x.it.disabled);
    const currentPos = enabled.findIndex((x) => x.i === index);
    const nextPos = (currentPos + delta + enabled.length) % enabled.length;
    const next = enabled[nextPos];
    onChange(next.it.value);
    const nextBtn = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-tab-index="${next.i}"]`,
    );
    nextBtn?.focus();
  };

  const height = size === 'sm' ? 'h-8 text-xs' : 'h-9 text-sm';

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1 p-1 rounded-[var(--radius-md)]',
        'bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)]',
        className,
      )}
    >
      {items.map((it, i) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-disabled={it.disabled || undefined}
            tabIndex={active ? 0 : -1}
            data-tab-index={i}
            disabled={it.disabled}
            onClick={() => onChange(it.value)}
            onKeyDown={(e) => handleKey(e, i)}
            className={cn(
              'px-3 rounded-[var(--radius-sm)] font-medium',
              'transition-colors duration-[var(--duration-fast)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]',
              height,
              active
                ? 'bg-[var(--color-accent-primary)] text-[var(--color-content-inverse)]'
                : 'text-[var(--color-content-secondary)] hover:text-[var(--color-content-primary)] hover:bg-[var(--color-surface-overlay)]',
              it.disabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

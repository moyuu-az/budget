import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, prefix, suffix, id, className, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-[var(--color-content-secondary)]"
        >
          {label}
        </label>
      )}
      <div
        className={cn(
          'flex items-center gap-2 rounded-[var(--radius-md)] border bg-[var(--color-surface-raised)]',
          'px-3 h-10 transition-colors duration-[var(--duration-fast)]',
          'focus-within:border-[var(--color-border-focus)] focus-within:ring-2 focus-within:ring-[var(--color-border-focus)]/30',
          error ? 'border-[var(--color-semantic-danger)]' : 'border-[var(--color-border-subtle)]',
        )}
      >
        {prefix && <span className="text-[var(--color-content-muted)] shrink-0">{prefix}</span>}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'flex-1 bg-transparent text-[var(--color-content-primary)] placeholder:text-[var(--color-content-muted)]',
            'focus:outline-none text-sm',
            className,
          )}
          {...rest}
        />
        {suffix && <span className="text-[var(--color-content-muted)] shrink-0">{suffix}</span>}
      </div>
      {hint && !error && (
        <p id={hintId} className="text-xs text-[var(--color-content-muted)]">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-[var(--color-semantic-danger)]">
          {error}
        </p>
      )}
    </div>
  );
});

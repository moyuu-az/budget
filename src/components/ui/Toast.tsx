import { useEffect, useRef, type ReactElement } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useToastStore } from '../../stores/useToastStore';
import { cn } from '../../lib/cn';

type ToastType = 'success' | 'error' | 'info';

const DISMISS_MS = 3000;

const toneClasses: Record<ToastType, string> = {
  success: 'border-[var(--color-semantic-success)]/40 bg-[var(--color-surface-overlay)]',
  error: 'border-[var(--color-semantic-danger)]/40 bg-[var(--color-surface-overlay)]',
  info: 'border-[var(--color-accent-primary)]/40 bg-[var(--color-surface-overlay)]',
};

const iconFor = (type: ToastType): string => {
  if (type === 'success') return '✓';
  if (type === 'error') return '!';
  return 'i';
};

interface ToastItemProps {
  id: string;
  message: string;
  type: ToastType;
  onRemove: (id: string) => void;
}

function ToastItem({ id, message, type, onRemove }: ToastItemProps): ReactElement {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = (): void => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const arm = (): void => {
    clear();
    timerRef.current = setTimeout(() => onRemove(id), DISMISS_MS);
  };

  useEffect(() => {
    arm();
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <motion.div
      onMouseEnter={clear}
      onMouseLeave={arm}
      initial={{ opacity: 0, x: 80 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 80 }}
      transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
      className={cn(
        'flex items-start gap-3 rounded-[var(--radius-lg)] border px-4 py-3',
        'backdrop-blur-xl shadow-[var(--shadow-md)]',
        toneClasses[type],
      )}
    >
      <span
        className={cn(
          'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
          type === 'success' &&
            'bg-[var(--color-semantic-success)]/20 text-[var(--color-semantic-success)]',
          type === 'error' &&
            'bg-[var(--color-semantic-danger)]/20 text-[var(--color-semantic-danger)]',
          type === 'info' &&
            'bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)]',
        )}
        aria-hidden="true"
      >
        {iconFor(type)}
      </span>
      <p className="flex-1 text-sm text-[var(--color-content-primary)]">{message}</p>
      <button
        type="button"
        onClick={() => onRemove(id)}
        aria-label="通知を閉じる"
        className="text-[var(--color-content-muted)] hover:text-[var(--color-content-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] rounded"
      >
        ×
      </button>
    </motion.div>
  );
}

export function Toast(): ReactElement {
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.removeToast);

  return (
    <div
      aria-live="polite"
      role="status"
      className="fixed bottom-6 right-6 z-40 flex flex-col gap-2 max-w-sm"
    >
      <AnimatePresence initial={false}>
        {toasts.slice(0, 3).map((t) => (
          <ToastItem
            key={t.id}
            id={t.id}
            message={t.message}
            type={t.type}
            onRemove={remove}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

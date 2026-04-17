import type { ReactElement } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useToastStore } from '../../stores/useToastStore';
import { cn } from '../../lib/cn';

type ToastType = 'success' | 'error' | 'info';

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
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 80 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            className={cn(
              'flex items-start gap-3 rounded-[var(--radius-lg)] border px-4 py-3',
              'backdrop-blur-xl shadow-[var(--shadow-md)]',
              toneClasses[t.type],
            )}
          >
            <span
              className={cn(
                'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                t.type === 'success' &&
                  'bg-[var(--color-semantic-success)]/20 text-[var(--color-semantic-success)]',
                t.type === 'error' &&
                  'bg-[var(--color-semantic-danger)]/20 text-[var(--color-semantic-danger)]',
                t.type === 'info' &&
                  'bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)]',
              )}
              aria-hidden="true"
            >
              {iconFor(t.type)}
            </span>
            <p className="flex-1 text-sm text-[var(--color-content-primary)]">{t.message}</p>
            <button
              type="button"
              onClick={() => remove(t.id)}
              aria-label="通知を閉じる"
              className="text-[var(--color-content-muted)] hover:text-[var(--color-content-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] rounded"
            >
              ×
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

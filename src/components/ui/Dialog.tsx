import { useEffect, useId, useRef, type ReactNode, type ReactElement } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';
import { fadeIn, scaleIn } from '../../theme/motion';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  closeOnOverlayClick?: boolean;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const;

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnOverlayClick = true,
}: DialogProps): ReactElement | null {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const handle = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          last.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    };
    document.addEventListener('keydown', handle);
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', handle);
      prev?.focus();
    };
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial="initial"
          animate="animate"
          exit="exit"
          variants={fadeIn}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeOnOverlayClick ? onClose : undefined}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            variants={scaleIn}
            className={cn(
              'relative w-full rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)]',
              'bg-[var(--color-surface-overlay)] backdrop-blur-xl shadow-[var(--shadow-lg)]',
              // THE PANEL SCROLLS INSIDE THE VIEWPORT RATHER THAN GROWING PAST IT.
              //
              // Without this, a dialog taller than the screen is simply clipped:
              // the overlay centres it and nothing scrolls, so the footer --
              // which holds 保存 -- cannot be reached. The form becomes
              // impossible to submit.
              //
              // On a desktop there is always enough height and the bug is
              // invisible, which is exactly why it survived: 資産 dialogs grow
              // by one input per parameter definition (up to twelve), and a
              // phone runs out of room long before a laptop does.
              //
              // dvh, not vh: the VISIBLE viewport, so the panel does not extend
              // under a mobile browser's chrome. 2rem is the overlay's own p-4,
              // top and bottom.
              'max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 focus:outline-none',
              sizeClasses[size],
            )}
          >
            <div className="mb-4">
              <h2 id={titleId} className="text-lg font-semibold text-[var(--color-content-primary)]">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 text-sm text-[var(--color-content-muted)]">
                  {description}
                </p>
              )}
            </div>
            <div>{children}</div>
            {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

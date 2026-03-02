import { AnimatePresence, motion } from 'framer-motion';
import { useToastStore } from '../../stores/useToastStore';

const TYPE_COLORS: Record<string, string> = {
  success: '#10B981',
  error: '#EF4444',
  info: '#3B82F6',
};

function Toast() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 80 }}
            transition={{ duration: 0.25 }}
            className="flex items-center gap-3 rounded-lg bg-slate-800 px-4 py-3 shadow-lg"
            style={{ borderLeft: `3px solid ${TYPE_COLORS[toast.type]}` }}
          >
            <span className="text-sm text-slate-200">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="ml-2 text-slate-400 hover:text-slate-200 transition-colors"
            >
              &times;
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default Toast;

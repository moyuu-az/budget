import { create } from 'zustand';

const MAX_ACTIVE = 3;

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastState {
  toasts: Toast[];
  queue: Toast[];
  addToast: (message: string, type: Toast['type']) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  queue: [],
  addToast: (message, type) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const toast: Toast = { id, message, type };
    const { toasts } = get();
    if (toasts.length < MAX_ACTIVE) {
      set({ toasts: [...toasts, toast] });
    } else {
      set({ queue: [...get().queue, toast] });
    }
  },
  removeToast: (id) => {
    const { toasts, queue } = get();
    const nextToasts = toasts.filter((t) => t.id !== id);
    if (queue.length > 0 && nextToasts.length < MAX_ACTIVE) {
      const [next, ...rest] = queue;
      set({ toasts: [...nextToasts, next], queue: rest });
    } else {
      set({ toasts: nextToasts, queue: queue.filter((t) => t.id !== id) });
    }
  },
}));

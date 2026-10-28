import { create } from 'zustand';

export const TOAST_MS = 4000;

interface Toast {
  id: number;
  text: string;
}

interface ToastState {
  toasts: Toast[];
  show: (text: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

/** Small confirmations like "Report saved" (SPEC §5.4). Each one lasts 4s. */
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  show: (text) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, text }] }));
    setTimeout(() => get().dismiss(id), TOAST_MS);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

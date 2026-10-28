import { create } from 'zustand';

interface OverlayStackState {
  /** Open overlay ids, bottom to top. */
  stack: string[];
  push: (id: string) => void;
  remove: (id: string) => void;
}

/**
 * Every Modal, Popover and Menu registers here while open. Esc closes only the topmost
 * one (SPEC §7.2) and never reaches anything that would stop Fitts.
 */
export const useOverlayStack = create<OverlayStackState>((set) => ({
  stack: [],
  push: (id) => set((s) => ({ stack: [...s.stack.filter((x) => x !== id), id] })),
  remove: (id) => set((s) => ({ stack: s.stack.filter((x) => x !== id) })),
}));

export const isTopOverlay = (id: string): boolean => useOverlayStack.getState().stack.at(-1) === id;

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  /** "Fitts speaks out loud" (SPEC §6.13). M3 adds the rest of Settings. */
  speaksAloud: boolean;
  setSpeaksAloud: (on: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      speaksAloud: false,
      setSpeaksAloud: (on) => set({ speaksAloud: on }),
    }),
    { name: 'fitts.settings' },
  ),
);

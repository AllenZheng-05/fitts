import type { Mode } from '@fitts/schema';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type KeyName = 'meta' | 'elevenlabs' | 'baseten';
export type ModelProfile = 'quality' | 'economy' | 'open';
export type TalkMode = 'button' | 'wake' | 'typing';
export type ShapeMovement = 'still' | 'gentle' | 'lively';
export type VoiceName = 'elevenlabs' | 'system';
export type UserMode = Exclude<Mode, 'dangerous'>;

interface SettingsState {
  /** Mode for new runs, picked on Welcome and in Settings (SPEC §6.1, §6.13). */
  defaultMode: UserMode;
  /**
   * Which keys have been added. Phase 1 never stores a key: it only remembers that one
   * was entered (Phase 2 keeps keys in the OS keychain).
   */
  keys: Record<KeyName, boolean>;
  /** Mock permission states from Welcome (§6.1). */
  micAllowed: boolean;
  notificationsAllowed: boolean;
  /** Dangerous mode: on for the current run only, so never persisted (§6.13). */
  dangerous: boolean;
  /** A run's spending limit in dollars; 0 is no limit (the default). */
  capUsd: number;
  modelProfile: ModelProfile;
  contributorMode: boolean;
  speaksAloud: boolean;
  voice: VoiceName;
  /** The ElevenLabs "Fitts" voice (SPEC-phase2 §14); empty uses ElevenLabs' default. */
  voiceId: string;
  talkMode: TalkMode;
  shapesOn: boolean;
  shapeMovement: ShapeMovement;

  set: (patch: Partial<Omit<SettingsState, 'set' | 'setKey' | 'setSpeaksAloud'>>) => void;
  setKey: (key: KeyName, added: boolean) => void;
  setSpeaksAloud: (on: boolean) => void;
}

export const DEFAULT_SETTINGS = {
  defaultMode: 'ask-unsure' as UserMode,
  keys: { meta: false, elevenlabs: false, baseten: false },
  micAllowed: false,
  notificationsAllowed: false,
  dangerous: false,
  capUsd: 0,
  modelProfile: 'quality' as ModelProfile,
  contributorMode: false,
  speaksAloud: false,
  voice: 'system' as VoiceName,
  voiceId: '',
  talkMode: 'button' as TalkMode,
  shapesOn: true,
  shapeMovement: 'gentle' as ShapeMovement,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) => set(patch),
      setKey: (key, added) =>
        set((s) => ({
          keys: { ...s.keys, [key]: added },
          // Open weights needs a Baseten key (§6.13).
          ...(key === 'baseten' && !added && s.modelProfile === 'open'
            ? { modelProfile: 'quality' as ModelProfile }
            : {}),
        })),
      setSpeaksAloud: (on) => set({ speaksAloud: on }),
    }),
    {
      name: 'fitts.settings',
      storage: createJSONStorage(() => localStorage),
      // v1: "Hold ⌥Space" became "Tap the mic button" (no push-to-talk key binding).
      // v2: no spending limit by default; the old default of $20 becomes "no limit".
      version: 2,
      migrate: (persisted, version) => {
        const s = persisted as { talkMode?: string; capUsd?: number };
        if (s.talkMode === 'hold') s.talkMode = 'button';
        if (version < 2 && s.capUsd === 20) s.capUsd = 0;
        return s;
      },
      partialize: ({
        dangerous: _dangerous,
        set: _set,
        setKey: _setKey,
        setSpeaksAloud: _s,
        ...rest
      }) => rest,
    },
  ),
);

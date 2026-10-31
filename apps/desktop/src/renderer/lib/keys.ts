// API keys from the renderer's side (SPEC-phase2 §15): values go to main once, to be checked
// and stored in safeStorage; the renderer keeps only "is there a key", its last 4 characters
// and where it's from (Settings or .env.local). Outside Electron (unit tests) the Phase 1 rule
// stands in: 8+ characters works.
import type { KeyInfo, KeyName } from '@fitts/schema';
import { create } from 'zustand';
import { isKeyValid } from './new-project';
import { useSettings } from '../state/settings';
import { bridge } from './bridge';

/** Checks a key with its provider (in the agent process). */
export async function checkKey(name: KeyName, value: string): Promise<boolean> {
  const keys = bridge().keys;
  if (!keys) return isKeyValid(value);
  return (await keys.test(name, value)).ok;
}

/** Which key is in use for each provider, as main reports it. */
export const useKeyInfo = create<{ info: Partial<Record<KeyName, KeyInfo>> }>(() => ({
  info: {},
}));

/** Saves a key that passed `checkKey`. */
export function storeKey(name: KeyName, value: string): void {
  const keys = bridge().keys;
  useSettings.getState().setKey(name, true);
  if (!value.trim() || !keys) return;
  void keys.set(name, value.trim()).then(syncKeysFromMain);
}

/**
 * Settings' keys follow what main actually holds (at startup, and after a save): whether
 * there's one, which one, and from where. In a development build, .env.local fills in the
 * ElevenLabs voice if Settings has none.
 */
export function syncKeysFromMain(): void {
  const keys = bridge().keys;
  if (!keys?.info) {
    void keys?.has().then((has) => {
      const { setKey } = useSettings.getState();
      for (const name of Object.keys(has) as KeyName[]) setKey(name, has[name]);
    });
    return;
  }
  void keys.info().then((info) => {
    const { setKey } = useSettings.getState();
    for (const name of Object.keys(info) as KeyName[]) setKey(name, info[name].saved);
    useKeyInfo.setState({ info });
  });
  void keys.envDefaults?.().then(({ voiceId }) => {
    const s = useSettings.getState();
    if (voiceId && !s.voiceId) s.set({ voiceId });
  });
}

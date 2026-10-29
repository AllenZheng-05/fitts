// API keys from the renderer's side (SPEC-phase2 §15): values go to main once, to be checked
// and stored in safeStorage; the renderer keeps only "is there a key". Outside Electron (unit
// tests) the Phase 1 rule stands in: 8+ characters works.
import type { KeyName } from '@fitts/schema';
import { isKeyValid } from '../mock/detect';
import { useSettings } from '../state/settings';
import { bridge } from './bridge';

/** Checks a key with its provider (in the agent process). */
export async function checkKey(name: KeyName, value: string): Promise<boolean> {
  const keys = bridge().keys;
  if (!keys) return isKeyValid(value);
  return (await keys.test(name, value)).ok;
}

/** Saves a key that passed `checkKey`. */
export function storeKey(name: KeyName, value: string): void {
  if (value.trim()) void bridge().keys?.set(name, value.trim());
  useSettings.getState().setKey(name, true);
}

/** Settings' key booleans follow what main actually holds (run once at startup). */
export function syncKeysFromMain(): void {
  void bridge()
    .keys?.has()
    .then((has) => {
      const { setKey } = useSettings.getState();
      for (const name of Object.keys(has) as KeyName[]) setKey(name, has[name]);
    });
}

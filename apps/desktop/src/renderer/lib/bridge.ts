import type { FittsBridge } from '@fitts/schema';

/** Stand-in used outside Electron (unit tests): every native call is a no-op. */
const fallback: FittsBridge = {
  platform: 'win32',
  pickFolder: () => Promise.resolve(null),
  saveTextFile: () => Promise.resolve(null),
  notify: () => undefined,
  onNotificationClick: () => () => undefined,
  onHoldToTalk: () => () => undefined,
};

/** The preload bridge (`window.fitts`), or a no-op stand-in in tests. */
export function bridge(): FittsBridge {
  return (globalThis as { fitts?: FittsBridge }).fitts ?? fallback;
}

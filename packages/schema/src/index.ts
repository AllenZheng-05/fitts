// Shared types for main, preload and renderer. No React or Electron imports here.
// The run model from SPEC §9.1 lands in M2.

export type Platform = 'darwin' | 'win32' | 'linux';

/** The typed API the preload exposes as `window.fitts`. */
export interface FittsBridge {
  platform: Platform;
}

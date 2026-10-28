// Shared types for main, preload and renderer. No React or Electron imports here.
// The run model from SPEC §9.1 lands in M2.

export type Platform = 'darwin' | 'win32' | 'linux';

/** The typed API the preload exposes as `window.fitts`. */
export interface FittsBridge {
  platform: Platform;
}

/** Nielsen severity: 0 not a problem … 4 catastrophic. The full run model arrives in M2. */
export type Severity = 0 | 1 | 2 | 3 | 4;

export type RunPhase = 'interview' | 'audit' | 'done';

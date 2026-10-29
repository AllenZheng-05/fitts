/// <reference types="vite/client" />
import type { FittsBridge } from '@fitts/schema';

declare global {
  interface Window {
    fitts: FittsBridge;
    /** Dev/e2e only: what the background shape field is doing (§6.12). */
    __fittsShapes?: {
      readonly frames: number;
      mode: 'lively' | 'calm' | 'still';
      running: boolean;
      bodies: () => { id: string; x: number; y: number; vx: number; vy: number }[];
    };
  }

  /** True in `pnpm dev` and e2e builds; false in production. Gates the gallery and Scenario panel. */
  const __FITTS_DEV_TOOLS__: boolean;
}

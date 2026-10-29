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
      /** True while the cursor collider is pushing (mouse held on the backdrop). */
      cursorActive: () => boolean;
    };
  }

  /** True in `pnpm dev` and e2e builds; false in production. Gates the gallery and Scenario panel. */
  const __FITTS_DEV_TOOLS__: boolean;
}

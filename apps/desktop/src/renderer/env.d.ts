/// <reference types="vite/client" />
import type { FittsBridge } from '@fitts/schema';

declare global {
  interface Window {
    fitts: FittsBridge;
  }

  /** True in `pnpm dev` and e2e builds; false in production. Gates the gallery and Scenario panel. */
  const __FITTS_DEV_TOOLS__: boolean;
}

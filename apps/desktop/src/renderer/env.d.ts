/// <reference types="vite/client" />
import type { FittsBridge } from '@fitts/schema';

declare global {
  interface Window {
    fitts: FittsBridge;
  }
}

import { defineConfig } from '@playwright/test';

// Electron tests launch the built app (`electron-vite build` runs first in test:e2e).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
});

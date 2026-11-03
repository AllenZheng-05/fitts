import { defineConfig } from '@playwright/test';

// Smoke, axe and field tests against the production build (`pnpm test:e2e` builds first).
// The system Edge (or Chrome, with PW_CHANNEL=chrome) stands in for a downloaded browser.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5310',
    channel: process.env['PW_CHANNEL'] ?? 'msedge',
  },
  webServer: {
    command: 'pnpm exec vite preview --port 5310 --strictPort',
    url: 'http://localhost:5310',
    reuseExistingServer: false,
  },
});

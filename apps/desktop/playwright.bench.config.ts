import { defineConfig } from '@playwright/test';

// `pnpm bench:chat`: one real audit of demo/chat, scored against PLANTED.md (spends money).
export default defineConfig({
  testDir: 'tests/bench',
  testMatch: '*.bench.ts',
  timeout: 30 * 60_000,
  workers: 1,
  reporter: 'list',
});

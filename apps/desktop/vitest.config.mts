import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: { __FITTS_DEV_TOOLS__: 'true' },
  test: {
    environment: 'jsdom',
    include: [
      'tests/unit/**/*.test.{ts,tsx}',
      'tests/main/**/*.test.ts',
      'tests/agent/**/*.test.ts',
      'tests/bench/**/*.test.ts',
    ],
    setupFiles: ['tests/unit/setup.ts'],
    css: false,
    // CI runners (Windows above all) are slow to spawn processes and import cold modules, so
    // tests that start git or a socket there get 20s; here the 5s default still flags slow ones.
    testTimeout: process.env['CI'] ? 20_000 : 5_000,
  },
});

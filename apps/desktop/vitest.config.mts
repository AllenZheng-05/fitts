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
  },
});

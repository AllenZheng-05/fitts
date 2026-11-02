import { defineConfig } from 'vitest/config';

// Unit tests only (tests/unit); the Playwright smoke tests are tests/e2e.
export default defineConfig({
  test: { include: ['tests/unit/**/*.test.ts'] },
});

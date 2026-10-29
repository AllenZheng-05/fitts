import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// @fitts/schema ships TypeScript source, so it is bundled rather than externalized.
const externalizeDeps = { exclude: ['@fitts/schema'] };

export default defineConfig(({ command }) => {
  // Dev tools (gallery, Scenario panel) ship in `pnpm dev` and in e2e builds
  // (FITTS_DEV_TOOLS=1), never in a plain production build.
  const devTools = command === 'serve' || process.env['FITTS_DEV_TOOLS'] === '1';

  return {
    main: {
      build: { externalizeDeps },
    },
    preload: {
      build: { externalizeDeps },
    },
    renderer: {
      root: resolve(__dirname, 'src/renderer'),
      define: { __FITTS_DEV_TOOLS__: JSON.stringify(devTools) },
      // 5173 belongs to demo/chat (and 5180+ to previews and worktrees), so the app's own
      // renderer dev server lives elsewhere.
      server: { port: 5199 },
      resolve: {
        // geist's package exports hide its font files, so point at them directly.
        alias: { '@geist-fonts': resolve(__dirname, 'node_modules/geist/dist/fonts') },
      },
      build: {
        rollupOptions: {
          input: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
      plugins: [react(), tailwindcss()],
    },
  };
});

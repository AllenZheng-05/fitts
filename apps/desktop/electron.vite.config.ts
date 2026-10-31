import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// @fitts/schema, @fitts/styles and @fitts/probes ship TypeScript source (and the probes' built
// IIFE, imported with ?raw), so they are bundled rather than externalized.
const externalizeDeps = { exclude: ['@fitts/schema', '@fitts/styles', '@fitts/probes'] };

export default defineConfig(({ command }) => {
  // Dev tools (gallery, Scenario panel) ship in `pnpm dev` and in e2e builds
  // (FITTS_DEV_TOOLS=1), never in a plain production build.
  const devTools = command === 'serve' || process.env['FITTS_DEV_TOOLS'] === '1';

  return {
    main: {
      build: {
        externalizeDeps,
        // The agent runs in its own utility process (SPEC-phase2 §1).
        rollupOptions: {
          input: {
            index: resolve(__dirname, 'src/main/index.ts'),
            agent: resolve(__dirname, 'src/agent/index.ts'),
          },
          // Shared code goes to chunks, never into an entry: main must not load agent.js (it
          // starts the agent's message loop on import).
          preserveEntrySignatures: 'strict',
        },
      },
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
          // Phase 1's stand-ins (src/renderer/mock) do nothing on import, so a module nothing
          // uses is dropped: a release, where they sit behind __FITTS_DEV_TOOLS__, ships none
          // of them (scripts/check-release-bundle.mjs).
          treeshake: {
            moduleSideEffects: (id: string) => !/[\\/]src[\\/]renderer[\\/]mock[\\/]/.test(id),
            // Reading a property never runs code here (no getters with effects), so an unused
            // read doesn't keep a fixture alive.
            propertyReadSideEffects: false,
          },
        },
      },
      plugins: [react(), tailwindcss()],
    },
  };
});

import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// @fitts/schema ships TypeScript source, so it is bundled rather than externalized.
const externalizeDeps = { exclude: ['@fitts/schema'] };

export default defineConfig({
  main: {
    build: { externalizeDeps },
  },
  preload: {
    build: { externalizeDeps },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
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
});

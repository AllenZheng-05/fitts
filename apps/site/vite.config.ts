import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// A static site (Cloudflare Pages): `pnpm --filter @fitts/site build` writes dist/.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // geist's package exports hide its font files, so point at them directly (as the app does).
    alias: { '@geist-fonts': resolve(import.meta.dirname, 'node_modules/geist/dist/fonts') },
  },
  server: { port: 5300 },
});

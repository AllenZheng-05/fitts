import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// The Fitts dev plugin, one file with no dependencies (Vite 5 can't load the workspace's TS source).
import fittsSource from './fitts.vite.mjs'

export default defineConfig({
  plugins: [fittsSource(), react()],
  server: { port: Number(process.env.PORT ?? 5176), strictPort: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})

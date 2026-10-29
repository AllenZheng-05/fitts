import fittsSource from '@fitts/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { api } from './server/api';

export default defineConfig({
  plugins: [fittsSource(), react(), api()],
  server: { port: 5173, strictPort: true },
});

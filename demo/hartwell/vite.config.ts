import fittsSource from '@fitts/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [fittsSource(), react()],
  server: { port: Number(process.env.PORT ?? 3000), strictPort: true },
});

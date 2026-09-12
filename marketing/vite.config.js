import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Built output is served by dashboard/server.js under /marketing.
export default defineConfig({
  base: '/marketing/',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitLab Pages relative base — safe for both project pages and root pages.
// If deploying under a subpath, override with VITE_BASE_PATH.
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
  },
  test: {
    environment: 'node',
    globals: true,
  },
});

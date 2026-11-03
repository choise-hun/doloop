import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname, 'frontend'),
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
    // public/lib/*.js는 브라우저 전역 겸용 CJS라 Rollup CJS 변환 대상에 넣는다 (RZ-3)
    commonjsOptions: { include: [/node_modules/, /public[\\/]lib[\\/]/] },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});


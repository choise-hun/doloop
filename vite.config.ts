import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import type { Plugin } from 'vite';
import { patchAlphaTabRuntime } from './frontend/vendor/alphaTabWorklet';

function tabAssets(): Plugin {
  const packageDir = path.resolve(__dirname, 'node_modules/@coderline/alphatab');
  const dist = path.join(packageDir, 'dist');
  const files = new Map<string, string>();
  for (const name of ['alphaTab.mjs', 'alphaTab.core.mjs', 'alphaTab.worker.mjs', 'alphaTab.worklet.mjs']) {
    files.set(name, path.join(dist, name));
  }
  for (const name of fs.readdirSync(path.join(dist, 'font'))) {
    files.set('font/' + name, path.join(dist, 'font', name));
  }
  files.set('LICENSE.txt', path.join(packageDir, 'LICENSE.header'));
  files.set('MPL-2.0.txt', path.resolve(__dirname, 'frontend/licenses/alphaTab-MPL-2.0.txt'));
  files.set('MIT.txt', path.resolve(__dirname, 'frontend/licenses/alphaTab-MIT.txt'));
  files.set('worklet-patch-source.txt', path.resolve(__dirname, 'frontend/vendor/alphaTabWorklet.ts'));
  files.set('SOURCE.txt', path.resolve(__dirname, 'frontend/licenses/alphaTab-SOURCE.txt'));
  // The test sample bank stays out of release and Capacitor bundles.
  const localSoundFont = path.join(dist, 'soundfont/sonivox.sf2');
  const core = 'alphaTab.core.mjs';
  const outputCore = () => patchAlphaTabRuntime(fs.readFileSync(path.join(dist, core), 'utf8'));
  const mime: Record<string, string> = {
    '.mjs': 'text/javascript', '.woff2': 'font/woff2', '.woff': 'font/woff',
    '.otf': 'font/otf', '.eot': 'application/vnd.ms-fontobject', '.svg': 'image/svg+xml',
  };
  return {
    name: 'tab-assets',
    configureServer(server) {
      server.middlewares.use('/at', (request, response, next) => {
        const name = (request.url || '').split('?')[0].slice(1);
        const source = name === 'soundfont/sonivox.sf2' ? localSoundFont : files.get(name);
        if (!source) return next();
        response.setHeader('Content-Type', mime[path.extname(source)] || (source === localSoundFont
          ? 'application/octet-stream' : 'text/plain'));
        if (name === core) response.end(outputCore());
        else fs.createReadStream(source).pipe(response);
      });
    },
    generateBundle() {
      for (const [name, source] of files) {
        this.emitFile({ type: 'asset', fileName: 'at/' + name, source: name === core ? outputCore() : fs.readFileSync(source) });
      }
    },
  };
}

export default defineConfig({
  root: path.resolve(__dirname, 'frontend'),
  publicDir: false,
  plugins: [react(), tabAssets()],
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
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


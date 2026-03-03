import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // For GitHub Pages: repo is at /warhammer-40k-simulator
  // When deploying to Pages, set base to the repo name
  base: process.env['GITHUB_PAGES'] === 'true' ? '/warhammer-40k-simulator/' : '/',
  build: {
    outDir: resolve(__dirname, '../../docs'),
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      '@wh40k/engine': resolve(__dirname, '../engine/src/index.ts'),
    },
  },
});

import { defineConfig } from 'vite';
import { resolve } from 'path';
import { execSync } from 'child_process';

const gitTag = (() => {
  try { return execSync('git describe --tags --abbrev=0').toString().trim(); }
  catch { return 'dev'; }
})();
const gitSha = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return 'unknown'; }
})();
const buildDate = new Date().toISOString().slice(0, 10);

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(gitTag),
    __BUILD_DATE__: JSON.stringify(buildDate),
    __GIT_SHA__: JSON.stringify(gitSha),
  },
  // For GitHub Pages: repo is at /warhammer-40k-simulator
  // When deploying to Pages, set base to the repo name
  base: process.env['GITHUB_PAGES'] === 'true' ? '/warhammer-40k-simulator/' : '/',
  build: {
    outDir: resolve(__dirname, '../../dist'),
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

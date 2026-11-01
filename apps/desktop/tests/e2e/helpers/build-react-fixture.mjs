// Bundles tests/fixtures/react-chain into one dev-mode IIFE (React 19's dev runtime, so fibers
// carry their debug info), with the Fitts plugin's stamps applied, for the source-chain e2e.
// Run as a child process: Playwright's test files are CommonJS and Vite is ESM.
//   node build-react-fixture.mjs <outDir> [--no-plugin]
import { build } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampSource } from '../../../../../packages/vite-plugin/src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../fixtures/react-chain');
const outDir = process.argv[2];
const withPlugin = !process.argv.includes('--no-plugin');
if (!outDir) throw new Error('outDir required');

/** The plugin's transform as it runs in `vite serve`, applied here to a build on purpose. */
const stamps = {
  name: 'fitts-stamps-for-the-fixture',
  enforce: 'pre',
  transform(code, id) {
    const file = id.split('?')[0];
    if (!/\.[jt]sx$/.test(file) || file.includes('/node_modules/')) return null;
    return stampSource(code, file, root);
  },
};

await build({
  configFile: false,
  logLevel: 'silent',
  root,
  mode: 'development',
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: withPlugin ? [stamps] : [],
  build: {
    outDir,
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    lib: {
      entry: resolve(root, 'main.tsx'),
      formats: ['iife'],
      name: 'Fixture',
      fileName: () => 'bundle.js',
    },
  },
});
console.log('built');

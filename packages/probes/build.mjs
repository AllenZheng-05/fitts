// Bundles the in-page probes (and axe-core) into one IIFE that main injects into the site
// window's isolated world (SPEC-phase2 §7).
import { build } from 'esbuild';

await build({
  entryPoints: ['src/page.ts'],
  bundle: true,
  format: 'iife',
  target: 'chrome140',
  minify: true,
  legalComments: 'none',
  outfile: 'dist/page.js',
  logLevel: 'warning',
});

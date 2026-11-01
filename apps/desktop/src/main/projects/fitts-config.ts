// The Fitts plugin without touching the project (Allen's feedback, round 5): when Fitts starts a
// Vite dev server, it runs it with a small config of its own that loads the project's config and
// adds the plugin. Both files go in the project's node_modules/.fitts/, which is never committed
// and which formatters and linters skip, so nothing in the repo changes and its CI can't fail on
// it. Bare imports in the project's config still resolve from the project's node_modules.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Where the wrapper goes, relative to the project: what `vite --config` is given. */
export const FITTS_CONFIG = 'node_modules/.fitts/vite.config.mjs';

const CONFIGS = [
  'vite.config.ts',
  'vite.config.mts',
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.cts',
  'vite.config.cjs',
];

/** The project's own Vite config file, if it has one. */
export function viteConfigFile(folder: string): string | undefined {
  return CONFIGS.find((f) => existsSync(join(folder, f)));
}

/**
 * Writes the plugin and a config that wraps the project's, and returns the config's path for
 * `vite --config`. Null when there's no node_modules yet (not installed) or no plugin to add.
 */
export function fittsViteConfig(folder: string, pluginFile: string | undefined): string | null {
  if (!pluginFile || !existsSync(pluginFile)) return null;
  if (!existsSync(join(folder, 'node_modules'))) return null;
  const own = viteConfigFile(folder);
  const dir = join(folder, 'node_modules', '.fitts');
  try {
    mkdirSync(dir, { recursive: true });
    copyFileSync(pluginFile, join(dir, 'fitts.vite.mjs'));
    writeFileSync(join(folder, FITTS_CONFIG), wrapper(own));
    return FITTS_CONFIG;
  } catch {
    return null;
  }
}

/** The wrapper: the project's config (object, promise or function), with Fitts's plugin first. */
export function wrapper(own: string | undefined): string {
  return [
    '// Written by Fitts when it runs this site; never committed (it lives in node_modules).',
    "import fitts from './fitts.vite.mjs';",
    "import * as vite from 'vite';",
    ...(own ? [`import project from '../../${own}';`] : ['const project = {};']),
    '',
    'export default async (env) => {',
    "  const base = (await (typeof project === 'function' ? project(env) : project)) ?? {};",
    '  return { ...base, plugins: [fitts({ vite }), ...(base.plugins ?? [])] };',
    '};',
    '',
  ].join('\n');
}

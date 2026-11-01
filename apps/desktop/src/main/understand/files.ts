// Walking a project's source (SPEC-phase4 §3.2): which files count, and reading them with the
// caps the extractor and the repo map share. No network, no writes.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Folders never read: dependencies, builds, Fitts's own worktrees, VCS. */
export const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.svelte-kit',
  '.astro',
  '.expo',
  '.turbo',
  '.cache',
  'coverage',
  '.fitts-worktrees',
  '.vite',
  'android',
  'ios',
  'release',
  'storybook-static',
  'test-results',
  'playwright-report',
]);

export const SOURCE_EXT = /\.(tsx?|jsx?|mjs|cjs|svelte|vue|astro)$/;
export const STYLE_EXT = /\.(css|scss|sass|less|pcss)$/;

/** At most this many files are listed (a monorepo's leaf is still a project). */
export const MAX_FILES = 3000;

/** Project-relative path with forward slashes. */
export const rel = (root: string, full: string) => relative(root, full).split(sep).join('/');

/** Every file under `root` worth reading, as project-relative paths, in a stable order. */
export function listFiles(root: string, max = MAX_FILES): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let names: string[];
    try {
      names = readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const name of names) {
      if (out.length >= max) return;
      if (SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) walk(full);
      else out.push(rel(root, full));
    }
  };
  walk(root);
  return out;
}

/** A file's text, capped (a huge generated file is read only as far as the cap). */
export function readText(root: string, file: string, cap = 400_000): string {
  try {
    return readFileSync(join(root, file), 'utf8').slice(0, cap);
  } catch {
    return '';
  }
}

export function readJson<T>(root: string, file: string): T | undefined {
  try {
    return JSON.parse(readFileSync(join(root, file), 'utf8')) as T;
  } catch {
    return undefined;
  }
}

/** Resolves a relative import from `from` to a listed file (extensions and index files). */
export function resolveImport(from: string, spec: string, files: Set<string>): string | undefined {
  if (
    !spec.startsWith('.') &&
    !spec.startsWith('/') &&
    !spec.startsWith('@/') &&
    !spec.startsWith('~/')
  )
    return undefined;
  const dir = from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : '';
  // "@/x" and "~/x" are the usual aliases for src/.
  const base = spec.startsWith('@/') || spec.startsWith('~/') ? `src/${spec.slice(2)}` : spec;
  const aliased = spec.startsWith('@/') || spec.startsWith('~/');
  const joined =
    base.startsWith('/') || aliased
      ? normalize(base.replace(/^\//, ''))
      : normalize(dir ? `${dir}/${base}` : base);
  const tries = [
    joined,
    ...['.tsx', '.ts', '.jsx', '.js', '.mjs', '.svelte', '.vue', '.astro'].map((e) => joined + e),
    ...['.tsx', '.ts', '.jsx', '.js'].map((e) => `${joined}/index${e}`),
  ];
  // A ".js" import of a ".ts" file (ESM TypeScript projects).
  if (/\.js$/.test(joined))
    tries.push(joined.replace(/\.js$/, '.ts'), joined.replace(/\.js$/, '.tsx'));
  return tries.find((t) => files.has(t));
}

/** "a/b/../c" → "a/c" */
export function normalize(path: string): string {
  const parts: string[] = [];
  for (const p of path.split('/')) {
    if (p === '' || p === '.') continue;
    if (p === '..') parts.pop();
    else parts.push(p);
  }
  return parts.join('/');
}

/** A rough token count for budgets: about four characters a token. */
export const tokensOf = (text: string) => Math.ceil(text.length / 4);

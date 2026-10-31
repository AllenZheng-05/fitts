// Real project detection (SPEC-phase2 §4.1), behind the Phase 1 mock's result shape: the
// framework from package.json, the dev command and port, the GitHub remote, gh auth, and
// whether the Fitts source plugin is installed.
import type { Detection } from '@fitts/schema';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { run } from '../spawn';

interface Pkg {
  name?: string;
  /** Optional Fitts settings a project can declare, e.g. { "startPath": "/compose" }. */
  fitts?: { startPath?: string };
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';

const major = (range: string | undefined) => /\d+/.exec(range ?? '')?.[0];

/** Framework label and default dev port from dependencies. */
export function detectFramework(pkg: Pkg): { framework: string; port: number } {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const react = deps['react'] ? ` + React ${major(deps['react']) ?? ''}`.trimEnd() : '';
  if (deps['next']) return { framework: `Next.js ${major(deps['next']) ?? ''}`.trim(), port: 3000 };
  if (deps['@sveltejs/kit']) return { framework: 'SvelteKit', port: 5173 };
  if (deps['astro']) return { framework: `Astro ${major(deps['astro']) ?? ''}`.trim(), port: 4321 };
  if (deps['react-scripts']) return { framework: `Create React App${react}`, port: 3000 };
  if (deps['vite']) return { framework: `Vite${react}`, port: 5173 };
  return { framework: 'Unknown', port: 3000 };
}

/** A file in the folder or a parent (a workspace package's lockfile sits at the root). */
function findUp(folder: string, file: string, levels = 4): boolean {
  let dir = folder;
  for (let i = 0; i <= levels; i++) {
    if (existsSync(join(dir, file))) return true;
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
  return false;
}

/** The dev script, as `<package manager> dev` or `npm run <script>`. */
export function detectDevCommand(folder: string, pkg: Pkg): { command: string; port?: number } {
  const scripts = pkg.scripts ?? {};
  const name = scripts['dev'] ? 'dev' : scripts['start'] ? 'start' : 'dev';
  const pm = findUp(folder, 'pnpm-lock.yaml')
    ? 'pnpm'
    : findUp(folder, 'yarn.lock')
      ? 'yarn'
      : 'npm';
  const command = pm === 'npm' ? `npm run ${name}` : `${pm} ${name}`;
  const portFlag = /--port[ =](\d{2,5})/.exec(scripts[name] ?? '');
  return { command, ...(portFlag?.[1] ? { port: Number(portFlag[1]) } : {}) };
}

/**
 * The dev command that serves on `port`. A Vite `dev` script gets its port flags replaced, with
 * --strictPort so a busy port fails instead of moving (Vite ignores `PORT`, and scripts often pin
 * `--port 5173`); anything else is the detected command, which gets `PORT` in its environment.
 */
export function devCommandOnPort(folder: string, port: number): string {
  let pkg: Pkg = {};
  try {
    pkg = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as Pkg;
  } catch {
    return 'npm run dev';
  }
  const dev = pkg.scripts?.['dev'] ?? '';
  if (/^vite(\s|$)/.test(dev)) {
    const rest = dev.replace(/\s--port[=\s]\d+/g, '').replace(/\s--strictPort\b/g, '');
    const runner = findUp(folder, 'pnpm-lock.yaml')
      ? 'pnpm exec'
      : findUp(folder, 'yarn.lock')
        ? 'yarn'
        : 'npx';
    return `${runner} ${rest} --port ${port} --strictPort`;
  }
  return detectDevCommand(folder, pkg).command;
}

/** A vite config's `port: 1234`, when the script has no --port. */
function viteConfigPort(folder: string): number | undefined {
  for (const f of ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs']) {
    const file = join(folder, f);
    if (!existsSync(file)) continue;
    const m = /port\s*:\s*(?:Number\([^)]*\?\?\s*)?['"]?(\d{2,5})/.exec(readFileSync(file, 'utf8'));
    if (m?.[1]) return Number(m[1]);
  }
  return undefined;
}

export function githubRepo(remote: string): string | undefined {
  const m = /github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(remote.trim());
  return m?.[1];
}

export async function detectProject(folder: string): Promise<Detection | null> {
  try {
    if (!statSync(folder).isDirectory()) return null;
  } catch {
    return null;
  }
  const pkgFile = join(folder, 'package.json');
  if (!existsSync(pkgFile)) return null;
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8')) as Pkg;
  const { framework, port: defaultPort } = detectFramework(pkg);
  const dev = detectDevCommand(folder, pkg);
  const port = dev.port ?? viteConfigPort(folder) ?? defaultPort;
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const [remote, gh] = await Promise.all([
    run('git', ['remote', 'get-url', 'origin'], { cwd: folder, timeoutMs: 5000 }),
    run('gh', ['auth', 'status'], { cwd: folder, timeoutMs: 8000 }),
  ]);
  const repo = remote.code === 0 ? githubRepo(remote.stdout) : undefined;
  const name = pkg.name?.replace(/^@[^/]+\//, '') || basename(folder);
  return {
    id: slug(name),
    name,
    framework,
    devCommand: dev.command,
    url: `localhost:${port}`,
    port,
    hasPlugin: Boolean(deps['@fitts/vite-plugin']) || existsSync(join(folder, 'fitts.vite.mjs')),
    ...(pkg.fitts?.startPath?.startsWith('/') ? { startPath: pkg.fitts.startPath } : {}),
    ghReady: gh.code === 0,
    ...(repo ? { repo } : {}),
  };
}

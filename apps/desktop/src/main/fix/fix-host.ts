// The fix pipeline's privileged half (SPEC-phase2 §9): git worktrees, file access confined to a
// worktree, verification on the worktree's own dev server, commits, PRs and the preview branch.
// The agent drives it over RPC (the fixer's model calls stay in the agent). Fitts only touches
// the project's `.fitts-worktrees/` and its own `fitts/` branches.
import type { Project, SiteVersion } from '@fitts/schema';
import { PAGE_PROBES } from '@fitts/probes';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type {
  AssetsResult,
  CiRun,
  FixCall,
  FontAsk,
  TestRun,
  VerifyPagesResult,
  VerifyResult,
} from '../../agent/protocol';
import { fontFaceCss, type FontFiles, type FontStore } from '../fonts/fonts';
import { devCommandOnPort } from '../projects/detect';
import { DevServer, responds } from '../site/dev-server';
import { SiteWindow } from '../site/site-window';
import { run } from '../spawn';
import { ciChecks, FORMATTABLE, LINTABLE, type PackageManager } from './ci';
import { prBackend, type PrBackend } from './pr';

const git = (cwd: string, ...args: string[]) => run('git', args, { cwd, timeoutMs: 120_000 });

interface Job {
  projectId: string;
  root: string;
  dir: string;
  branch: string;
  runId: string;
}

const TEXT = /\.(tsx?|jsx?|css|scss|html|json|md|vue|svelte)$/;
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.fitts-worktrees', '.vite']);
/** Verification servers: 5181 and up (the preview branch uses 5180, §9.2). */
const FIRST_PORT = 5181;
/** A redesign's after shots when the before shots' size isn't known. */
const SHOT_SIZE = { width: 1280, height: 800 };

export class FixHost {
  private readonly jobs = new Map<string, Job>();
  private readonly ports = new Set<number>();
  /** One verification at a time: worktree dev servers share the project's dependency cache. */
  private verifying: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly projectFor: (id: string) => Project | undefined,
    private readonly prs: () => PrBackend = prBackend,
    /**
     * Fonts and the vendored three.js for redesigns (without them, `assets` copies nothing), and
     * the one-file Fitts plugin a project can get in a PR.
     */
    private readonly assetSources: {
      fonts?: FontStore;
      vendorDir?: string;
      pluginFile?: string;
    } = {},
  ) {}

  async call(projectId: string, call: FixCall): Promise<unknown> {
    switch (call.fn) {
      case 'available':
        return this.available(projectId);
      case 'prepare':
        return this.prepare(projectId, call.runId, call.findingId, call.branch, call.base);
      case 'read':
        return this.read(call.job, call.path);
      case 'list':
        return this.list(call.job, call.dir);
      case 'search':
        return this.search(call.job, call.text);
      case 'patch':
        return this.patch(call.job, call.path, call.find, call.replace);
      case 'write':
        return this.write(call.job, call.path, call.content);
      case 'diff':
        return this.diff(call.job);
      case 'verify': {
        const next = this.verifying.then(() => this.verify(call.job, call.route, call.hrefs));
        this.verifying = next.catch(() => undefined);
        return next;
      }
      case 'verifyPages': {
        const next = this.verifying.then(() => this.verifyPages(call.job, call.routes, call.size));
        this.verifying = next.catch(() => undefined);
        return next;
      }
      case 'assets':
        return this.assets(call.job, call.fonts, call.three);
      case 'commit':
        return this.commit(call.job, call.message);
      case 'tests':
        return this.tests(call.job);
      case 'ci':
        return this.ci(call.job);
      case 'reset': {
        // Ignored files (node_modules) stay: `clean` without -x only removes untracked ones.
        const job = this.job(call.job);
        await git(job.dir, 'reset', '-q', '--hard', 'HEAD');
        await git(job.dir, 'clean', '-fdq');
        return true;
      }
      case 'discard':
        return this.discard(call.job);
      case 'prOpen':
        return this.prOpen(call.job, call.title, call.body, call.base);
      case 'push': {
        const job = this.job(call.job);
        return this.prs().push(job.dir, job.branch);
      }
      case 'prClose':
        return this.prs().close(this.root(projectId), call.pr, call.branch);
      case 'prMerged':
        return this.prs().merged(this.root(projectId), call.pr);
      case 'revert':
        return this.revert(projectId, call.runId, call.pr, call.branch, call.title, call.body);
      case 'preview':
        return this.preview(projectId, call.runId, call.branches);
    }
  }

  private root(projectId: string): string {
    const p = this.projectFor(projectId);
    if (p?.kind !== 'local' || !p.folder) throw new Error('Fixes need a local project');
    return resolve(p.folder);
  }

  private job(id: string): Job {
    const j = this.jobs.get(id);
    if (!j) throw new Error(`No fix job ${id}`);
    return j;
  }

  /** Fixes need the project to be its own git repo (a folder inside another repo isn't). */
  async available(projectId: string): Promise<{ ok: boolean; reason?: string }> {
    let root: string;
    try {
      root = this.root(projectId);
    } catch (e) {
      return { ok: false, reason: (e as Error).message };
    }
    const top = await git(root, 'rev-parse', '--show-toplevel');
    if (top.code !== 0) return { ok: false, reason: 'not a git repository' };
    // Compare real paths: git reports the resolved one (macOS /var is /private/var, Windows
    // temp folders can be 8.3 short names).
    const real = (p: string) => {
      try {
        return realpathSync.native(p);
      } catch {
        return resolve(p);
      }
    };
    if (real(top.stdout.trim()) !== real(root))
      return { ok: false, reason: 'the project is inside another repository' };
    return { ok: true };
  }

  /** `git worktree add .fitts-worktrees/<runId>/<findingId> -b <branch> <base>`, then deps. */
  async prepare(
    projectId: string,
    runId: string,
    findingId: string,
    branch: string,
    base = 'HEAD',
  ) {
    const root = this.root(projectId);
    await this.exclude(root);
    let dir = join(root, '.fitts-worktrees', runId, findingId);
    for (let n = 2; existsSync(dir); n++)
      dir = join(root, '.fitts-worktrees', runId, `${findingId}-${n}`);
    let name = branch;
    for (let n = 2; (await git(root, 'rev-parse', '--verify', '--quiet', name)).code === 0; n++)
      name = `${branch}-${n}`;
    mkdirSync(dirname(dir), { recursive: true });
    const add = await git(root, 'worktree', 'add', '-q', dir, '-b', name, base);
    if (add.code !== 0)
      throw new Error(`git worktree add failed: ${add.stderr.trim().slice(0, 200)}`);
    await this.dependencies(root, dir);
    const id = relative(join(root, '.fitts-worktrees'), dir).split(sep).join('/');
    this.jobs.set(id, { projectId, root, dir, branch: name, runId });
    return { job: id, branch: name };
  }

  /** `.fitts-worktrees/` goes in .git/info/exclude, never the user's .gitignore (§9.2). */
  private async exclude(root: string): Promise<void> {
    const common = await git(root, 'rev-parse', '--git-common-dir');
    const gitDir = resolve(root, common.stdout.trim() || '.git');
    const file = join(gitDir, 'info', 'exclude');
    mkdirSync(dirname(file), { recursive: true });
    const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (!text.split(/\r?\n/).includes('.fitts-worktrees/'))
      appendFileSync(file, `${text && !text.endsWith('\n') ? '\n' : ''}.fitts-worktrees/\n`);
  }

  /** `pnpm install --offline --frozen-lockfile`; if that fails, link the project's node_modules. */
  private async dependencies(root: string, dir: string): Promise<void> {
    if (existsSync(join(dir, 'node_modules'))) return;
    if (existsSync(join(dir, 'pnpm-lock.yaml'))) {
      // A project that isn't a workspace itself mustn't be adopted by one around its folder.
      const own = existsSync(join(dir, 'pnpm-workspace.yaml')) ? [] : ['--ignore-workspace'];
      const res = await run('pnpm', ['install', '--offline', '--frozen-lockfile', ...own], {
        cwd: dir,
        timeoutMs: 180_000,
      });
      if (res.code === 0) return;
    }
    const mods = join(root, 'node_modules');
    if (existsSync(mods) && !existsSync(join(dir, 'node_modules')))
      symlinkSync(mods, join(dir, 'node_modules'), 'junction');
  }

  /** A path inside the worktree (no escaping it, no .git, no node_modules). */
  private inside(job: Job, path: string): string {
    const full = resolve(job.dir, path);
    const rel = relative(job.dir, full);
    if (!rel || rel.startsWith('..') || isAbsolute(rel))
      throw new Error(`${path} is outside the worktree`);
    const first = rel.split(sep)[0] ?? '';
    if (SKIP.has(first)) throw new Error(`${path} is off limits`);
    return full;
  }

  read(id: string, path: string): string {
    const full = this.inside(this.job(id), path);
    if (!existsSync(full)) throw new Error(`${path} doesn't exist`);
    return readFileSync(full, 'utf8').slice(0, 60_000);
  }

  /** A folder's entries (folders end in `/`), skipping dependencies and build output. */
  list(id: string, dir: string): string[] {
    const job = this.job(id);
    const full = dir === '' || dir === '.' ? job.dir : this.inside(job, dir);
    if (!existsSync(full) || !statSync(full).isDirectory())
      throw new Error(`${dir} isn't a folder`);
    return readdirSync(full)
      .filter((name) => !SKIP.has(name))
      .map((name) => (statSync(join(full, name)).isDirectory() ? `${name}/` : name))
      .slice(0, 200);
  }

  /** Creates or replaces a whole source file inside the worktree (a redesign's new theme). */
  write(id: string, path: string, content: string): { ok: boolean; error?: string } {
    if (!TEXT.test(path)) return { ok: false, error: `${path} isn't a source file` };
    const full = this.inside(this.job(id), path);
    // Keep the file's line endings when replacing it.
    const crlf = existsSync(full) && readFileSync(full, 'utf8').includes('\r\n');
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, crlf ? content.replace(/\r?\n/g, '\r\n') : content);
    return { ok: true };
  }

  /** Lines containing `text` (case-insensitive) in source files, at most 30. */
  search(id: string, text: string): { path: string; line: number; text: string }[] {
    const job = this.job(id);
    const needle = text.toLowerCase();
    const out: { path: string; line: number; text: string }[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (out.length >= 30) return;
        if (SKIP.has(name)) continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (TEXT.test(name)) {
          const lines = readFileSync(full, 'utf8').split(/\r?\n/);
          lines.forEach((l, i) => {
            if (out.length < 30 && l.toLowerCase().includes(needle))
              out.push({
                path: relative(job.dir, full).split(sep).join('/'),
                line: i + 1,
                text: l.trim().slice(0, 160),
              });
          });
        }
      }
    };
    walk(job.dir);
    return out;
  }

  /** Replaces exactly one occurrence of `find` (an exact excerpt) with `replace`. */
  patch(id: string, path: string, find: string, replace: string): { ok: boolean; error?: string } {
    const full = this.inside(this.job(id), path);
    if (!existsSync(full)) return { ok: false, error: `${path} doesn't exist` };
    const text = readFileSync(full, 'utf8');
    // The model sees LF; files may be CRLF.
    const crlf = text.includes('\r\n');
    const body = crlf ? text.replace(/\r\n/g, '\n') : text;
    const count = find ? body.split(find).length - 1 : 0;
    if (count !== 1)
      return {
        ok: false,
        error: count === 0 ? 'text not found' : `text found ${count} times; include more context`,
      };
    const next = body.replace(find, () => replace);
    writeFileSync(full, crlf ? next.replace(/\n/g, '\r\n') : next);
    return { ok: true };
  }

  async diff(id: string): Promise<string> {
    const job = this.job(id);
    await git(job.dir, 'add', '-A');
    const res = await git(job.dir, 'diff', '--cached', '--', '.', ':(exclude)node_modules');
    return res.stdout.slice(0, 20_000);
  }

  /** The worktree's dev server, a hidden window on the route, and the page probes (§9.2). */
  async verify(id: string, route: string, hrefs: string[]): Promise<VerifyResult> {
    const job = this.job(id);
    const port = await this.freePort();
    const server = new DevServer(
      job.dir,
      verifyCommand(job.dir, port, this.assetSources.pluginFile),
      port,
    );
    let win: SiteWindow | undefined;
    try {
      if (!(await server.start(90_000)))
        return {
          ok: false,
          error: `the dev server didn't start: ${server.log.slice(-3).join(' ')}`,
          results: [],
          focus: [],
          viewport: [],
          links: {},
        };
      win = new SiteWindow(
        `verify-${port}`,
        server.url,
        () => undefined,
        () => undefined,
      );
      win.setActive(false);
      await win.load(route).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 800));
      const results = await win.runProbes(PAGE_PROBES);
      const focus = await win.focusSweep().catch(() => []);
      const viewport = await win.viewportSweep().catch(() => []);
      const links = hrefs.length ? await win.links(hrefs).catch(() => ({})) : {};
      return { ok: true, results, focus, viewport, links };
    } catch (e) {
      return {
        ok: false,
        error: (e as Error).message,
        results: [],
        focus: [],
        viewport: [],
        links: {},
      };
    } finally {
      win?.destroy();
      server.stop();
      this.ports.delete(port);
    }
  }

  /**
   * A redesign's check (§8.3): one worktree server, then each route in turn: did it render,
   * the page probes, focus and viewport sweeps, and an after shot at the crawl's window size.
   */
  async verifyPages(
    id: string,
    routes: string[],
    size: { width: number; height: number } = SHOT_SIZE,
  ): Promise<VerifyPagesResult> {
    const job = this.job(id);
    const port = await this.freePort();
    const server = new DevServer(
      job.dir,
      verifyCommand(job.dir, port, this.assetSources.pluginFile),
      port,
    );
    let win: SiteWindow | undefined;
    try {
      if (!(await server.start(90_000)))
        return {
          ok: false,
          error: `the dev server didn't start: ${server.log.slice(-3).join(' ')}`,
          pages: [],
        };
      win = new SiteWindow(
        `verify-${port}`,
        server.url,
        () => undefined,
        () => undefined,
      );
      win.setActive(false);
      win.resize(size.width, size.height);
      const pages: VerifyPagesResult['pages'] = [];
      for (const route of routes) {
        await win.load(route).catch(() => undefined);
        await new Promise((r) => setTimeout(r, 800));
        const loaded = await win.rendered();
        const jpegBase64 = (await win.capture().catch(() => undefined))?.toString('base64');
        const results = loaded ? await win.runProbes(PAGE_PROBES).catch(() => []) : [];
        const focus = loaded ? await win.focusSweep().catch(() => []) : [];
        const viewport = loaded ? await win.viewportSweep().catch(() => []) : [];
        pages.push({
          route,
          loaded,
          results,
          focus,
          viewport,
          ...(jpegBase64 ? { jpegBase64 } : {}),
        });
      }
      return { ok: true, pages };
    } catch (e) {
      return { ok: false, error: (e as Error).message, pages: [] };
    } finally {
      win?.destroy();
      server.stop();
      this.ports.delete(port);
    }
  }

  /**
   * The project's own test script, in the worktree (CI=1, so watch modes exit). The pipeline
   * runs it before a change and after; a test that passed before and fails after is a regression.
   */
  async tests(id: string): Promise<TestRun> {
    const job = this.job(id);
    let script = '';
    try {
      const pkg = JSON.parse(readFileSync(join(job.dir, 'package.json'), 'utf8')) as {
        scripts?: Record<string, string>;
      };
      script = pkg.scripts?.['test'] ?? '';
    } catch {
      // No package.json: nothing to run.
    }
    if (!script || /no test specified/i.test(script)) return { ran: false, ok: true, summary: '' };
    const res = await run(packageManager(job.root), ['test'], {
      cwd: job.dir,
      timeoutMs: 240_000,
      env: { CI: '1' },
    });
    return { ran: true, ok: res.code === 0, summary: outputSummary(res.stdout, res.stderr) };
  }

  /**
   * The project's CI checks in the worktree (ci.ts): first the files Fitts changed are
   * formatted the project's way (Prettier, ESLint's fixes) when its CI checks them, then each
   * check runs. The pipeline compares against the same checks before the change.
   */
  async ci(id: string): Promise<CiRun> {
    const job = this.job(id);
    const pm = packageManager(job.root);
    const checks = ciChecks(job.dir, pm);
    if (!checks.length) return { ran: false, checks: [] };
    const changed = await this.changedFiles(job);
    const exec = (tool: string, args: string[]) =>
      run(pm === 'npm' ? 'npx' : pm, [...(pm === 'npm' ? [] : ['exec']), tool, ...args], {
        cwd: job.dir,
        timeoutMs: 120_000,
      });
    const pretty = changed.filter((f) => FORMATTABLE.test(f));
    if (checks.some((c) => c.tool === 'prettier') && pretty.length)
      await exec('prettier', ['--write', '--ignore-unknown', ...pretty]);
    const lintable = changed.filter((f) => LINTABLE.test(f));
    if (checks.some((c) => c.tool === 'eslint') && lintable.length)
      await exec('eslint', ['--fix', ...lintable]);
    const results: CiRun['checks'] = [];
    for (const c of checks) {
      const res = await run(c.command, c.args, {
        cwd: job.dir,
        timeoutMs: 240_000,
        env: { CI: '1' },
      });
      results.push({
        name: c.name,
        ok: res.code === 0,
        summary: outputSummary(res.stdout, res.stderr),
      });
    }
    return { ran: true, checks: results };
  }

  /** The worktree's changed and new files (relative paths), never dependencies. */
  private async changedFiles(job: Job): Promise<string[]> {
    const res = await git(job.dir, 'status', '--porcelain', '--untracked-files=all');
    return res.stdout
      .split(/\r?\n/)
      .map((l) => l.slice(3).trim().replace(/^"|"$/g, ''))
      .map((l) => (l.includes(' -> ') ? (l.split(' -> ')[1] ?? l) : l))
      .filter((l) => l && !l.startsWith('node_modules/') && existsSync(join(job.dir, l)));
  }

  /** A port for a dev server Fitts runs beside the project's own (verification, versions). */
  async reservePort(): Promise<number> {
    return this.freePort();
  }

  releasePort(port: number): void {
    this.ports.delete(port);
  }

  /**
   * A version of the site to look at (the Before/After switch, a fix's live preview), as a
   * folder with its dependencies: the worktree that already has the branch, or a detached one
   * made for viewing. `preview` merges the run's verified branches into its preview branch.
   */
  async viewDir(projectId: string, runId: string, version: SiteVersion): Promise<string> {
    const root = this.root(projectId);
    if (version.kind === 'preview') {
      const { merged } = await this.preview(projectId, runId, version.branches);
      if (version.branches.length && !merged.length) throw new Error('no fix merged cleanly');
      const dir = join(root, '.fitts-worktrees', runId, 'preview');
      await this.dependencies(root, dir);
      return dir;
    }
    const list = await git(root, 'worktree', 'list', '--porcelain');
    for (const block of list.stdout.split(/\r?\n\r?\n/)) {
      const path = /^worktree (.+)$/m.exec(block)?.[1];
      const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1];
      if (path && branch === version.branch && existsSync(path)) return resolve(path);
    }
    const dir = join(
      root,
      '.fitts-worktrees',
      runId,
      `view-${version.branch.replace(/[^\w-]/g, '_')}`,
    );
    if (existsSync(dir)) await git(dir, 'checkout', '-q', '--detach', version.branch);
    else {
      await this.exclude(root);
      mkdirSync(dirname(dir), { recursive: true });
      const add = await git(root, 'worktree', 'add', '-q', '--detach', dir, version.branch);
      if (add.code !== 0)
        throw new Error(`git worktree add failed: ${add.stderr.trim().slice(0, 200)}`);
    }
    await this.dependencies(root, dir);
    return dir;
  }

  private async freePort(): Promise<number> {
    for (let p = FIRST_PORT; p < FIRST_PORT + 40; p++) {
      if (this.ports.has(p) || (await responds(`http://localhost:${p}`, 300))) continue;
      this.ports.add(p);
      return p;
    }
    throw new Error('no free port for verification');
  }

  /** `git add -A && git commit` (no AI co-author or session trailers, §9.2). */
  /**
   * A redesign's fonts and three.js, copied into the project so the site serves them itself:
   * `<static>/fitts/fonts/*.woff2` with a fonts.css, and `<static>/fitts/three/`. The static
   * folder is `public/` for bundler projects (made if missing) and the root for plain sites.
   */
  async assets(id: string, fonts: FontAsk[], three: boolean): Promise<AssetsResult> {
    const job = this.job(id);
    const out = join(staticDir(job.dir), 'fitts');
    const got: FontFiles[] = [];
    const missing: string[] = [];
    for (const ask of fonts.slice(0, 4)) {
      const files = await this.assetSources.fonts?.files(ask).catch(() => null);
      if (!files) {
        missing.push(ask.family);
        continue;
      }
      mkdirSync(join(out, 'fonts'), { recursive: true });
      for (const f of files.files)
        copyFileSync(f.path, join(out, 'fonts', `${files.id}-${f.weight}.woff2`));
      got.push(files);
    }
    const result: AssetsResult = {
      fonts: got.map((f) => ({ family: f.family, weights: f.files.map((x) => x.weight) })),
      missing,
    };
    if (got.length) {
      const licenses = got.map((f) => `${f.family} (${f.license})`).join(', ');
      writeFileSync(
        join(out, 'fonts.css'),
        `/* Fonts for this site's design, served from the site itself. Licenses: ${licenses}. */\n\n${fontFaceCss(got, '/fitts/fonts')}\n`,
      );
      result.fontsCss = '/fitts/fonts.css';
    }
    // three.js is code, not a static file: a bundler won't let source import from public/, so
    // it goes beside the source (src/fitts/three/) and is imported by relative path. A plain
    // site serves it from the root.
    const vendor = this.assetSources.vendorDir;
    if (three && vendor && existsSync(join(vendor, 'three', 'three.module.min.js'))) {
      const bundled = staticDir(job.dir) !== job.dir;
      const code = bundled && existsSync(join(job.dir, 'src')) ? join(job.dir, 'src') : job.dir;
      const dest = join(code, 'fitts', 'three');
      mkdirSync(dest, { recursive: true });
      for (const f of ['three.module.min.js', 'LICENSE'])
        copyFileSync(join(vendor, 'three', f), join(dest, f));
      const path = relative(job.dir, join(dest, 'three.module.min.js')).split(sep).join('/');
      result.three = bundled ? path : `/${path}`;
    }
    return result;
  }

  async commit(
    id: string,
    message: string,
  ): Promise<{ ok: boolean; sha?: string; error?: string }> {
    const job = this.job(id);
    await git(job.dir, 'add', '-A');
    const res = await git(job.dir, 'commit', '-q', '-m', message);
    if (res.code !== 0)
      return { ok: false, error: (res.stderr || res.stdout).trim().slice(0, 200) };
    const sha = await git(job.dir, 'rev-parse', 'HEAD');
    return { ok: true, sha: sha.stdout.trim() };
  }

  /** On fail: drop the worktree and its branch. */
  async discard(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    this.jobs.delete(id);
    await git(job.root, 'worktree', 'remove', '--force', job.dir);
    await git(job.root, 'branch', '-q', '-D', job.branch);
  }

  /** Pushes the branch and opens its PR; the body file sits next to the worktree, not in it. */
  async prOpen(id: string, title: string, body: string, base?: string) {
    const job = this.job(id);
    const bodyFile = join(dirname(job.dir), `pr-${job.branch.replace(/[^\w-]/g, '_')}.md`);
    writeFileSync(bodyFile, body);
    return this.prs().open(job.root, job.dir, job.branch, title, bodyFile, base);
  }

  /** Undo of a merged PR: a `fitts/revert-<n>` branch reverting the fix, as its own PR. */
  async revert(
    projectId: string,
    runId: string,
    pr: number,
    branch: string,
    title: string,
    body: string,
  ) {
    const root = this.root(projectId);
    const dir = join(root, '.fitts-worktrees', runId, `revert-${pr}`);
    const name = `fitts/revert-${pr}`;
    const add = await git(root, 'worktree', 'add', '-q', dir, '-b', name, branch);
    if (add.code !== 0)
      throw new Error(`git worktree add failed: ${add.stderr.trim().slice(0, 200)}`);
    const rev = await git(dir, 'revert', '--no-edit', 'HEAD');
    if (rev.code !== 0) throw new Error(`git revert failed: ${rev.stderr.trim().slice(0, 200)}`);
    const id = relative(join(root, '.fitts-worktrees'), dir).split(sep).join('/');
    this.jobs.set(id, { projectId, root, dir, branch: name, runId });
    return this.prOpen(id, title, body);
  }

  /**
   * "Finished": every worktree of the run is removed (`git worktree remove`), its folder goes,
   * and git forgets them. The `fitts/` branches stay, so the user can check any of them out.
   */
  async finish(projectId: string, runId: string): Promise<void> {
    const root = this.root(projectId);
    const runDir = join(root, '.fitts-worktrees', runId);
    for (const [id, job] of [...this.jobs])
      if (job.projectId === projectId && job.runId === runId) this.jobs.delete(id);
    const list = await git(root, 'worktree', 'list', '--porcelain');
    for (const line of list.stdout.split(/\r?\n/)) {
      const path = /^worktree (.+)$/.exec(line)?.[1];
      if (path && resolve(path).startsWith(runDir + sep))
        await git(root, 'worktree', 'remove', '--force', resolve(path));
    }
    await git(root, 'worktree', 'prune');
    rmSync(runDir, { recursive: true, force: true });
  }

  /** FINALIZE: every verified branch merged into `fitts/preview-<runId>` (§9.4). */
  async preview(projectId: string, runId: string, branches: string[]) {
    const root = this.root(projectId);
    const dir = join(root, '.fitts-worktrees', runId, 'preview');
    const name = `fitts/preview-${runId}`;
    if (!existsSync(dir)) {
      const add = await git(root, 'worktree', 'add', '-q', dir, '-b', name, 'HEAD');
      if (add.code !== 0)
        throw new Error(`git worktree add failed: ${add.stderr.trim().slice(0, 200)}`);
    }
    const merged: string[] = [];
    for (const b of branches) {
      const res = await git(dir, 'merge', '--no-edit', '-q', b);
      if (res.code === 0) merged.push(b);
      else await git(dir, 'merge', '--abort');
    }
    return { branch: name, merged };
  }
}

/** The project's package manager, by its lockfile. */
function packageManager(root: string): PackageManager {
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

/** The useful end of a command's output: its failing lines, or its last lines. Plain text. */
function outputSummary(stdout: string, stderr: string): string {
  // eslint-disable-next-line no-control-regex
  const plain = `${stdout}\n${stderr}`.replace(/\u001b\[[0-9;]*m/g, '');
  const lines = plain.split(/\r?\n/).filter((l) => l.trim());
  const failing = lines.filter((l) => /\b(FAIL|✗|×|failed|Error|error)\b/.test(l)).slice(0, 6);
  return (failing.length ? failing : lines.slice(-6)).join('\n').slice(0, 1200);
}

/** The worktree's dev command on its own port, with the Fitts plugin (see devCommandOnPort). */
export function verifyCommand(dir: string, port: number, pluginFile?: string): string {
  return devCommandOnPort(dir, port, pluginFile);
}

const BUNDLERS = ['vite', 'next', 'astro', 'nuxt', 'react-scripts', '@sveltejs/kit'];

/** Where a project serves static files from: public/ for bundler projects, else the root. */
export function staticDir(dir: string): string {
  if (existsSync(join(dir, 'public'))) return join(dir, 'public');
  const pkg = join(dir, 'package.json');
  if (!existsSync(pkg)) return dir;
  try {
    const json = JSON.parse(readFileSync(pkg, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const deps = { ...json.dependencies, ...json.devDependencies };
    const scripts = Object.values(json.scripts ?? {});
    const bundled = BUNDLERS.some(
      (b) => b in deps || scripts.some((s) => s.split(/\s+/).includes(b)),
    );
    return bundled ? join(dir, 'public') : dir;
  } catch {
    return dir;
  }
}

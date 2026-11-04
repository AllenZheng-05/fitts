// @vitest-environment node
// The fix pipeline's git side (§9) on a throwaway repo with a local bare `origin` and
// FITTS_GH_DRY_RUN: no GitHub, no network.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ BrowserWindow: class {}, session: {} }));
vi.mock('@fitts/probes/page.js?raw', () => ({ default: '' }));

const { FixHost, hideWhile, hiddenFiles, keepGitLink, staticDir, verifyCommand } =
  await import('../../src/main/fix/fix-host');
const { DryRunPrs, dryRunRegistry } = await import('../../src/main/fix/pr');

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

let tmp: string;
let root: string;
let host: InstanceType<typeof FixHost>;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'fitts-fix-'));
  root = join(tmp, 'app');
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'app',
      scripts: { dev: 'vite --configLoader runner --port 5173 --strictPort' },
    }),
  );
  writeFileSync(join(root, 'src', 'styles.css'), '.send-link {\r\n  padding: 0;\r\n}\r\n');
  git(tmp, 'init', '-q', '-b', 'main', 'app');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'core.autocrlf', 'false');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  git(tmp, 'clone', '-q', '--bare', 'app', 'origin.git');
  git(root, 'remote', 'add', 'origin', join(tmp, 'origin.git'));
  host = new FixHost(
    (id) =>
      (id === 'app'
        ? { id, kind: 'local', folder: root }
        : { id, kind: 'local', folder: join(root, 'src') }) as never,
    () => new DryRunPrs(),
  );
});

afterAll(() => {
  try {
    git(root, 'worktree', 'prune');
  } catch {
    // Best effort.
  }
  rmSync(tmp, { recursive: true, force: true });
});

describe('FixHost', () => {
  it('works only on a project that is its own git repo', async () => {
    expect(await host.call('app', { fn: 'available' })).toEqual({ ok: true });
    expect(await host.call('sub', { fn: 'available' })).toEqual({
      ok: false,
      reason: 'the project is inside another repository',
    });
  });

  let job = '';
  let branch = '';
  it('prepares a worktree on a fitts/ branch, excluded in .git/info/exclude', async () => {
    const r = (await host.call('app', {
      fn: 'prepare',
      runId: 'run-1',
      findingId: 'f1',
      branch: 'fitts/h7-tap-target',
    })) as { job: string; branch: string; sha: string };
    job = r.job;
    branch = r.branch;
    expect(job).toBe('run-1/f1');
    expect(branch).toBe('fitts/h7-tap-target');
    expect(r.sha).toBe(git(root, 'rev-parse', 'HEAD'));
    expect(existsSync(join(root, '.fitts-worktrees', 'run-1', 'f1', 'src', 'styles.css'))).toBe(
      true,
    );
    expect(readFileSync(join(root, '.git', 'info', 'exclude'), 'utf8')).toContain(
      '.fitts-worktrees/',
    );
    expect(git(root, 'status', '--porcelain')).toBe('');
  });

  it('reads, searches and patches inside the worktree only (CRLF kept)', async () => {
    expect(await host.call('app', { fn: 'read', job, path: 'src/styles.css' })).toContain(
      'padding: 0;',
    );
    expect(await host.call('app', { fn: 'search', job, text: 'SEND-LINK' })).toEqual([
      { path: 'src/styles.css', line: 1, text: '.send-link {' },
    ]);
    await expect(
      host.call('app', { fn: 'read', job, path: '../../../package.json' }),
    ).rejects.toThrow(/outside/);
    await expect(host.call('app', { fn: 'read', job, path: 'node_modules/x' })).rejects.toThrow(
      /off limits/,
    );
    expect(
      await host.call('app', {
        fn: 'patch',
        job,
        path: 'src/styles.css',
        find: 'nope',
        replace: '',
      }),
    ).toEqual({
      ok: false,
      error: 'text not found',
    });
    expect(
      await host.call('app', {
        fn: 'patch',
        job,
        path: 'src/styles.css',
        find: '.send-link {\n  padding: 0;',
        replace: '.send-link {\n  padding: 12px;',
      }),
    ).toEqual({ ok: true });
    const text = readFileSync(
      join(root, '.fitts-worktrees', 'run-1', 'f1', 'src', 'styles.css'),
      'utf8',
    );
    expect(text).toBe('.send-link {\r\n  padding: 12px;\r\n}\r\n');
    expect(await host.call('app', { fn: 'diff', job })).toContain('+  padding: 12px;');
  });

  it('commits without trailers, then opens a dry-run PR by pushing to origin', async () => {
    const c = (await host.call('app', {
      fn: 'commit',
      job,
      message: 'Tap target is too small (Fitts: H7 sev 2)',
    })) as {
      ok: boolean;
    };
    expect(c.ok).toBe(true);
    const msg = git(join(root, '.fitts-worktrees', 'run-1', 'f1'), 'log', '-1', '--format=%B');
    expect(msg).toBe('Tap target is too small (Fitts: H7 sev 2)');
    const pr = await host.call('app', {
      fn: 'prOpen',
      job,
      title: 'Tap target is too small',
      body: 'body',
    });
    expect(pr).toEqual({ number: 1, url: 'dry-run://pr/1' });
    expect(git(join(tmp, 'origin.git'), 'branch', '--list', branch)).toContain(branch);
    expect(await host.call('app', { fn: 'prMerged', pr: 1 })).toBe(false);
  });

  it('a merged PR’s undo is a revert branch and PR; a closed PR deletes its remote branch', async () => {
    const registry = dryRunRegistry(root);
    const data = JSON.parse(readFileSync(registry, 'utf8')) as { prs: { state: string }[] };
    if (data.prs[0]) data.prs[0].state = 'merged';
    writeFileSync(registry, JSON.stringify(data));
    expect(await host.call('app', { fn: 'prMerged', pr: 1 })).toBe(true);
    const revert = await host.call('app', {
      fn: 'revert',
      runId: 'run-1',
      pr: 1,
      branch,
      title: 'Revert',
      body: 'b',
      sha: git(join(root, '.fitts-worktrees', 'run-1', 'f1'), 'rev-parse', 'HEAD'),
    });
    expect(revert).toEqual({ number: 2, url: 'dry-run://pr/2' });
    const reverted = readFileSync(
      join(root, '.fitts-worktrees', 'run-1', 'revert-1', 'src', 'styles.css'),
      'utf8',
    );
    expect(reverted).toContain('padding: 0;');
    await host.call('app', { fn: 'prClose', pr: 2, branch: 'fitts/revert-1' });
    expect(git(join(tmp, 'origin.git'), 'branch', '--list', 'fitts/revert-1')).toBe('');
  });

  it('a second branch with the same name gets a suffix; discard drops a job and its branch', async () => {
    const second = (await host.call('app', {
      fn: 'prepare',
      runId: 'run-1',
      findingId: 'f2',
      branch: 'fitts/h7-tap-target',
    })) as { job: string; branch: string };
    expect(second.branch).toBe('fitts/h7-tap-target-2');
    await host.call('app', { fn: 'discard', job: second.job });
    expect(existsSync(join(root, '.fitts-worktrees', 'run-1', 'f2'))).toBe(false);
    expect(git(root, 'branch', '--list', 'fitts/h7-tap-target-2')).toBe('');
  });

  it('a redesign lists folders and writes whole files; reset drops uncommitted edits', async () => {
    const r = (await host.call('app', {
      fn: 'prepare',
      runId: 'run-1',
      findingId: 'redesign',
      branch: 'fitts/redesign-quiet-stone',
    })) as { job: string; branch: string };
    expect(await host.call('app', { fn: 'list', job: r.job, dir: '' })).toEqual(
      expect.arrayContaining(['package.json', 'src/']),
    );
    expect(
      await host.call('app', {
        fn: 'write',
        job: r.job,
        path: 'src/themes/quiet/theme.css',
        content: ':root {\n  --ink: #2f3a3a;\n}\n',
      }),
    ).toEqual({ ok: true });
    // Replacing a CRLF file keeps its line endings.
    await host.call('app', { fn: 'write', job: r.job, path: 'src/styles.css', content: 'a\nb\n' });
    const dir = join(root, '.fitts-worktrees', 'run-1', 'redesign');
    expect(readFileSync(join(dir, 'src', 'styles.css'), 'utf8')).toBe('a\r\nb\r\n');
    expect(
      await host.call('app', { fn: 'write', job: r.job, path: 'run.exe', content: 'x' }),
    ).toEqual({ ok: false, error: "run.exe isn't a source file" });
    const redesign = (await host.call('app', {
      fn: 'commit',
      job: r.job,
      message: 'Redesign: Quiet stone',
    })) as { sha: string };
    // An adjustment that fails its check is dropped, back to the redesign's commit.
    await host.call('app', { fn: 'write', job: r.job, path: 'src/extra.css', content: 'x' });
    await host.call('app', { fn: 'reset', job: r.job });
    expect(existsSync(join(dir, 'src', 'extra.css'))).toBe(false);
    expect(existsSync(join(dir, 'src', 'themes', 'quiet', 'theme.css'))).toBe(true);
    // A failed fix on a shared branch goes back to the last good commit, commits and all.
    await host.call('app', { fn: 'write', job: r.job, path: 'src/bad.css', content: 'x' });
    await host.call('app', { fn: 'commit', job: r.job, message: 'bad' });
    await host.call('app', { fn: 'reset', job: r.job, to: redesign.sha });
    expect(existsSync(join(dir, 'src', 'bad.css'))).toBe(false);
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(redesign.sha);
  });

  it('undo on a shared branch reverts one commit; a revert that conflicts changes nothing', async () => {
    const r = (await host.call('app', {
      fn: 'prepare',
      runId: 'run-1',
      findingId: 'run',
      branch: 'fitts/run-run-1',
    })) as { job: string };
    const dir = join(root, '.fitts-worktrees', 'run-1', 'run');
    await host.call('app', { fn: 'write', job: r.job, path: 'src/a.css', content: 'a\n' });
    const a = (await host.call('app', { fn: 'commit', job: r.job, message: 'A' })) as {
      sha: string;
    };
    await host.call('app', { fn: 'write', job: r.job, path: 'src/b.css', content: 'b\n' });
    const b = (await host.call('app', { fn: 'commit', job: r.job, message: 'B' })) as {
      sha: string;
    };
    // The middle commit goes; the later one stays.
    const undone = (await host.call('app', { fn: 'revertCommit', job: r.job, sha: a.sha })) as {
      ok: boolean;
      sha?: string;
    };
    expect(undone.ok).toBe(true);
    expect(existsSync(join(dir, 'src', 'a.css'))).toBe(false);
    expect(existsSync(join(dir, 'src', 'b.css'))).toBe(true);
    expect(git(dir, 'log', '-1', '--format=%s')).toBe('Revert "A"');
    // Redo: revert the revert.
    const redone = (await host.call('app', {
      fn: 'revertCommit',
      job: r.job,
      sha: undone.sha ?? '',
    })) as { ok: boolean };
    expect(redone.ok).toBe(true);
    expect(existsSync(join(dir, 'src', 'a.css'))).toBe(true);
    // A commit a later one built on can't be reverted cleanly: nothing changes.
    await host.call('app', { fn: 'write', job: r.job, path: 'src/b.css', content: 'b2\n' });
    await host.call('app', { fn: 'commit', job: r.job, message: 'B2' });
    expect(await host.call('app', { fn: 'revertCommit', job: r.job, sha: b.sha })).toMatchObject({
      ok: false,
    });
    expect(git(dir, 'status', '--porcelain')).toBe('');
    expect(git(dir, 'log', '-1', '--format=%s')).toBe('B2');
    // A dozen git spawns: past 5 s on a loaded machine right after a build (Nov 3 and 4).
  }, 20_000);

  it('a fix can start from the redesign; its PR stacks on it, and push updates an open PR', async () => {
    const fix = (await host.call('app', {
      fn: 'prepare',
      runId: 'run-1',
      findingId: 'f3',
      branch: 'fitts/h1-stacked',
      base: 'fitts/redesign-quiet-stone',
    })) as { job: string; branch: string };
    const dir = join(root, '.fitts-worktrees', 'run-1', 'f3');
    expect(existsSync(join(dir, 'src', 'themes', 'quiet', 'theme.css'))).toBe(true);
    await host.call('app', { fn: 'write', job: fix.job, path: 'src/f3.css', content: 'x' });
    await host.call('app', { fn: 'commit', job: fix.job, message: 'f3' });
    const pr = (await host.call('app', {
      fn: 'prOpen',
      job: fix.job,
      title: 'f3',
      body: 'b',
      base: 'fitts/redesign-quiet-stone',
    })) as { number: number };
    const registry = JSON.parse(readFileSync(dryRunRegistry(root), 'utf8')) as {
      prs: { number: number; base?: string }[];
    };
    expect(registry.prs.find((p) => p.number === pr.number)?.base).toBe(
      'fitts/redesign-quiet-stone',
    );
    // The base went up with it, so the stacked PR has something to point at.
    expect(
      git(join(tmp, 'origin.git'), 'branch', '--list', 'fitts/redesign-quiet-stone'),
    ).toContain('fitts/redesign-quiet-stone');
    await host.call('app', { fn: 'write', job: fix.job, path: 'src/f3.css', content: 'y' });
    await host.call('app', { fn: 'commit', job: fix.job, message: 'f3 again' });
    await host.call('app', { fn: 'push', job: fix.job });
    expect(git(join(tmp, 'origin.git'), 'log', '-1', '--format=%s', fix.branch)).toBe('f3 again');
  });

  it('runs the project’s own tests in a worktree (none: nothing ran)', async () => {
    const r = (await host.call('app', {
      fn: 'prepare',
      runId: 'run-1',
      findingId: 'tests',
      branch: 'fitts/tests',
    })) as { job: string };
    expect(await host.call('app', { fn: 'tests', job: r.job })).toEqual({
      ran: false,
      ok: true,
      summary: '',
    });
    const dir = join(root, '.fitts-worktrees', 'run-1', 'tests');
    const pkg = (test: string) =>
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'app', scripts: { test } }));
    pkg('node -e "process.exit(0)"');
    expect(await host.call('app', { fn: 'tests', job: r.job })).toMatchObject({
      ran: true,
      ok: true,
    });
    pkg('node -e "console.log(\'FAIL contract\');process.exit(1)"');
    expect(await host.call('app', { fn: 'tests', job: r.job })).toMatchObject({
      ran: true,
      ok: false,
      summary: expect.stringContaining('FAIL contract') as string,
    });
  });

  it('runs the CI checks its workflows name, or just one of them', async () => {
    const r = (await host.call('app', {
      fn: 'prepare',
      runId: 'run-1',
      findingId: 'ci',
      branch: 'fitts/ci',
    })) as { job: string };
    const dir = join(root, '.fitts-worktrees', 'run-1', 'ci');
    expect(await host.call('app', { fn: 'ci', job: r.job })).toEqual({ ran: false, checks: [] });
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    writeFileSync(
      join(dir, '.github', 'workflows', 'ci.yml'),
      'jobs:\n  test:\n    steps:\n      - run: npm run lint\n      - run: npm run typecheck\n',
    );
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'app',
        scripts: {
          lint: 'node -e "process.exit(0)"',
          typecheck: 'node -e "console.log(\'src/a.ts(1,1): error TS2322\');process.exit(1)"',
        },
      }),
    );
    expect(await host.call('app', { fn: 'ci', job: r.job })).toEqual({
      ran: true,
      checks: [
        { name: 'npm lint', ok: true, summary: expect.any(String) as string },
        {
          name: 'npm typecheck',
          ok: false,
          summary: expect.stringContaining('error TS2322') as string,
        },
      ],
    });
    expect(await host.call('app', { fn: 'ci', job: r.job, only: 'npm lint' })).toEqual({
      ran: true,
      checks: [{ name: 'npm lint', ok: true, summary: expect.any(String) as string }],
    });
    expect(await host.call('app', { fn: 'ci', job: r.job, only: 'nope' })).toEqual({
      ran: false,
      checks: [],
    });
  });

  it('verification runs the dev script on its own port', () => {
    // No lockfile here, so npx; a pnpm project gets `pnpm exec`.
    expect(verifyCommand(root, 5181)).toBe(
      'npx vite --configLoader runner --port 5181 --strictPort',
    );
  });
});

describe('a redesign’s assets', () => {
  it('copies fonts and three.js into the static folder, with a fonts.css and licenses', async () => {
    const cache = join(tmp, 'font-cache');
    mkdirSync(cache, { recursive: true });
    writeFileSync(join(cache, 'archivo-800.woff2'), 'woff2');
    const vendor = join(tmp, 'vendor');
    mkdirSync(join(vendor, 'three'), { recursive: true });
    writeFileSync(join(vendor, 'three', 'three.module.min.js'), 'export const REVISION = "186";');
    writeFileSync(join(vendor, 'three', 'LICENSE'), 'MIT');
    const fonts = {
      files: (ask: { family: string }) =>
        Promise.resolve(
          ask.family === 'Archivo'
            ? {
                family: 'Archivo',
                id: 'archivo',
                license: 'OFL-1.1',
                files: [{ weight: 800, path: join(cache, 'archivo-800.woff2') }],
              }
            : null,
        ),
    };
    const withAssets = new FixHost(
      () => ({ id: 'app', kind: 'local', folder: root }) as never,
      () => new DryRunPrs(),
      { fonts: fonts as never, vendorDir: vendor },
    );
    const { job: id } = (await withAssets.call('app', {
      fn: 'prepare',
      runId: 'run-3',
      findingId: 'redesign',
      branch: 'fitts/redesign-assets',
    })) as { job: string };
    const res = (await withAssets.call('app', {
      fn: 'assets',
      job: id,
      fonts: [
        { family: 'Archivo', id: 'archivo', weights: [800] },
        { family: 'Nope Sans', weights: [400] },
      ],
      three: true,
    })) as { fontsCss?: string; three?: string; missing: string[] };
    expect(res).toMatchObject({
      fontsCss: '/fitts/fonts.css',
      three: 'src/fitts/three/three.module.min.js',
      missing: ['Nope Sans'],
    });
    // A Vite project without public/ gets one; files land under public/fitts/.
    const dir = join(root, '.fitts-worktrees', 'run-3', 'redesign', 'public', 'fitts');
    expect(readFileSync(join(dir, 'fonts', 'archivo-800.woff2'), 'utf8')).toBe('woff2');
    const css = readFileSync(join(dir, 'fonts.css'), 'utf8');
    expect(css).toContain('Archivo (OFL-1.1)');
    expect(css).toContain('url("/fitts/fonts/archivo-800.woff2")');
    // three.js is code: beside the source, never in public/ (Vite won't import from there).
    const wt = join(root, '.fitts-worktrees', 'run-3', 'redesign');
    expect(existsSync(join(wt, 'src', 'fitts', 'three', 'three.module.min.js'))).toBe(true);
    expect(existsSync(join(dir, 'three'))).toBe(false);
    await withAssets.call('app', { fn: 'discard', job: id });
  });

  it('serves from the root for a plain static site', () => {
    const plain = join(tmp, 'plain');
    mkdirSync(plain, { recursive: true });
    writeFileSync(join(plain, 'index.html'), '<h1>Hi</h1>');
    expect(staticDir(plain)).toBe(plain);
    expect(staticDir(root)).toBe(join(root, 'public'));
  });
});

describe('the edit allowlist on a real repo (SPEC-phase4 §7.3)', () => {
  it('refuses a patch outside it; package.json changes only with the owner’s own "Go ahead"', async () => {
    const answers = new Map<string, { question: string; answer: string }>();
    const guarded = new FixHost(
      (id) => ({ id, kind: 'local', folder: root }) as never,
      () => new DryRunPrs(),
      {},
      {
        mode: () => 'autonomous',
        ownerAnswer: (_p, itemId) => answers.get(itemId),
        yes: 'Go ahead',
        metaKey: () => undefined,
      },
    );
    const r = (await guarded.call('app', {
      fn: 'prepare',
      runId: 'run-allow',
      findingId: 'f1',
      branch: 'fitts/allow',
    })) as { job: string };
    await guarded.call('app', {
      fn: 'scope',
      job: r.job,
      files: ['src/styles.css', 'package.json'],
    });
    const patch = (path: string, find: string, replace: string) =>
      guarded.call('app', { fn: 'patch', job: r.job, path, find, replace }) as Promise<{
        ok: boolean;
        error?: string;
      }>;
    // The finding's own file: allowed.
    expect(await patch('src/styles.css', 'padding: 0;', 'padding: 12px;')).toEqual({ ok: true });
    // package.json, listed as a "default" by the fixer: still refused, in Autonomous.
    const refused = await patch('package.json', '"name":"app"', '"name":"pwned"');
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/request_scope/);
    // A grant without the owner, or with a "Go ahead" to some other question, doesn't count.
    expect(
      (
        (await guarded.call('app', { fn: 'grant', job: r.job, path: 'package.json' })) as {
          ok: boolean;
        }
      ).ok,
    ).toBe(false);
    answers.set('q-other', { question: 'Can I change src/x.ts?', answer: 'Go ahead' });
    expect(
      (
        (await guarded.call('app', {
          fn: 'grant',
          job: r.job,
          path: 'package.json',
          itemId: 'q-other',
        })) as { ok: boolean }
      ).ok,
    ).toBe(false);
    expect((await patch('package.json', '"name":"app"', '"name":"pwned"')).ok).toBe(false);
    expect(
      readFileSync(join(root, '.fitts-worktrees', 'run-allow', 'f1', 'package.json'), 'utf8'),
    ).toContain('"name":"app"');
    // The owner's own "Go ahead" on the question that names it.
    answers.set('q-pkg', {
      question: 'To fix it I need to change package.json because the script is wrong. OK?',
      answer: 'Go ahead',
    });
    expect(
      await guarded.call('app', { fn: 'grant', job: r.job, path: 'package.json', itemId: 'q-pkg' }),
    ).toEqual({ ok: true });
    expect(await patch('package.json', '"name":"app"', '"name":"app2"')).toEqual({ ok: true });
    await guarded.call('app', { fn: 'discard', job: r.job });
  });
});

describe('keepGitLink', () => {
  it('puts back a worktree link that a WSL tool rewrote to /mnt paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'fitts-link-'));
    const admin = join(root, 'repo', '.git', 'worktrees', 'run');
    const wt = join(root, 'wt');
    mkdirSync(admin, { recursive: true });
    mkdirSync(wt);
    writeFileSync(join(wt, '.git'), `gitdir: ${admin}\n`);
    writeFileSync(join(admin, 'gitdir'), `${join(wt, '.git')}\n`);
    const restore = keepGitLink(wt);
    writeFileSync(join(wt, '.git'), 'gitdir: /mnt/c/repo/.git/worktrees/run\n');
    writeFileSync(join(admin, 'gitdir'), '/mnt/c/wt/.git\n');
    restore();
    expect(readFileSync(join(wt, '.git'), 'utf8')).toBe(`gitdir: ${admin}\n`);
    expect(readFileSync(join(admin, 'gitdir'), 'utf8')).toBe(`${join(wt, '.git')}\n`);
    rmSync(root, { recursive: true, force: true });
  });

  it('does nothing for a folder that isn’t a linked worktree', () => {
    const root = mkdtempSync(join(tmpdir(), 'fitts-link-'));
    expect(() => keepGitLink(root)()).not.toThrow();
    rmSync(root, { recursive: true, force: true });
  });
});

describe('a benchmark’s answer keys stay hidden from the fixer (FITTS_HIDE_FILES)', () => {
  it('moves them out of the worktree while Muse Code works, and puts them back', () => {
    const root = mkdtempSync(join(tmpdir(), 'fitts-hide-'));
    const wt = join(root, 'run');
    mkdirSync(join(wt, 'docs'), { recursive: true });
    writeFileSync(join(wt, 'PLANTED.md'), 'answer key');
    writeFileSync(join(wt, 'docs', 'prompt.md'), 'the planted issues');
    writeFileSync(join(wt, 'theme.ts'), 'export {}');
    process.env['FITTS_HIDE_FILES'] = 'PLANTED.md, ./docs/prompt.md';
    expect(hiddenFiles()).toEqual(['PLANTED.md', 'docs/prompt.md']);
    const unhide = hideWhile(wt);
    expect(existsSync(join(wt, 'PLANTED.md'))).toBe(false);
    expect(existsSync(join(wt, 'docs', 'prompt.md'))).toBe(false);
    expect(existsSync(join(wt, 'theme.ts'))).toBe(true);
    unhide();
    expect(readFileSync(join(wt, 'PLANTED.md'), 'utf8')).toBe('answer key');
    expect(readFileSync(join(wt, 'docs', 'prompt.md'), 'utf8')).toBe('the planted issues');
    delete process.env['FITTS_HIDE_FILES'];
    rmSync(root, { recursive: true, force: true });
  });

  it('nothing is hidden without the setting', () => {
    delete process.env['FITTS_HIDE_FILES'];
    expect(hiddenFiles()).toEqual([]);
  });
});

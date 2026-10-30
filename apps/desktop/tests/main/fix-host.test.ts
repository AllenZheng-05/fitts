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

const { FixHost, verifyCommand } = await import('../../src/main/fix/fix-host');
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
    })) as { job: string; branch: string };
    job = r.job;
    branch = r.branch;
    expect(job).toBe('run-1/f1');
    expect(branch).toBe('fitts/h7-tap-target');
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

  it('merges verified branches into the preview branch, and discards a failed job', async () => {
    const preview = await host.call('app', { fn: 'preview', runId: 'run-1', branches: [branch] });
    expect(preview).toEqual({ branch: 'fitts/preview-run-1', merged: [branch] });
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
    await host.call('app', { fn: 'commit', job: r.job, message: 'Redesign: Quiet stone' });
    // An adjustment that fails its check is dropped, back to the redesign's commit.
    await host.call('app', { fn: 'write', job: r.job, path: 'src/extra.css', content: 'x' });
    await host.call('app', { fn: 'reset', job: r.job });
    expect(existsSync(join(dir, 'src', 'extra.css'))).toBe(false);
    expect(existsSync(join(dir, 'src', 'themes', 'quiet', 'theme.css'))).toBe(true);
  });

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

  it('verification runs the dev script on its own port', () => {
    // No lockfile here, so npx; a pnpm project gets `pnpm exec`.
    expect(verifyCommand(root, 5181)).toBe(
      'npx vite --configLoader runner --port 5181 --strictPort',
    );
  });
});

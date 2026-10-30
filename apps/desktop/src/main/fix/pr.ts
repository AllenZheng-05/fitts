// Pull requests (SPEC-phase2 §9.3), behind one interface. `gh` opens real PRs; the dry run
// (FITTS_GH_DRY_RUN=1) pushes the branch to the repo's own `origin` (a local bare repo in tests)
// and keeps a PR registry next to the worktrees, so the whole pipeline runs without GitHub.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { run } from '../spawn';

export interface PrRef {
  number: number;
  url: string;
}

export interface PrBackend {
  /**
   * Pushes `branch` from the worktree and opens a PR with the body file, against `base` when
   * given (a fix stacked on the redesign) or the repo's default branch.
   */
  open(
    root: string,
    dir: string,
    branch: string,
    title: string,
    bodyFile: string,
    base?: string,
  ): Promise<PrRef>;
  /** Pushes new commits on a branch whose PR is open (it updates in place). */
  push(dir: string, branch: string): Promise<void>;
  /** Closes the PR and deletes its branch (undo of an open PR). */
  close(root: string, pr: number, branch: string): Promise<void>;
  /** Was the PR merged? (Undo then opens a revert PR instead.) */
  merged(root: string, pr: number): Promise<boolean>;
}

const git = (cwd: string, ...args: string[]) => run('git', args, { cwd, timeoutMs: 60_000 });

const pushBranch = async (dir: string, branch: string) => {
  const push = await git(dir, 'push', '-q', '-u', 'origin', branch);
  if (push.code !== 0) throw new Error(`push failed: ${push.stderr.trim().slice(0, 200)}`);
};

interface DryRunPr {
  number: number;
  branch: string;
  base?: string;
  title: string;
  state: 'open' | 'closed' | 'merged';
  url: string;
}

/** The registry a dry run keeps (tests flip `state` to 'merged' to try undo of a merged PR). */
export const dryRunRegistry = (root: string) => join(root, '.fitts-worktrees', 'dry-run-prs.json');

export class DryRunPrs implements PrBackend {
  private load(root: string): { next: number; prs: DryRunPr[] } {
    const file = dryRunRegistry(root);
    if (!existsSync(file)) return { next: 1, prs: [] };
    return JSON.parse(readFileSync(file, 'utf8')) as { next: number; prs: DryRunPr[] };
  }

  private save(root: string, data: { next: number; prs: DryRunPr[] }): void {
    writeFileSync(dryRunRegistry(root), JSON.stringify(data, null, 2));
  }

  async open(
    root: string,
    dir: string,
    branch: string,
    title: string,
    _bodyFile: string,
    base?: string,
  ): Promise<PrRef> {
    if (base) await pushBranch(dir, base);
    await pushBranch(dir, branch);
    const data = this.load(root);
    const number = data.next;
    const url = `dry-run://pr/${number}`;
    data.prs.push({ number, branch, ...(base ? { base } : {}), title, state: 'open', url });
    data.next += 1;
    this.save(root, data);
    return { number, url };
  }

  push(dir: string, branch: string): Promise<void> {
    return pushBranch(dir, branch);
  }

  async close(root: string, pr: number, branch: string): Promise<void> {
    const data = this.load(root);
    const entry = data.prs.find((p) => p.number === pr);
    if (entry) entry.state = 'closed';
    this.save(root, data);
    await git(root, 'push', '-q', 'origin', '--delete', branch);
  }

  merged(root: string, pr: number): Promise<boolean> {
    return Promise.resolve(this.load(root).prs.find((p) => p.number === pr)?.state === 'merged');
  }
}

/** Real PRs with the GitHub CLI (needs `gh auth login`; Allen's real-PR check covers it). */
export class GhPrs implements PrBackend {
  async open(
    _root: string,
    dir: string,
    branch: string,
    title: string,
    bodyFile: string,
    base?: string,
  ) {
    // A stacked PR's base has to be on GitHub too (its own PR may not be open yet).
    if (base) await pushBranch(dir, base);
    await pushBranch(dir, branch);
    const res = await run(
      'gh',
      [
        'pr',
        'create',
        '--title',
        title,
        '--body-file',
        bodyFile,
        '--head',
        branch,
        ...(base ? ['--base', base] : []),
      ],
      { cwd: dir, timeoutMs: 60_000 },
    );
    const url = /https:\/\/\S+\/pull\/(\d+)/.exec(res.stdout);
    if (res.code !== 0 || !url?.[1])
      throw new Error(`gh pr create failed: ${res.stderr.trim().slice(0, 200)}`);
    return { number: Number(url[1]), url: url[0] };
  }

  push(dir: string, branch: string): Promise<void> {
    return pushBranch(dir, branch);
  }

  async close(root: string, pr: number): Promise<void> {
    await run('gh', ['pr', 'close', String(pr), '--delete-branch'], {
      cwd: root,
      timeoutMs: 60_000,
    });
  }

  async merged(root: string, pr: number): Promise<boolean> {
    const res = await run('gh', ['pr', 'view', String(pr), '--json', 'mergedAt'], {
      cwd: root,
      timeoutMs: 30_000,
    });
    try {
      return Boolean((JSON.parse(res.stdout) as { mergedAt?: string | null }).mergedAt);
    } catch {
      return false;
    }
  }
}

export const prBackend = (): PrBackend =>
  process.env['FITTS_GH_DRY_RUN'] === '1' ? new DryRunPrs() : new GhPrs();

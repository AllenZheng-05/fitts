// Main's half of Understand (SPEC-phase4 §3.2): which commit the project is at, the cache under
// userData/projects/<id>/app-model/<sha>.json, the owner's corrections beside it (owner.json),
// and FITTS.md (the project summary, for Muse Code's prompt file). Pass 1 and Pass 2 run in the
// agent process; main only asks and stores. Nothing is ever written into the user's repo.
import type { AppModel, AppModelPatch, Project } from '@fitts/schema';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { UnderstandAsk } from '../../agent/protocol';
import { run } from '../spawn';
import { SAFE_ID } from '../store/run-log';
import { fittsMd } from './fitts-md';

export { fittsMd };

interface Cached {
  model: AppModel;
  hashes: Record<string, string>;
  modeled: boolean;
}

export class UnderstandHost {
  constructor(
    private readonly root: string,
    private readonly projectFor: (id: string) => Project | undefined,
    private readonly ask: (ask: UnderstandAsk) => void,
  ) {}

  private dir(projectId: string): string {
    return join(this.root, 'projects', projectId, 'app-model');
  }

  /** HEAD's sha with "+dirty" when the tree has changes; "no-git" for a folder without git. */
  async commitOf(folder: string): Promise<string> {
    const [head, status] = await Promise.all([
      run('git', ['rev-parse', 'HEAD'], { cwd: folder, timeoutMs: 5000 }),
      run('git', ['status', '--porcelain'], { cwd: folder, timeoutMs: 10_000 }),
    ]);
    if (head.code !== 0) return 'no-git';
    const sha = head.stdout.trim().slice(0, 40) || 'no-git';
    return status.code === 0 && status.stdout.trim() ? `${sha}+dirty` : sha;
  }

  private cached(projectId: string, sha: string): Cached | undefined {
    const file = join(this.dir(projectId), `${sha}.json`);
    try {
      return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Cached) : undefined;
    } catch {
      return undefined;
    }
  }

  patches(projectId: string): AppModelPatch[] {
    const file = join(this.dir(projectId), 'owner.json');
    try {
      return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as AppModelPatch[]) : [];
    } catch {
      return [];
    }
  }

  /** A local project opened: ask the agent to understand it (the cache makes a repeat cheap). */
  async start(projectId: string): Promise<void> {
    if (!SAFE_ID.test(projectId)) return;
    const project = this.projectFor(projectId);
    if (project?.kind !== 'local' || !project.folder || !existsSync(project.folder)) return;
    const commit = await this.commitOf(project.folder);
    const cached = this.cached(projectId, commit.replace(/\+dirty$/, ''));
    this.ask({
      projectId,
      folder: project.folder,
      commit,
      ...(cached ? { cached } : {}),
      patches: this.patches(projectId),
    });
  }

  /** The agent built a model: cache it by its commit, and keep the summary as FITTS.md. */
  store(
    projectId: string,
    model: AppModel,
    hashes: Record<string, string>,
    modeled: boolean,
  ): void {
    if (!SAFE_ID.test(projectId)) return;
    const dir = this.dir(projectId);
    mkdirSync(dir, { recursive: true });
    const sha = model.commit.replace(/\+dirty$/, '');
    const cached: Cached = { model, hashes, modeled };
    writeFileSync(join(dir, `${sha}.json`), JSON.stringify(cached, null, 2));
    writeFileSync(join(this.root, 'projects', projectId, 'FITTS.md'), fittsMd(model));
  }

  /** The owner's corrections, appended (they outlive every cache refresh). */
  addPatches(projectId: string, patches: AppModelPatch[]): void {
    if (!SAFE_ID.test(projectId) || patches.length === 0) return;
    const dir = this.dir(projectId);
    mkdirSync(dir, { recursive: true });
    const all = [...this.patches(projectId), ...patches].slice(-200);
    writeFileSync(join(dir, 'owner.json'), JSON.stringify(all, null, 2));
  }

  /** Settings › Projects: forget what Fitts understood (the next open rebuilds it). */
  clear(projectId: string): void {
    if (!SAFE_ID.test(projectId)) return;
    const dir = this.dir(projectId);
    if (existsSync(dir)) {
      for (const f of ['owner.json']) {
        const file = join(dir, f);
        if (existsSync(file)) writeFileSync(file, '[]');
      }
    }
  }
}

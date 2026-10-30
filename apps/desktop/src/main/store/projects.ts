// The file-based project store (SPEC-phase2 §4.1): userData/projects/<id>/project.json, plus
// userData/projects/index.json for the order and the last open project. It replaces the Phase 1
// localStorage persistence; the renderer imports any localStorage projects once.
import { IPC, type Project } from '@fitts/schema';
import { ipcMain } from 'electron';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SAFE_ID } from './run-log';

interface Index {
  order: string[];
  lastOpenId: string | null;
  version: number;
}

/** The zustand `persist` blob the renderer's project store reads and writes. */
interface Blob {
  state: { projects: Project[]; lastOpenId: string | null };
  version: number;
}

export class ProjectStore {
  private readonly dir: string;

  constructor(root: string) {
    this.dir = join(root, 'projects');
  }

  private indexFile() {
    return join(this.dir, 'index.json');
  }

  /** One project by id (the site manager needs its folder and dev command). */
  get(id: string): Project | undefined {
    if (!SAFE_ID.test(id)) return undefined;
    const file = join(this.dir, id, 'project.json');
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Project) : undefined;
  }

  /** The blob for the renderer, or null before anything was saved. */
  load(): string | null {
    if (!existsSync(this.indexFile())) return null;
    const index = JSON.parse(readFileSync(this.indexFile(), 'utf8')) as Index;
    const projects: Project[] = [];
    for (const id of index.order) {
      const file = join(this.dir, id, 'project.json');
      if (SAFE_ID.test(id) && existsSync(file)) {
        projects.push(JSON.parse(readFileSync(file, 'utf8')) as Project);
      }
    }
    const blob: Blob = {
      state: { projects, lastOpenId: index.lastOpenId },
      version: index.version,
    };
    return JSON.stringify(blob);
  }

  save(raw: string): void {
    const blob = JSON.parse(raw) as Blob;
    const projects = blob.state.projects.filter((p) => SAFE_ID.test(p.id));
    mkdirSync(this.dir, { recursive: true });
    const before = existsSync(this.indexFile())
      ? (JSON.parse(readFileSync(this.indexFile(), 'utf8')) as Index).order
      : [];
    for (const p of projects) {
      mkdirSync(join(this.dir, p.id), { recursive: true });
      writeFileSync(join(this.dir, p.id, 'project.json'), JSON.stringify(p, null, 2));
    }
    // Removing a project deletes only Fitts's data about it, never the user's folder.
    const kept = new Set(projects.map((p) => p.id));
    for (const id of before) {
      if (!kept.has(id) && SAFE_ID.test(id))
        rmSync(join(this.dir, id), { recursive: true, force: true });
    }
    const index: Index = {
      order: projects.map((p) => p.id),
      lastOpenId: blob.state.lastOpenId,
      version: blob.version ?? 0,
    };
    writeFileSync(this.indexFile(), JSON.stringify(index, null, 2));
  }

  register(): void {
    ipcMain.on(IPC.projectsLoad, (e) => {
      try {
        e.returnValue = this.load();
      } catch {
        e.returnValue = null;
      }
    });
    ipcMain.on(IPC.projectsSave, (_e, raw: unknown) => {
      if (typeof raw === 'string') this.save(raw);
    });
  }
}

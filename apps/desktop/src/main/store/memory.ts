// Project memory (SPEC-phase4 §4.3): what the owner has told Fitts about this project, kept in
// userData/projects/<id>/memory.json. Written here, read by the agent at run start, shown in
// Settings › Projects › "What Fitts remembers". Never written into the user's repo.
import { IPC, type ProjectMemory, type MemoryRule } from '@fitts/schema';
import { ipcMain } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SAFE_ID } from './run-log';

export const EMPTY_MEMORY: ProjectMemory = { rules: [], likes: [], dislikes: [] };
/** Rules kept per project: the newest wins when it's full. */
const MAX_RULES = 200;
const MAX_TASTES = 40;

export class MemoryStore {
  constructor(private readonly root: string) {}

  private file(projectId: string): string {
    return join(this.root, 'projects', projectId, 'memory.json');
  }

  get(projectId: string): ProjectMemory {
    if (!SAFE_ID.test(projectId)) return EMPTY_MEMORY;
    try {
      const file = this.file(projectId);
      if (!existsSync(file)) return EMPTY_MEMORY;
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<ProjectMemory>;
      return {
        rules: Array.isArray(raw.rules) ? raw.rules : [],
        likes: Array.isArray(raw.likes) ? raw.likes : [],
        dislikes: Array.isArray(raw.dislikes) ? raw.dislikes : [],
      };
    } catch {
      return EMPTY_MEMORY;
    }
  }

  private save(projectId: string, memory: ProjectMemory): ProjectMemory {
    if (!SAFE_ID.test(projectId)) return memory;
    mkdirSync(join(this.root, 'projects', projectId), { recursive: true });
    writeFileSync(this.file(projectId), JSON.stringify(memory, null, 2));
    return memory;
  }

  /** A rule from a dismissal, an owner finding or a severity change; same id replaces. */
  addRule(projectId: string, rule: MemoryRule): ProjectMemory {
    const m = this.get(projectId);
    const rules = [...m.rules.filter((r) => r.id !== rule.id), rule].slice(-MAX_RULES);
    return this.save(projectId, { ...m, rules });
  }

  /** A like or dislike in the owner's words (a picked look, "nothing cutesy"). */
  addTaste(projectId: string, kind: 'likes' | 'dislikes', text: string): ProjectMemory {
    const m = this.get(projectId);
    const t = text.trim().slice(0, 200);
    if (!t || m[kind].includes(t)) return m;
    return this.save(projectId, { ...m, [kind]: [...m[kind], t].slice(-MAX_TASTES) });
  }

  deleteRule(projectId: string, ruleId: string): ProjectMemory {
    const m = this.get(projectId);
    return this.save(projectId, { ...m, rules: m.rules.filter((r) => r.id !== ruleId) });
  }

  clear(projectId: string): ProjectMemory {
    return this.save(projectId, { rules: [], likes: [], dislikes: [] });
  }

  /** Settings › Projects › "What Fitts remembers": list, delete one, clear all. */
  register(onChange: (projectId: string, memory: ProjectMemory) => void): void {
    ipcMain.handle(IPC.memoryGet, (_e, id: unknown) =>
      typeof id === 'string' ? this.get(id) : EMPTY_MEMORY,
    );
    ipcMain.handle(IPC.memoryDelete, (_e, id: unknown, ruleId: unknown) => {
      if (typeof id !== 'string' || typeof ruleId !== 'string') return EMPTY_MEMORY;
      const m = this.deleteRule(id, ruleId);
      onChange(id, m);
      return m;
    });
    ipcMain.handle(IPC.memoryClear, (_e, id: unknown) => {
      if (typeof id !== 'string') return EMPTY_MEMORY;
      const m = this.clear(id);
      onChange(id, m);
      return m;
    });
  }
}

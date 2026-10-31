import type { Brief, Project } from '@fitts/schema';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { bridge } from '../lib/bridge';
import { TEST_BUILD } from '../dev';
import { DEMO_PROJECTS } from '../mock/fixtures/projects';

/**
 * Where projects live (SPEC-phase2 §4.1): main's file store (userData/projects/) inside
 * Electron, localStorage elsewhere (unit tests). Projects Phase 1 kept in localStorage are
 * imported into the file store once.
 */
function projectStorage(): StateStorage {
  const store = bridge().store;
  if (!store) return localStorage;
  return {
    getItem: (name) => {
      const saved = store.loadProjects();
      if (saved !== null) return saved;
      const legacy = localStorage.getItem(name);
      if (legacy !== null) {
        store.saveProjects(legacy);
        localStorage.removeItem(name);
      }
      return legacy;
    },
    setItem: (_name, value) => store.saveProjects(value),
    removeItem: () => undefined,
  };
}

/**
 * The demo projects that dev builds before the test-build split saved into userData, by id and
 * their fixed creation time (so a real project that happens to be called "portfolio" stays).
 * Outside test builds they're dropped on load, and the app opens on Welcome again.
 */
const STALE_DEMOS: Record<string, string> = {
  'demo-chat': '2026-10-20T09:00:00.000Z',
  'hartwell-site': '2026-10-22T14:30:00.000Z',
  portfolio: '2026-10-27T18:00:00.000Z',
};
export const isStaleDemo = (p: Project) => STALE_DEMOS[p.id] === p.createdAt;

interface ProjectsState {
  projects: Project[];
  /** The project whose workspace opens on launch (SPEC §4). */
  lastOpenId: string | null;
  addProject: (project: Project) => void;
  removeProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  setBrief: (id: string, brief: Brief) => void;
  setLastOpen: (id: string | null) => void;
  /** The project's latest run id, kept so a new run after a restart takes the next number. */
  setLastRun: (id: string, runId: string) => void;
  /** Dev only: the three demo projects, as the Scenario panel uses them. */
  seedDemo: () => void;
  clear: () => void;
}

export const useProjects = create<ProjectsState>()(
  persist(
    (set) => ({
      projects: [],
      lastOpenId: null,
      addProject: (project) =>
        set((s) => ({
          projects: [...s.projects.filter((p) => p.id !== project.id), project],
        })),
      removeProject: (id) =>
        set((s) => {
          const projects = s.projects.filter((p) => p.id !== id);
          const lastOpenId = s.lastOpenId === id ? (projects[0]?.id ?? null) : s.lastOpenId;
          return { projects, lastOpenId };
        }),
      renameProject: (id, name) =>
        set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, name } : p)) })),
      setBrief: (id, brief) =>
        set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, brief } : p)) })),
      setLastOpen: (id) => set({ lastOpenId: id }),
      setLastRun: (id, runId) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id && p.lastRunId !== runId ? { ...p, lastRunId: runId } : p,
          ),
        })),
      seedDemo: () =>
        set((s) => ({
          projects: (TEST_BUILD ? DEMO_PROJECTS : []).map(
            (demo) => s.projects.find((p) => p.id === demo.id) ?? demo,
          ),
          lastOpenId: s.lastOpenId ?? (TEST_BUILD ? DEMO_PROJECTS[0]?.id : undefined) ?? null,
        })),
      clear: () => set({ projects: [], lastOpenId: null }),
    }),
    {
      name: 'fitts.projects',
      storage: createJSONStorage(projectStorage),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<ProjectsState>;
        if (TEST_BUILD) return { ...current, ...saved };
        const projects = (saved.projects ?? []).filter((p) => !isStaleDemo(p));
        const lastOpenId = projects.some((p) => p.id === saved.lastOpenId)
          ? (saved.lastOpenId ?? null)
          : null;
        return { ...current, ...saved, projects, lastOpenId };
      },
    },
  ),
);

export const useProject = (id: string | null) =>
  useProjects((s) => s.projects.find((p) => p.id === id));

/** A live-site project: Fitts audits it but can't change its code (SPEC §6.11). */
export const useAuditOnly = (id: string | null) =>
  useProjects((s) => s.projects.find((p) => p.id === id)?.kind === 'live');

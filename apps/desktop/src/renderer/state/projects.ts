import type { Brief, Project } from '@fitts/schema';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { bridge } from '../lib/bridge';
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

interface ProjectsState {
  projects: Project[];
  /** The project whose workspace opens on launch (SPEC §4). */
  lastOpenId: string | null;
  addProject: (project: Project) => void;
  removeProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  setBrief: (id: string, brief: Brief) => void;
  setLastOpen: (id: string | null) => void;
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
      seedDemo: () =>
        set((s) => ({
          projects: DEMO_PROJECTS.map((demo) => s.projects.find((p) => p.id === demo.id) ?? demo),
          lastOpenId: s.lastOpenId ?? DEMO_PROJECTS[0]?.id ?? null,
        })),
      clear: () => set({ projects: [], lastOpenId: null }),
    }),
    { name: 'fitts.projects', storage: createJSONStorage(projectStorage) },
  ),
);

export const useProject = (id: string | null) =>
  useProjects((s) => s.projects.find((p) => p.id === id));

/** A live-site project: Fitts audits it but can't change its code (SPEC §6.11). */
export const useAuditOnly = (id: string | null) =>
  useProjects((s) => s.projects.find((p) => p.id === id)?.kind === 'live');

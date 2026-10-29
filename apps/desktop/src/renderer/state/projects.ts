import type { Brief, Project } from '@fitts/schema';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEMO_PROJECTS } from '../mock/fixtures/projects';

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
    { name: 'fitts.projects', storage: createJSONStorage(() => localStorage) },
  ),
);

export const useProject = (id: string | null) =>
  useProjects((s) => s.projects.find((p) => p.id === id));

import type { RunState } from '@fitts/schema';
import { create } from 'zustand';
import { DEMO_CHAT } from '../mock/fixtures/projects';
import { getMockEngine } from './engine';
import { useProjects } from './projects';

interface RunStore {
  /** Latest state of every run, by project id. Components read runs only from here. */
  runs: Record<string, RunState>;
  activeProjectId: string;
  /** The Scenario panel entry last loaded (dev only). */
  scenarioId: string | null;
  setActiveProject: (projectId: string) => void;
}

export const useRunStore = create<RunStore>((set) => ({
  runs: {},
  activeProjectId: useProjects.getState().lastOpenId ?? DEMO_CHAT,
  scenarioId: null,
  setActiveProject: (projectId) => set({ activeProjectId: projectId }),
}));

// Mirror every engine update into the store, and keep each project's brief in step with
// what its run learned (the interview and the Brief popover write to the run).
getMockEngine().subscribeAll((projectId, state) => {
  const previous = useRunStore.getState().runs[projectId];
  useRunStore.setState((s) => ({ runs: { ...s.runs, [projectId]: state } }));
  if (
    previous?.brief !== state.brief &&
    JSON.stringify(previous?.brief) !== JSON.stringify(state.brief)
  ) {
    useProjects.getState().setBrief(projectId, state.brief);
  }
});

/** Dev only: forget every run (the Scenario panel does this before loading one). */
export function clearRuns() {
  useRunStore.setState({ runs: {} });
}

export const useRun = (projectId: string): RunState | undefined =>
  useRunStore((s) => s.runs[projectId]);

export const useActiveRun = (): RunState | undefined =>
  useRunStore((s) => s.runs[s.activeProjectId]);

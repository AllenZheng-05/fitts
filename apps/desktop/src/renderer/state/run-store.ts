import type { RunState } from '@fitts/schema';
import { create } from 'zustand';
import { DEMO_CHAT } from '../mock/fixtures/projects';
import { scenarioById } from '../mock/scenarios';
import { getMockEngine } from './engine';

interface RunStore {
  /** Latest state of every run, by project id. Components read runs only from here. */
  runs: Record<string, RunState>;
  activeProjectId: string;
  /** The Scenario panel entry last loaded (dev only). */
  scenarioId: string | null;
  setActiveProject: (projectId: string) => void;
  /** Dev only: resets the engine and plays a Scenario panel entry. */
  loadScenario: (scenarioId: string) => void;
}

export const useRunStore = create<RunStore>((set) => ({
  runs: {},
  activeProjectId: DEMO_CHAT,
  scenarioId: null,
  setActiveProject: (projectId) => set({ activeProjectId: projectId }),
  loadScenario: (scenarioId) => {
    const entry = scenarioById(scenarioId);
    if (!entry) return;
    set({ runs: {}, scenarioId, activeProjectId: entry.projectId });
    entry.setup(getMockEngine());
  },
}));

// Mirror every engine update into the store.
getMockEngine().subscribeAll((projectId, state) => {
  useRunStore.setState((s) => ({ runs: { ...s.runs, [projectId]: state } }));
});

export const useRun = (projectId: string): RunState | undefined =>
  useRunStore((s) => s.runs[projectId]);

export const useActiveRun = (): RunState | undefined =>
  useRunStore((s) => s.runs[s.activeProjectId]);

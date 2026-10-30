import type { RunState } from '@fitts/schema';
import { create } from 'zustand';
import { DEV } from '../dev';
import { DEMO_CHAT } from '../mock/fixtures/projects';
import {
  getEngine,
  getEngineKind,
  getIpcEngine,
  getMockEngine,
  getReplayEngine,
  onEngineKindChange,
  type EngineKind,
} from './engine';
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
  activeProjectId: useProjects.getState().lastOpenId ?? (DEV ? DEMO_CHAT : ''),
  scenarioId: null,
  setActiveProject: (projectId) => set({ activeProjectId: projectId }),
}));

// Mirror every update from the active engine into the store, and keep each project's brief in
// step with what its run learned (the interview and the Brief popover write to the run).
const mirror = (source: EngineKind) => (projectId: string, state: RunState) => {
  if (source !== getEngineKind()) return;
  const previous = useRunStore.getState().runs[projectId];
  useRunStore.setState((s) => ({ runs: { ...s.runs, [projectId]: state } }));
  if (
    previous?.brief !== state.brief &&
    JSON.stringify(previous?.brief) !== JSON.stringify(state.brief)
  ) {
    useProjects.getState().setBrief(projectId, state.brief);
  }
};
if (DEV) getMockEngine().subscribeAll(mirror('mock'));
getIpcEngine()?.subscribeAll(mirror('ipc'));
getReplayEngine().subscribeAll(mirror('replay'));
// Switching engines (into or out of a replay): show what the new engine knows right away.
onEngineKindChange(() => {
  const engine = getEngine();
  const runs: Record<string, RunState> = {};
  for (const p of useProjects.getState().projects) {
    const s = engine.getState(p.id);
    if (s) runs[p.id] = s;
  }
  useRunStore.setState({ runs });
});

/** Dev only: forget every run (the Scenario panel does this before loading one). */
export function clearRuns() {
  useRunStore.setState({ runs: {} });
}

export const useRun = (projectId: string): RunState | undefined =>
  useRunStore((s) => s.runs[projectId]);

export const useActiveRun = (): RunState | undefined =>
  useRunStore((s) => s.runs[s.activeProjectId]);

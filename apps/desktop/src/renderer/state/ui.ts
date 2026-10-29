import { create } from 'zustand';
import { getEngine } from './engine';
import { useProjects } from './projects';
import { useRunStore } from './run-store';
import { useSettings } from './settings';

export type Screen = 'welcome' | 'workspace' | 'settings';
export type SettingsTab = 'run' | 'voice' | 'keys' | 'projects';

interface UiState {
  screen: Screen;
  settingsTab: SettingsTab;
  /** Where "Back" in Settings goes. */
  settingsReturnTo: 'welcome' | 'workspace';
  projectMenuOpen: boolean;
  addProjectOpen: boolean;
  briefOpen: boolean;
  /** The finding open in the Finding panel (M6). */
  openFindingId: string | null;
  /** "Pause hartwell-site's run to start this one?" (SPEC §6.9). */
  pauseConfirm: { runningProjectId: string; projectId: string } | null;

  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  /** Shows a project's workspace; starts its interview if it has no run yet. */
  openProject: (projectId: string) => void;
  goWelcome: () => void;
  set: (
    patch: Partial<
      Pick<
        UiState,
        'projectMenuOpen' | 'addProjectOpen' | 'briefOpen' | 'openFindingId' | 'pauseConfirm'
      >
    >,
  ) => void;
}

/** First launch, or no projects: Welcome. Otherwise the last opened project (SPEC §4). */
function initialScreen(): Screen {
  const { projects, lastOpenId } = useProjects.getState();
  return projects.length > 0 && lastOpenId ? 'workspace' : 'welcome';
}

export const useUi = create<UiState>((set, get) => ({
  screen: initialScreen(),
  settingsTab: 'run',
  settingsReturnTo: 'workspace',
  projectMenuOpen: false,
  addProjectOpen: false,
  briefOpen: false,
  openFindingId: null,
  pauseConfirm: null,

  openSettings: (tab) =>
    set((s) => ({
      screen: 'settings',
      settingsTab: tab ?? s.settingsTab,
      settingsReturnTo:
        s.screen === 'welcome'
          ? 'welcome'
          : s.screen === 'settings'
            ? s.settingsReturnTo
            : 'workspace',
      projectMenuOpen: false,
      briefOpen: false,
    })),
  closeSettings: () => {
    const { settingsReturnTo } = get();
    const hasProject = Boolean(useProjects.getState().lastOpenId);
    set({ screen: settingsReturnTo === 'workspace' && hasProject ? 'workspace' : 'welcome' });
  },
  openProject: (projectId) => {
    useProjects.getState().setLastOpen(projectId);
    useRunStore.getState().setActiveProject(projectId);
    const engine = getEngine();
    if (!engine.getState(projectId)) {
      engine.startInterview(projectId);
      engine.setMode(projectId, useSettings.getState().defaultMode);
    }
    set({
      screen: 'workspace',
      projectMenuOpen: false,
      addProjectOpen: false,
      openFindingId: null,
    });
  },
  goWelcome: () => set({ screen: 'welcome', projectMenuOpen: false, addProjectOpen: false }),
  set: (patch) => set(patch),
}));

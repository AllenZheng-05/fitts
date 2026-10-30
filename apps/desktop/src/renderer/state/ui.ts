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
  /** Which tab Add a project opens on ("Audit a live site instead" opens it on Live). */
  addProjectKind: 'code' | 'live';
  briefOpen: boolean;
  /** The finding open in the Finding panel (M6). */
  openFindingId: string | null;
  /**
   * "Review each" on a batch of fixes: your call on each fix so far. The batch is answered
   * once every fix in it has one.
   */
  review: BatchReview | null;
  /** "Pause hartwell-site's run to start this one?" (SPEC §6.9). */
  pauseConfirm: { runningProjectId: string; projectId: string } | null;
  /** "Point at something" is waiting for a click in the site view (§7.4). */
  pointing: boolean;
  /** The message box's text, so "Change the fix" can prefill it (§6.5). */
  draft: string;
  /** The "pointing at #id" chip attached to the message box (§7.4). */
  draftPointingAt: string | null;
  /** Hold-to-talk is held: "Listening…" (§7.5). */
  micListening: boolean;
  /** What Transcribe has heard so far, shown in the message box (SPEC-phase2 §14). */
  micPartial: string;
  /** Site-view toggles during the audit (§6.4). */
  highlightsOn: boolean;
  beforeAfter: boolean;
  /** Redesign view (§6.7): before/after is on by default; "Every page" lists them all. */
  redesignCompare: boolean;
  everyPage: boolean;
  /** A site map row narrowing the findings tray to one page and the pages under it. */
  findingsRoute: string | null;
  /** Findings tray filter (§6.4). */
  findingsFilter: 'all' | 'usability' | 'accessibility' | 'performance' | 'look-and-feel';

  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  /** Shows a project's workspace; starts its interview if it has no run yet. */
  openProject: (projectId: string) => void;
  goWelcome: () => void;
  set: (patch: Partial<UiFields>) => void;
}

export interface BatchReview {
  /** The `approval.batch` chat item being reviewed. */
  itemId: string;
  decisions: Record<string, 'fix' | 'skip'>;
}

type UiFields = Omit<
  UiState,
  | 'openSettings'
  | 'closeSettings'
  | 'openProject'
  | 'goWelcome'
  | 'set'
  | 'screen'
  | 'settingsTab'
  | 'settingsReturnTo'
>;

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
  addProjectKind: 'code',
  briefOpen: false,
  openFindingId: null,
  review: null,
  pauseConfirm: null,
  pointing: false,
  draft: '',
  draftPointingAt: null,
  micListening: false,
  micPartial: '',
  highlightsOn: true,
  beforeAfter: false,
  redesignCompare: true,
  everyPage: false,
  findingsFilter: 'all',
  findingsRoute: null,

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
      review: null,
      findingsRoute: null,
    });
  },
  goWelcome: () => set({ screen: 'welcome', projectMenuOpen: false, addProjectOpen: false }),
  set: (patch) => set(patch),
}));

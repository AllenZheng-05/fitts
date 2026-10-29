// Dev only: plays a Scenario panel entry and puts the app on its screen (SPEC §9.6).
import { scenarioById } from '../mock/scenarios';
import { getMockEngine } from './engine';
import { useProjects } from './projects';
import { clearRuns, useRunStore } from './run-store';
import { useUi } from './ui';

export function loadScenario(scenarioId: string): void {
  const entry = scenarioById(scenarioId);
  if (!entry) return;
  const projects = useProjects.getState();
  clearRuns();
  if (entry.screen === 'welcome') projects.clear();
  else projects.seedDemo();
  useRunStore.setState({ scenarioId, activeProjectId: entry.projectId });
  if (entry.screen !== 'welcome') projects.setLastOpen(entry.projectId);
  entry.setup(getMockEngine());

  const ui = useUi.getState();
  ui.set({ projectMenuOpen: false, addProjectOpen: false, briefOpen: false, openFindingId: null });
  switch (entry.screen) {
    case 'welcome':
    case 'welcome-back':
      ui.goWelcome();
      return;
    case 'settings':
      useUi.setState({ screen: 'workspace' });
      ui.openSettings('run');
      return;
    default:
      useUi.setState({ screen: 'workspace' });
      if (entry.screen === 'project-menu') ui.set({ projectMenuOpen: true });
      if (entry.screen === 'add-project') ui.set({ addProjectOpen: true });
      if (entry.screen === 'brief') ui.set({ briefOpen: true });
      if (entry.screen === 'finding') ui.set({ openFindingId: entry.findingId ?? null });
  }
}

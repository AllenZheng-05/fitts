// The Scenario panel's list (SPEC §9.6): every screen and edge state, each with a setup
// that puts the mock engine into that state.
import type { EdgeStateKind, Mode } from '@fitts/schema';
import type { MockRunEngine } from '../../state/mock-engine';
import { useSettings } from '../../state/settings';
import { LIVE_FINDINGS } from '../fixtures/demo-chat';
import { DEMO_CHAT, HARTWELL, PORTFOLIO } from '../fixtures/projects';
import { demoChatAudit } from './demo-chat';
import { hartwellAudit } from './hartwell';

/** The screen the app should show for a scenario. Screens arrive in later milestones. */
export type ScenarioScreen =
  | 'welcome'
  | 'welcome-back'
  | 'workspace'
  | 'settings'
  | 'project-menu'
  | 'add-project'
  | 'brief'
  | 'finding';

export interface ScenarioEntry {
  id: string;
  label: string;
  group: 'Screens' | 'Runs' | 'Edge states';
  projectId: string;
  screen: ScenarioScreen;
  /** The milestone that builds this entry's screen; the entry is disabled until then. */
  arrives?: 'M3' | 'M4' | 'M5' | 'M6' | 'M7';
  /** For `finding`: which finding the Finding panel opens on. */
  findingId?: string;
  setup: (engine: MockRunEngine) => void;
}

const beatIndex = (beats: { id: string }[], id: string) => {
  const i = beats.findIndex((b) => b.id === id);
  if (i < 0) throw new Error(`No beat "${id}"`);
  return i;
};

/** demo/chat audit in `mode`, played up to beat `beatId`. */
function demoAt(engine: MockRunEngine, beatId: string, mode: Mode = 'ask-unsure') {
  engine.reset();
  engine.loadAudit(DEMO_CHAT, mode);
  engine.jumpToBeat(DEMO_CHAT, beatIndex(demoChatAudit.beats, beatId));
}

function edge(
  id: string,
  label: string,
  kind: EdgeStateKind,
  beatId = 'first-findings',
): ScenarioEntry {
  return {
    id,
    label,
    group: 'Edge states',
    projectId: DEMO_CHAT,
    screen: 'workspace',
    arrives: 'M6',
    setup: (engine) => {
      demoAt(engine, beatId);
      engine.showEdgeState(DEMO_CHAT, kind);
    },
  };
}

export const SCENARIOS: ScenarioEntry[] = [
  {
    id: 'welcome',
    label: 'Welcome (first launch)',
    group: 'Screens',
    projectId: DEMO_CHAT,
    screen: 'welcome',
    arrives: 'M3',
    setup: (engine) => engine.reset(),
  },
  {
    id: 'welcome-back',
    label: 'Welcome back',
    group: 'Screens',
    projectId: DEMO_CHAT,
    screen: 'welcome-back',
    arrives: 'M3',
    setup: (engine) => engine.reset(),
  },
  {
    id: 'interview',
    label: 'Interview',
    group: 'Runs',
    projectId: DEMO_CHAT,
    screen: 'workspace',
    setup: (engine) => {
      engine.reset();
      engine.startInterview(DEMO_CHAT);
    },
  },
  {
    id: 'audit-ask',
    label: 'Audit (Ask)',
    group: 'Runs',
    projectId: DEMO_CHAT,
    screen: 'workspace',
    setup: (engine) => demoAt(engine, 'first-findings'),
  },
  {
    id: 'audit-auto',
    label: 'Audit (Autonomous)',
    group: 'Runs',
    projectId: DEMO_CHAT,
    screen: 'workspace',
    setup: (engine) => demoAt(engine, 'first-findings', 'autonomous'),
  },
  {
    id: 'finding-ask',
    label: 'Finding panel (Ask)',
    group: 'Screens',
    projectId: DEMO_CHAT,
    screen: 'finding',
    arrives: 'M6',
    findingId: LIVE_FINDINGS.names.id,
    setup: (engine) => demoAt(engine, 'first-findings'),
  },
  {
    id: 'finding-auto',
    label: 'Finding panel (Autonomous)',
    group: 'Screens',
    projectId: DEMO_CHAT,
    screen: 'finding',
    arrives: 'M6',
    findingId: LIVE_FINDINGS.names.id,
    setup: (engine) => demoAt(engine, 'rolled-back', 'autonomous'),
  },
  {
    id: 'gate',
    label: 'Gate',
    group: 'Runs',
    projectId: DEMO_CHAT,
    screen: 'workspace',
    setup: (engine) => demoAt(engine, 'gate'),
  },
  {
    id: 'redesign',
    label: 'Redesign',
    group: 'Runs',
    projectId: HARTWELL,
    screen: 'workspace',
    setup: (engine) => {
      engine.reset();
      engine.loadAudit(HARTWELL, 'autonomous');
      engine.jumpToBeat(HARTWELL, beatIndex(hartwellAudit.beats, 'directions'));
    },
  },
  {
    id: 'done',
    label: 'Done',
    group: 'Runs',
    projectId: DEMO_CHAT,
    screen: 'workspace',
    setup: (engine) => demoAt(engine, 'done'),
  },
  {
    id: 'settings',
    label: 'Settings',
    group: 'Screens',
    projectId: DEMO_CHAT,
    screen: 'settings',
    arrives: 'M3',
    setup: (engine) => demoAt(engine, 'first-findings'),
  },
  {
    id: 'project-menu',
    label: 'Project menu',
    group: 'Screens',
    projectId: DEMO_CHAT,
    screen: 'project-menu',
    arrives: 'M3',
    // Projects.html: demo/chat finished, hartwell-site running in the background.
    setup: (engine) => {
      demoAt(engine, 'done');
      engine.loadAudit(HARTWELL, 'autonomous');
    },
  },
  {
    id: 'add-project',
    label: 'Add project',
    group: 'Screens',
    projectId: DEMO_CHAT,
    screen: 'add-project',
    arrives: 'M3',
    setup: (engine) => demoAt(engine, 'first-findings'),
  },
  {
    id: 'brief',
    label: 'Brief',
    group: 'Screens',
    projectId: DEMO_CHAT,
    screen: 'brief',
    arrives: 'M4',
    setup: (engine) => {
      engine.reset();
      engine.startInterview(DEMO_CHAT);
    },
  },
  edge('stop-run-confirm', 'Stop run confirm', 'stop-run-confirm'),
  edge('stopped', 'Stopped one action', 'stopped'),
  {
    id: 'driving',
    label: "You're driving",
    group: 'Edge states',
    projectId: DEMO_CHAT,
    screen: 'workspace',
    arrives: 'M5',
    setup: (engine) => {
      demoAt(engine, 'first-findings');
      engine.takeWheel(DEMO_CHAT);
    },
  },
  edge('uncommitted', 'Uncommitted changes', 'uncommitted', 'seed'),
  edge('login-wall', 'Login wall', 'login-wall', 'finding-target'),
  {
    id: 'batch-approval',
    label: 'Batch approval',
    group: 'Edge states',
    projectId: DEMO_CHAT,
    screen: 'workspace',
    arrives: 'M6',
    setup: (engine) => demoAt(engine, 'approval'),
  },
  edge('site-down', 'Site down', 'site-down', 'finding-search'),
  edge('budget-warning', 'Budget warning', 'budget-warning', 'finding-target'),
  edge('budget', 'Budget reached', 'budget', 'finding-target'),
  edge('api-trouble', 'API trouble', 'api-trouble'),
  edge('reopen', 'Reopen after crash', 'reopen', 'finding-confirm'),
  {
    id: 'background-needs-you',
    label: 'Background project needs you',
    group: 'Edge states',
    projectId: DEMO_CHAT,
    screen: 'workspace',
    arrives: 'M6',
    setup: (engine) => {
      useSettings.getState().set({ notificationsAllowed: true });
      demoAt(engine, 'first-findings');
      engine.loadAudit(HARTWELL, 'ask-unsure');
      engine.askOn(
        HARTWELL,
        'Can I submit the contact form with test data?',
        ['Yes, use test data', 'No, skip the form'],
        true,
      );
    },
  },
  {
    id: 'nothing-found',
    label: 'Nothing found',
    group: 'Edge states',
    projectId: PORTFOLIO,
    screen: 'workspace',
    arrives: 'M6',
    setup: (engine) => {
      engine.reset();
      engine.loadAudit(PORTFOLIO, 'ask-unsure');
      engine.showEdgeState(PORTFOLIO, 'nothing-found');
    },
  },
  {
    id: 'returning-user',
    label: 'Returning-user home',
    group: 'Edge states',
    projectId: DEMO_CHAT,
    screen: 'welcome-back',
    arrives: 'M3',
    setup: (engine) => {
      engine.reset();
      demoAt(engine, 'done');
    },
  },
];

export const scenarioById = (id: string) => SCENARIOS.find((s) => s.id === id);

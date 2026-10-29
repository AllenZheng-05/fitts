// Which script and fixtures the MockRunEngine plays for each project.
import type { Scenario, MockProfile } from '../state/script';
import { LIVE_FIXES } from './fixtures/demo-chat';
import { DEMO_CHAT, HARTWELL, MOCK_USER } from './fixtures/projects';
import { demoChatAudit } from './scenarios/demo-chat';
import { hartwellAudit } from './scenarios/hartwell';
import { demoChatInterview, genericInterview } from './scenarios/interview';

const CHECKS = [
  'Nielsen heuristics H1–H10 on every page',
  'Keyboard-only pass through each flow',
  'Color contrast on all text',
  'Tap targets at phone width',
  'Bad input on every form',
  'Back button mid-flow',
  'Load time and layout shift',
  'Look and feel against your brief',
];

/** A short run for projects without a scripted scenario. */
const genericAudit: Scenario = {
  id: 'generic',
  label: 'Generic audit',
  beats: [
    {
      id: 'seed',
      atMs: 0,
      label: '0s · Looking around',
      apply: (s, ctx) => {
        s.routes = [{ path: '/', depth: 0, status: 'testing', issues: 0 }];
        s.nowText = 'Opening the home page';
        ctx.say('Looking around your site now.');
      },
    },
    {
      id: 'done',
      atMs: 8000,
      label: '8s · Done',
      apply: (s, ctx) => {
        for (const r of s.routes) r.status = 'done';
        ctx.finish();
        ctx.say("All done. I didn't find anything worth changing this time.");
      },
    },
  ],
};

const PROFILES: Record<string, Omit<MockProfile, 'projectId'>> = {
  [DEMO_CHAT]: {
    name: 'demo/chat',
    userFirstName: MOCK_USER.firstName,
    runNumber: 7,
    screen: 'compose',
    defaultMode: 'ask-unsure',
    interview: demoChatInterview,
    audit: demoChatAudit,
    checks: CHECKS,
    fixes: LIVE_FIXES,
  },
  [HARTWELL]: {
    name: 'hartwell-site',
    userFirstName: MOCK_USER.firstName,
    runNumber: 3,
    screen: 'home',
    defaultMode: 'autonomous',
    interview: genericInterview,
    audit: hartwellAudit,
    checks: CHECKS,
    fixes: {},
  },
};

export function profileFor(projectId: string): MockProfile {
  const known = PROFILES[projectId];
  if (known) return { projectId, ...known };
  return {
    projectId,
    name: projectId,
    userFirstName: MOCK_USER.firstName,
    runNumber: 1,
    screen: 'home',
    defaultMode: 'ask-unsure',
    interview: genericInterview,
    audit: genericAudit,
    checks: CHECKS,
    fixes: {},
  };
}

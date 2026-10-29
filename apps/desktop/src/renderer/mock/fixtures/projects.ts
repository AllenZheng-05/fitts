import type { Project } from '@fitts/schema';

/** The signed-in user shown in mock git/GitHub status (SPEC §6.1). */
export const MOCK_USER = { firstName: 'Allen', github: 'AllenZheng-05' } as const;

export const DEMO_CHAT = 'demo-chat';
export const HARTWELL = 'hartwell-site';
export const PORTFOLIO = 'portfolio';

export const DEMO_PROJECTS: Project[] = [
  {
    id: DEMO_CHAT,
    name: 'demo/chat',
    kind: 'local',
    folder: '~/code/fitts/demo/chat',
    url: 'localhost:5173',
    framework: 'Vite + React 19',
    devCommand: 'pnpm dev',
    repo: 'AllenZheng-05/demo-chat',
    brief: {},
    lastRunId: 'run-7',
    createdAt: '2026-10-20T09:00:00.000Z',
  },
  {
    id: HARTWELL,
    name: 'hartwell-site',
    kind: 'local',
    folder: '~/code/hartwell-site',
    url: 'localhost:4321',
    framework: 'Astro 5',
    devCommand: 'npm run dev',
    repo: 'hartwell-funeral/site',
    brief: {
      for: 'A family funeral home',
      who: 'Families who just lost someone',
      feel: 'Quiet and dignified',
    },
    lastRunId: 'run-3',
    createdAt: '2026-10-22T14:30:00.000Z',
  },
  {
    id: PORTFOLIO,
    name: 'portfolio',
    kind: 'local',
    folder: '~/code/portfolio',
    url: 'localhost:3000',
    framework: 'Next.js 16',
    devCommand: 'pnpm dev',
    brief: {},
    createdAt: '2026-10-27T18:00:00.000Z',
  },
];

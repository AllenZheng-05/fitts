// Mock project detection (SPEC §6.1, §6.11): what Fitts would find in a folder or URL.
import type { Detection, Project } from '@fitts/schema';
import { DEMO_CHAT, DEMO_PROJECTS, HARTWELL, MOCK_USER } from './fixtures/projects';

// The result shape is shared with main's real detection (SPEC-phase2 §4.1).
export type { Detection } from '@fitts/schema';

const forwardSlashes = (path: string) => path.replaceAll('\\', '/').replace(/\/+$/, '');

const normalize = (path: string) => forwardSlashes(path).toLowerCase();

const basename = (path: string) => forwardSlashes(path).split('/').pop() ?? path;

export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';

export function detectFolder(folder: string): Detection | null {
  const path = normalize(folder.trim());
  if (!path) return null;
  const demo = (id: string) => DEMO_PROJECTS.find((p) => p.id === id);
  if (path.endsWith('demo/chat') || path.endsWith('demo-chat')) {
    const p = demo(DEMO_CHAT);
    return {
      id: DEMO_CHAT,
      name: p?.name ?? 'demo/chat',
      framework: 'Vite + React 19',
      devCommand: 'pnpm dev',
      url: 'localhost:5173',
      repo: p?.repo,
      hasPlugin: true,
    };
  }
  if (path.includes('hartwell')) {
    return {
      id: HARTWELL,
      name: 'hartwell-site',
      framework: 'Astro 5',
      devCommand: 'npm run dev',
      url: 'localhost:3000',
      repo: 'hartwell-funeral/site',
      hasPlugin: true,
    };
  }
  const name = basename(folder.trim());
  if (path.endsWith('portfolio')) {
    return {
      id: slug(name),
      name,
      framework: 'Next.js 15',
      devCommand: 'npm run dev',
      url: 'localhost:3001',
      repo: `${MOCK_USER.github}/portfolio`,
      hasPlugin: false,
    };
  }
  return {
    id: slug(name),
    name,
    framework: 'Vite + React',
    devCommand: 'npm run dev',
    url: 'localhost:5173',
    hasPlugin: false,
  };
}

export function projectFromFolder(folder: string, name: string, detection: Detection): Project {
  return {
    id: detection.id,
    name: name.trim() || detection.name,
    kind: 'local',
    folder,
    url: detection.url,
    framework: detection.framework,
    devCommand: detection.devCommand,
    ...(detection.repo ? { repo: detection.repo } : {}),
    ...(detection.startPath ? { startPath: detection.startPath } : {}),
    brief: {},
    createdAt: new Date().toISOString(),
  };
}

export function projectFromUrl(url: string, name: string): Project {
  const host = url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return {
    id: slug(name || host),
    name: name.trim() || host,
    kind: 'live',
    url: host,
    brief: {},
    createdAt: new Date().toISOString(),
  };
}

/** The token a live site serves at /.well-known/fitts-verify.txt to prove ownership. */
export const VERIFY_TOKEN = 'fitts-verify=7Q2K9XAD4M';
/** "Check now" succeeds after this long (§6.11). */
export const VERIFY_MS = 1000;
/** The Welcome key check runs this long after typing stops (§6.1). */
export const KEY_CHECK_MS = 600;
export const isKeyValid = (key: string) => key.trim().length >= 8;

// Mock project detection (SPEC §6.1, §6.11): what Fitts would find in a folder or URL.
import type { Detection } from '@fitts/schema';
import { slug } from '../lib/new-project';
import { DEMO_CHAT, DEMO_PROJECTS, HARTWELL, MOCK_USER } from './fixtures/projects';

// The result shape is shared with main's real detection (SPEC-phase2 §4.1).
export type { Detection } from '@fitts/schema';
// The real helpers moved to lib/new-project; tests still import them from here.
export {
  isKeyValid,
  KEY_CHECK_MS,
  projectFromFolder,
  projectFromUrl,
  slug,
  VERIFY_MS,
  VERIFY_TOKEN,
} from '../lib/new-project';

const forwardSlashes = (path: string) => path.replaceAll('\\', '/').replace(/\/+$/, '');

const normalize = (path: string) => forwardSlashes(path).toLowerCase();

const basename = (path: string) => forwardSlashes(path).split('/').pop() ?? path;

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

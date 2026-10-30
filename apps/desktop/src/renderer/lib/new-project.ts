// Turning a detected folder or a URL into a project, and the Welcome key check's timing.
import type { Detection, Project } from '@fitts/schema';

export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';

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

/** The Welcome key check runs this long after typing stops (§6.1). */
export const KEY_CHECK_MS = 600;
/** Without main (tests in a browser), a key "works" when it's long enough. */
export const isKeyValid = (key: string) => key.trim().length >= 8;

/** Phase 1's fixed token, used when there's no main to check a site (the mock dialog). */
export const VERIFY_TOKEN = 'fitts-verify=7Q2K9XAD4M';
/** The mock's "Check now" succeeds after this long (§6.11). */
export const VERIFY_MS = 1000;

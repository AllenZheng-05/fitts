// Versions of the user's site beside the live one (the Before/After switch, a fix's live
// preview): main serves each from a worktree under its own site id, and the site view shows it
// like any live site. A version opens when a view needs it and closes when the view goes.
import { versionSiteId, type RunState, type SiteVersion } from '@fitts/schema';
import { useEffect } from 'react';
import { bridge } from '../lib/bridge';
import { getEngineKind } from './engine';

/** Opens `version` under `${projectId}.v.${name}` while mounted; null closes it. */
export function useSiteVersion(
  projectId: string,
  runId: string,
  name: string,
  version: SiteVersion | null,
): string {
  const siteId = versionSiteId(projectId, name);
  const key = version ? JSON.stringify(version) : '';
  useEffect(() => {
    const site = bridge().site;
    if (!key || !site || getEngineKind() !== 'ipc') return;
    site.openVersion(siteId, projectId, runId, JSON.parse(key) as SiteVersion);
    return () => site.close(siteId);
  }, [siteId, projectId, runId, key]);
  return siteId;
}

/** The run's branch, once a verified change is on it (every fix lands on the same one). */
export function fixedBranch(run: RunState): string | undefined {
  return run.changes.find((c) => c.status === 'verified' && c.branch)?.branch;
}

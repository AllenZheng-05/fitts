// The live site's status per project, pushed by main (SPEC-phase2 §5). When a project's site is
// running, the site view shows its frames instead of the Phase 1 mock render.
import type { SiteStatus } from '@fitts/schema';
import { create } from 'zustand';
import { bridge } from '../lib/bridge';
import { getEngineKind } from './engine';

interface LiveSiteState {
  sites: Record<string, SiteStatus>;
}

export const useLiveSites = create<LiveSiteState>(() => ({ sites: {} }));

bridge().site?.onStatus((status) =>
  useLiveSites.setState((s) => ({ sites: { ...s.sites, [status.projectId]: status } })),
);

/** The project's live site, when it's running and the real engine is in use. */
export function useLiveSite(projectId: string): SiteStatus | undefined {
  const site = useLiveSites((s) => s.sites[projectId]);
  return site?.status === 'running' && getEngineKind() === 'ipc' ? site : undefined;
}

/** Starts the project's dev server and site window (no-op outside Electron or on the mock). */
export function openLiveSite(projectId: string): void {
  if (getEngineKind() === 'ipc') bridge().site?.open(projectId);
}

/** The path part of the live site's URL ("/compose"). */
export function livePath(site: SiteStatus | undefined): string | undefined {
  if (!site?.url) return undefined;
  try {
    const u = new URL(site.url);
    return u.pathname + u.search;
  } catch {
    return undefined;
  }
}

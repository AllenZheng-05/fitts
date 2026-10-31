import { create } from 'zustand';
import { TEST_BUILD } from '../dev';
import { startRoute as demoStartRoute } from '../mock/sites';

/** Where a project's site view starts: '/' (Phase 1's demos start deeper, dev builds only). */
const startRoute = (projectId: string) => (TEST_BUILD ? demoStartRoute(projectId) : '/');

interface SiteHistory {
  stack: string[];
  index: number;
  /** Bumped by Reload so the mock site remounts. */
  reloads: number;
}

interface SiteState {
  /** Browser history of the mock site, per project. View state, not run data. */
  sites: Record<string, SiteHistory>;
  navigate: (projectId: string, route: string) => void;
  back: (projectId: string) => void;
  forward: (projectId: string) => void;
  reload: (projectId: string) => void;
}

const fresh = (route: string): SiteHistory => ({ stack: [route], index: 0, reloads: 0 });

export const useSite = create<SiteState>((set) => ({
  sites: {},
  navigate: (projectId, route) =>
    set((s) => {
      const site = s.sites[projectId] ?? fresh(startRoute(projectId));
      if (site.stack[site.index] === route) return s;
      const stack = [...site.stack.slice(0, site.index + 1), route];
      return { sites: { ...s.sites, [projectId]: { ...site, stack, index: stack.length - 1 } } };
    }),
  back: (projectId) =>
    set((s) => {
      const site = s.sites[projectId];
      if (!site || site.index === 0) return s;
      return { sites: { ...s.sites, [projectId]: { ...site, index: site.index - 1 } } };
    }),
  forward: (projectId) =>
    set((s) => {
      const site = s.sites[projectId];
      if (!site || site.index >= site.stack.length - 1) return s;
      return { sites: { ...s.sites, [projectId]: { ...site, index: site.index + 1 } } };
    }),
  reload: (projectId) =>
    set((s) => {
      const site = s.sites[projectId] ?? fresh(startRoute(projectId));
      return { sites: { ...s.sites, [projectId]: { ...site, reloads: site.reloads + 1 } } };
    }),
}));

export function useSiteRoute(projectId: string) {
  const site = useSite((s) => s.sites[projectId]);
  return {
    route: site?.stack[site.index] ?? startRoute(projectId),
    canBack: Boolean(site && site.index > 0),
    canForward: Boolean(site && site.index < site.stack.length - 1),
    reloads: site?.reloads ?? 0,
  };
}

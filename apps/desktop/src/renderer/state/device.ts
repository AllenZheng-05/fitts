// Which device each project's site is seen on (SPEC-phase2 §5, device sizes), and how the
// canvas fits that device into the panel. "Fit" is a desktop browser the panel's size.
import { DEVICES, type SiteDevice } from '@fitts/schema';
import { create } from 'zustand';

export const FIT = 'fit';

/** Where the site's frame sits in the panel: site px × scale, plus the offset. */
export interface SiteView {
  scale: number;
  x: number;
  y: number;
}

const IDENTITY: SiteView = { scale: 1, x: 0, y: 0 };

interface DeviceState {
  byProject: Record<string, string>;
  views: Record<string, SiteView>;
  setDevice(projectId: string, id: string): void;
  setView(projectId: string, view: SiteView): void;
}

export const useDevice = create<DeviceState>((set) => ({
  byProject: {},
  views: {},
  setDevice: (projectId, id) => set((s) => ({ byProject: { ...s.byProject, [projectId]: id } })),
  setView: (projectId, view) => set((s) => ({ views: { ...s.views, [projectId]: view } })),
}));

export const deviceFor = (id: string | undefined): SiteDevice | null =>
  DEVICES.find((d) => d.id === id) ?? null;

/** The project's device, or null for "Fit". */
export const useProjectDevice = (projectId: string) =>
  useDevice((s) => deviceFor(s.byProject[projectId]));

/** The current frame placement, read outside React (overlays, input). */
export const siteView = (projectId: string): SiteView =>
  useDevice.getState().views[projectId] ?? IDENTITY;

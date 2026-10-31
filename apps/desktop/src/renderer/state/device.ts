// Which device each site is seen on (SPEC-phase2 §5, device sizes), and how the canvas fits
// that device into the panel. The default is "Your screen": a desktop browser the size of the
// display Fitts is on, drawn scaled down to fit the panel.
import { DEVICES, SCREEN_DEVICE, type SiteDevice } from '@fitts/schema';
import { create } from 'zustand';

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

/** The display Fitts is on, in CSS px (main measures the same display). */
export function screenDevice(): SiteDevice {
  const width = typeof screen === 'undefined' ? 1440 : screen.width;
  const height = typeof screen === 'undefined' ? 900 : screen.height;
  return {
    id: SCREEN_DEVICE,
    label: `Your screen · ${width}×${height}`,
    width,
    height,
    mobile: false,
  };
}

export const deviceFor = (id: string | undefined): SiteDevice =>
  DEVICES.find((d) => d.id === id) ?? screenDevice();

let screenCache: SiteDevice | undefined;

/** The site's device; "Your screen" unless the user picked another. */
export const useProjectDevice = (projectId: string): SiteDevice =>
  useDevice((s) => {
    const id = s.byProject[projectId];
    if (id && id !== SCREEN_DEVICE) return deviceFor(id);
    // One object per session, so the selector's result stays stable.
    screenCache ??= screenDevice();
    return screenCache;
  });

/** The current frame placement, read outside React (overlays, input). */
export const siteView = (projectId: string): SiteView =>
  useDevice.getState().views[projectId] ?? IDENTITY;

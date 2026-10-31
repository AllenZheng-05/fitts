// Panel sizes the user dragged (Allen's feedback: the side and bottom panels resize and
// collapse). Kept between launches; the defaults are the design's sizes.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type PanelName = 'siteMap' | 'chat' | 'tray' | 'doneSite';

interface Panel {
  /** Width (or height, for the tray) in px; null is the panel's own size. */
  size: number | null;
  collapsed: boolean;
}

interface LayoutState {
  panels: Record<PanelName, Panel>;
  resize: (name: PanelName, size: number) => void;
  setCollapsed: (name: PanelName, collapsed: boolean) => void;
}

const open = (size: number | null): Panel => ({ size, collapsed: false });

export const PANEL_DEFAULTS: Record<PanelName, number> = {
  siteMap: 210,
  chat: 400,
  tray: 200,
  doneSite: 520,
};

/** How small and big each panel may get, in px (the site view keeps the rest). */
export const PANEL_LIMITS: Record<PanelName, [number, number]> = {
  siteMap: [160, 420],
  chat: [300, 720],
  tray: [120, 520],
  doneSite: [360, 1400],
};

export const useLayout = create<LayoutState>()(
  persist(
    (set) => ({
      panels: { siteMap: open(null), chat: open(null), tray: open(null), doneSite: open(null) },
      resize: (name, size) =>
        set((s) => {
          const [min, max] = PANEL_LIMITS[name];
          return {
            panels: {
              ...s.panels,
              [name]: { size: Math.round(Math.min(max, Math.max(min, size))), collapsed: false },
            },
          };
        }),
      setCollapsed: (name, collapsed) =>
        set((s) => ({ panels: { ...s.panels, [name]: { ...s.panels[name], collapsed } } })),
    }),
    { name: 'fitts.layout', storage: createJSONStorage(() => localStorage), version: 1 },
  ),
);

/** A panel's size now: what the user dragged it to, or its default. */
export const panelSize = (p: Panel, name: PanelName) => p.size ?? PANEL_DEFAULTS[name];

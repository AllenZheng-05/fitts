/** Props every mock "your site" receives from the site view (SPEC §9.4). */
export interface MockSiteProps {
  route: string;
  navigate: (route: string) => void;
  /** `now` shows the seeded flaws; `fixed` is the Done preview with every fix applied. */
  variant: 'now' | 'fixed';
  /** Reports a click on an element with a `data-ref`, for "You clicked …" while driving. */
  onElementClick?: (ref: string, label: string) => void;
  /** Redesign direction for the `fixed` variant (hartwell-site, §6.7). */
  direction?: string | undefined;
}

/** Shared base styles: mock sites are plain websites in system fonts, not app tokens. */
export const SITE_FONT = 'font-[system-ui,-apple-system,Segoe_UI,sans-serif]';

// The seam between the site view and whatever renders "your site" (SPEC §13). Phase 1
// renders mock React sites; Phase 2 provides a WebContentsViewSurface.

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SiteSurface {
  /** An element's box relative to the surface, by its `data-ref`. */
  getElementRect(ref: string): Rect | null;
  /** The element with a `data-ref` at a point (client coordinates). */
  refAt(clientX: number, clientY: number): string | null;
}

/** A surface over the DOM container (read at call time) holding a mock site. */
export function domSurface(containerRef: { readonly current: HTMLElement | null }): SiteSurface {
  const getContainer = () => containerRef.current;
  return {
    getElementRect(ref) {
      const container = getContainer();
      if (!container) return null;
      const el = container.querySelector<HTMLElement>(`[data-ref="${CSS.escape(ref)}"]`);
      if (!el) return null;
      const box = el.getBoundingClientRect();
      const origin = container.getBoundingClientRect();
      return {
        left: box.left - origin.left,
        top: box.top - origin.top,
        width: box.width,
        height: box.height,
      };
    },
    refAt(clientX, clientY) {
      const container = getContainer();
      const el = document.elementFromPoint(clientX, clientY);
      const target = el instanceof HTMLElement ? el.closest<HTMLElement>('[data-ref]') : null;
      return target && container?.contains(target) ? (target.dataset['ref'] ?? null) : null;
    },
  };
}

// The seam between the site view and whatever renders "your site" (SPEC §13). Phase 1
// renders mock React sites; Phase 2 streams the real site (liveSurface, SPEC-phase2 §5.2).

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
  /** Phase 2's live site answers over IPC, so pointing awaits this when present (§5.2). */
  refAtAsync?(clientX: number, clientY: number): Promise<string | null>;
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

/**
 * A surface over the live site (SPEC-phase2 §5.2). Boxes come from main; this keeps them in a
 * cache so `getElementRect` stays synchronous, as the overlays expect, and `refresh` (every
 * 120ms while the site is live) re-measures the refs that were asked for recently. Site CSS px
 * equal canvas px, and the canvas sits at the container's top-left.
 */
export function liveSurface(
  projectId: string,
  containerRef: { readonly current: HTMLElement | null },
  site: {
    rects(projectId: string, refs: string[]): Promise<Record<string, Rect>>;
    refAt(projectId: string, x: number, y: number): Promise<string | null>;
  },
): SiteSurface & { refresh(): Promise<void> } {
  const rects = new Map<string, Rect>();
  const wanted = new Map<string, number>();
  let busy = false;
  return {
    getElementRect(ref) {
      wanted.set(ref, Date.now());
      return rects.get(ref) ?? null;
    },
    refAt: () => null,
    async refAtAsync(clientX, clientY) {
      const box = containerRef.current?.getBoundingClientRect();
      if (!box) return null;
      return site.refAt(projectId, clientX - box.left, clientY - box.top);
    },
    async refresh() {
      if (busy) return;
      const now = Date.now();
      for (const [ref, at] of wanted) if (now - at > 2000) wanted.delete(ref);
      if (wanted.size === 0) return;
      busy = true;
      try {
        const fresh = await site.rects(projectId, [...wanted.keys()]);
        rects.clear();
        for (const [ref, rect] of Object.entries(fresh)) rects.set(ref, rect);
      } finally {
        busy = false;
      }
    },
  };
}

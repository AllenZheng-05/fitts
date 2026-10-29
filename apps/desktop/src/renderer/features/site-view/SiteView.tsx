import { ArrowLeft, ArrowRight, RotateCw } from 'lucide-react';
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { IconButton } from '../../components/IconButton';
import { copy } from '../../copy';
import { cx } from '../../lib/cx';
import { renderSite } from '../../mock/sites';
import { useProject } from '../../state/projects';
import { isTopOverlay, useOverlayStack } from '../../state/overlays';
import { useSite, useSiteRoute } from '../../state/site';
import { useUi } from '../../state/ui';
import { domSurface, type Rect, type SiteSurface } from './surface';

export const MESSAGE_BOX_ID = 'message-box';

interface SiteViewProps {
  projectId: string;
  /** Items after the address field: chips and toggles that differ by workspace state. */
  toolbarEnd?: ReactNode;
  /** Host shown in the address instead of the project's (the Done preview server). */
  addressHost?: string | undefined;
  /** Can the user click inside the site? (Interview, or after "Take the wheel".) */
  interactive: boolean;
  /** `fixed` renders the Done preview with every fix applied. */
  variant?: 'now' | 'fixed';
  /** Redesign direction for the `fixed` variant (§6.7). */
  direction?: string | undefined;
  /** Drawn over the site, aligned through the surface (M5 overlays). */
  overlay?: (surface: SiteSurface) => ReactNode;
  onElementClick?: (ref: string, label: string) => void;
  footer?: ReactNode;
  /** A panel over the site view, below the toolbar (the Finding panel, §6.5). */
  panel?: ReactNode;
  /** Pushes the site left so content stays visible beside `panel` (CSS length). */
  contentInsetRight?: string;
  label?: string;
  className?: string;
  header?: ReactNode;
}

/** The embedded browser showing "your site" (SPEC §6.3, §6.4). */
export function SiteView({
  projectId,
  toolbarEnd,
  addressHost,
  interactive,
  variant = 'now',
  direction,
  overlay,
  onElementClick,
  footer,
  panel,
  contentInsetRight,
  label = copy.site.region,
  className,
  header,
}: SiteViewProps) {
  const project = useProject(projectId);
  const { route, canBack, canForward, reloads } = useSiteRoute(projectId);
  const site = useSite();
  const pointing = useUi((s) => s.pointing);
  const containerRef = useRef<HTMLDivElement>(null);
  // The surface reads the container only from handlers and effects, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [surface] = useState<SiteSurface>(() => domSurface(containerRef));

  return (
    <section
      aria-label={label}
      className={cx(
        'relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-panel border-[1.5px] border-ink bg-card shadow-panel',
        className,
      )}
    >
      <div className="flex flex-none flex-col gap-1 border-b border-ink px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={copy.site.nav} className="flex gap-1">
            <IconButton
              size="sm"
              aria-label={copy.site.back}
              disabled={!canBack}
              onClick={() => site.back(projectId)}
              icon={<ArrowLeft size={16} aria-hidden="true" />}
            />
            <IconButton
              size="sm"
              aria-label={copy.site.forward}
              disabled={!canForward}
              onClick={() => site.forward(projectId)}
              icon={<ArrowRight size={16} aria-hidden="true" />}
            />
            <IconButton
              size="sm"
              aria-label={copy.site.reload}
              onClick={() => site.reload(projectId)}
              icon={<RotateCw size={16} aria-hidden="true" />}
            />
          </div>
          <input
            readOnly
            aria-label={copy.site.url}
            value={`${addressHost ?? project?.url ?? 'localhost'}${route}`}
            className="min-w-0 flex-[1_1_180px] truncate rounded-row bg-surface-2 px-3 py-[9px] font-mono text-[12px]"
          />
          {toolbarEnd}
        </div>
        {header}
      </div>
      <div
        ref={containerRef}
        className={cx(
          'relative min-h-0 flex-1 overflow-hidden bg-surface-2',
          pointing && 'cursor-crosshair',
        )}
      >
        <div
          className={cx(
            'h-full transition-[padding] duration-200 ease-out motion-reduce:transition-none',
            !interactive && !pointing && 'pointer-events-none',
          )}
          style={contentInsetRight ? { paddingRight: contentInsetRight } : undefined}
          inert={!interactive && !pointing ? true : undefined}
        >
          <Fragment key={reloads}>
            {renderSite(projectId, {
              route,
              navigate: (r) => site.navigate(projectId, r),
              variant,
              direction,
              onElementClick,
            })}
          </Fragment>
        </div>
        {overlay?.(surface)}
        {pointing && <PointLayer surface={surface} />}
      </div>
      {footer}
      {panel}
    </section>
  );
}

/**
 * "Point at something" (SPEC §7.4): crosshair, dashed cobalt outline on hover, a click
 * attaches "pointing at #id" to the message box. Esc cancels (it joins the overlay stack).
 */
function PointLayer({ surface }: { surface: SiteSurface }) {
  const [hover, setHover] = useState<{ ref: string; rect: Rect } | null>(null);
  const id = useId();

  useEffect(() => {
    const { push, remove } = useOverlayStack.getState();
    push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !isTopOverlay(id) || e.defaultPrevented) return;
      e.preventDefault();
      useUi.getState().set({ pointing: false });
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      remove(id);
    };
  }, [id]);

  const at = (e: React.PointerEvent | React.MouseEvent) => {
    // Look through this layer to the site underneath.
    const layer = e.currentTarget as HTMLElement;
    layer.style.pointerEvents = 'none';
    const ref = surface.refAt(e.clientX, e.clientY);
    layer.style.pointerEvents = '';
    return ref;
  };

  return (
    // Pointer-only picking layer; keyboard users attach context by typing in the message box.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="absolute inset-0 z-20 cursor-crosshair"
      onPointerMove={(e) => {
        const ref = at(e);
        const rect = ref ? surface.getElementRect(ref) : null;
        setHover(ref && rect ? { ref, rect } : null);
      }}
      onPointerLeave={() => setHover(null)}
      onClick={(e) => {
        const ref = at(e);
        if (!ref) return;
        useUi.getState().set({ pointing: false, draftPointingAt: ref });
        document.getElementById(MESSAGE_BOX_ID)?.focus();
      }}
    >
      {hover && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-row border-2 border-dashed border-cobalt"
          style={{
            left: hover.rect.left - 4,
            top: hover.rect.top - 4,
            width: hover.rect.width + 8,
            height: hover.rect.height + 8,
          }}
        />
      )}
    </div>
  );
}

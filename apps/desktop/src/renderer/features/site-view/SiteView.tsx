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
import { bridge } from '../../lib/bridge';
import { livePath, useLiveSite, useLiveSites } from '../../state/live-site';
import { DEVICES } from '@fitts/schema';
import { Select } from '../../components/fields';
import { DEV } from '../../dev';
import { FIT, useDevice } from '../../state/device';
import { SiteCanvas } from './SiteCanvas';
import { domSurface, liveSurface, type Rect, type SiteSurface } from './surface';

export const MESSAGE_BOX_ID = 'message-box';

/** See the site on a phone, tablet or desktop, or fitted to the panel. */
function DevicePicker({ projectId }: { projectId: string }) {
  const value = useDevice((s) => s.byProject[projectId] ?? FIT);
  return (
    <Select
      label={copy.site.device}
      hideLabel
      value={value}
      onChange={(e) => useDevice.getState().setDevice(projectId, e.target.value)}
      options={[
        { value: FIT, label: copy.site.deviceFit },
        ...DEVICES.map((d) => ({ value: d.id, label: d.label })),
      ]}
    />
  );
}

/** A release's site view before the real site is up: what's happening, never a stand-in. */
function SitePending({ projectId }: { projectId: string }) {
  const status = useLiveSites((s) => s.sites[projectId]);
  const failed = status?.status === 'failed';
  return (
    <div role="status" className="flex h-full flex-col items-center justify-center gap-2 p-6">
      <p className="text-[15px] font-semibold">
        {failed ? copy.site.pendingFailed : copy.site.pendingStarting}
      </p>
      {failed && status.log && status.log.length > 0 && (
        <pre className="max-h-40 max-w-full overflow-auto rounded-control bg-card p-3 font-mono text-[12px] text-muted">
          {status.log.slice(-6).join('\n')}
        </pre>
      )}
    </div>
  );
}

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
  /** A stored step shot (fitts-asset://…) shown instead of the live site while rewound. */
  shot?: string | undefined;
  /** There is no live site: the shot is the site (a recorded run, §12.3). */
  shotIsSite?: boolean;
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
  shot,
  shotIsSite = false,
}: SiteViewProps) {
  const project = useProject(projectId);
  const { route, canBack, canForward, reloads } = useSiteRoute(projectId);
  const site = useSite();
  const pointing = useUi((s) => s.pointing);
  const containerRef = useRef<HTMLDivElement>(null);
  // The surface reads the container only from handlers and effects, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [mockSurface] = useState<SiteSurface>(() => domSurface(containerRef));
  // The real site (SPEC-phase2 §5): frames on a canvas, boxes and refs from main.
  const live = useLiveSite(projectId);
  // The surface reads the container only from handlers and effects, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [realSurface] = useState(() =>
    liveSurface(projectId, containerRef, {
      rects: (id, refs) => bridge().site?.rects(id, refs) ?? Promise.resolve({}),
      refAt: (id, x, y) => bridge().site?.refAt(id, x, y) ?? Promise.resolve(null),
    }),
  );
  const surface = live ? realSurface : mockSurface;
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => void realSurface.refresh(), 120);
    return () => clearInterval(timer);
  }, [live, realSurface]);
  // Where Fitts (or the user) sends the mock route, the live site follows.
  const lastRoute = useRef(route);
  useEffect(() => {
    if (!live || lastRoute.current === route) return;
    lastRoute.current = route;
    bridge().site?.nav(projectId, { kind: 'path', path: route });
  }, [live, route, projectId]);
  const nav = (kind: 'back' | 'forward' | 'reload') => {
    if (live) bridge().site?.nav(projectId, { kind });
    else site[kind](projectId);
  };
  const liveHost = live?.url ? new URL(live.url).host : undefined;
  const shownPath = live ? (livePath(live) ?? route) : route;

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
              disabled={live ? !live.canBack : !canBack}
              onClick={() => nav('back')}
              icon={<ArrowLeft size={16} aria-hidden="true" />}
            />
            <IconButton
              size="sm"
              aria-label={copy.site.forward}
              disabled={live ? !live.canForward : !canForward}
              onClick={() => nav('forward')}
              icon={<ArrowRight size={16} aria-hidden="true" />}
            />
            <IconButton
              size="sm"
              aria-label={copy.site.reload}
              onClick={() => nav('reload')}
              icon={<RotateCw size={16} aria-hidden="true" />}
            />
          </div>
          <input
            readOnly
            aria-label={copy.site.url}
            value={`${addressHost ?? liveHost ?? project?.url ?? 'localhost'}${shownPath}`}
            className="min-w-0 flex-[1_1_180px] truncate rounded-row bg-surface-2 px-3 py-[9px] font-mono text-[12px]"
          />
          {live && <DevicePicker projectId={projectId} />}
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
          {live && (variant === 'now' || !DEV) ? (
            <div className="relative h-full">
              <SiteCanvas
                projectId={projectId}
                interactive={interactive}
                cursor={live.cursor}
                onElementClick={onElementClick}
              />
              {shot && (
                // Rewind shows what the page looked like at that step (SPEC-phase2 §5.4).
                <img
                  src={shot}
                  alt=""
                  className="absolute top-0 left-0 max-w-none"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              )}
            </div>
          ) : shot && (shotIsSite || !DEV) ? (
            // A recorded run (or a rewind with the site closed): the stored step shot.
            <img src={shot} alt="" className="block max-w-none" />
          ) : DEV ? (
            // Phase 1's mock sites: dev and e2e builds only.
            <Fragment key={reloads}>
              {renderSite(projectId, {
                route,
                navigate: (r) => site.navigate(projectId, r),
                variant,
                direction,
                onElementClick,
              })}
            </Fragment>
          ) : (
            <SitePending projectId={projectId} />
          )}
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

  const at = async (e: React.PointerEvent | React.MouseEvent): Promise<string | null> => {
    if (surface.refAtAsync) return surface.refAtAsync(e.clientX, e.clientY);
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
        void at(e).then((ref) => {
          const rect = ref ? surface.getElementRect(ref) : null;
          setHover(ref && rect ? { ref, rect } : null);
        });
      }}
      onPointerLeave={() => setHover(null)}
      onClick={(e) => {
        void at(e).then((ref) => {
          if (!ref) return;
          useUi.getState().set({ pointing: false, draftPointingAt: ref });
          document.getElementById(MESSAGE_BOX_ID)?.focus();
        });
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

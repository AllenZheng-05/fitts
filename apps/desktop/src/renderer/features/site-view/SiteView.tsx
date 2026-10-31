import { ArrowLeft, ArrowRight, RotateCw } from 'lucide-react';
import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
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
import { DEVICES, SCREEN_DEVICE, type PointedElement } from '@fitts/schema';
import { format } from '../../lib/format';
import { Select } from '../../components/fields';
import { TEST_BUILD } from '../../dev';
import { screenDevice, useDevice } from '../../state/device';
import { SiteCanvas } from './SiteCanvas';
import { domSurface, liveSurface, type Rect, type SiteSurface } from './surface';

export const MESSAGE_BOX_ID = 'message-box';

/** See the site on your own screen's size, or a phone, tablet or desktop. */
function DevicePicker({ projectId }: { projectId: string }) {
  const value = useDevice((s) => s.byProject[projectId] ?? SCREEN_DEVICE);
  return (
    <Select
      label={copy.site.device}
      hideLabel
      value={value}
      onChange={(e) => useDevice.getState().setDevice(projectId, e.target.value)}
      options={[
        { value: SCREEN_DEVICE, label: screenDevice().label },
        ...DEVICES.map((d) => ({ value: d.id, label: d.label })),
      ]}
    />
  );
}

/** A release's site view before the real site is up: what's happening, never a stand-in. */
function SitePending({ siteId }: { siteId: string }) {
  const status = useLiveSites((s) => s.sites[siteId]);
  const failed = status?.status === 'failed';
  return (
    <div role="status" className="flex h-full flex-col items-center justify-center gap-2 p-6">
      <p className="text-[15px] font-semibold">
        {failed
          ? copy.site.pendingFailed
          : siteId.includes('.v.')
            ? copy.site.pendingVersion
            : copy.site.pendingStarting}
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
  /**
   * Which site to show: the project's own (the default) or a version of it (versionSiteId). A
   * version can always be used; Fitts never acts on it.
   */
  siteId?: string | undefined;
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
  /**
   * Without the wheel, the live site can still be scrolled and hovered; a click, a key or the
   * back/forward/reload buttons ask this first, with what to do once you take the wheel.
   */
  onNeedsWheel?: ((then: () => void) => void) | undefined;
  footer?: ReactNode;
  /** A panel over the site view, below the toolbar (the Finding panel, §6.5). */
  panel?: ReactNode;
  /** Pushes the site left so content stays visible beside `panel` (CSS length). */
  contentInsetRight?: string;
  label?: string;
  className?: string;
  style?: CSSProperties;
  header?: ReactNode;
  /** A stored step shot (fitts-asset://…) shown instead of the live site while rewound. */
  shot?: string | undefined;
  /** There is no live site: the shot is the site (a recorded run, §12.3). */
  shotIsSite?: boolean;
}

/** The embedded browser showing "your site" (SPEC §6.3, §6.4). */
export function SiteView({
  projectId,
  siteId,
  toolbarEnd,
  addressHost,
  interactive,
  variant = 'now',
  direction,
  overlay,
  onElementClick,
  onNeedsWheel,
  footer,
  panel,
  contentInsetRight,
  label = copy.site.region,
  className,
  style,
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
  const sid = siteId ?? projectId;
  const version = sid !== projectId;
  const live = useLiveSite(sid);
  // The surface reads the container only from handlers and effects, never during render. The
  // parent remounts the view (a key) to switch sites.
  // eslint-disable-next-line react-hooks/refs
  const [realSurface] = useState(() =>
    liveSurface(sid, containerRef, {
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
    if (!live || version || lastRoute.current === route) return;
    lastRoute.current = route;
    bridge().site?.nav(projectId, { kind: 'path', path: route });
  }, [live, version, route, projectId]);
  const browsing = Boolean(live && !version && onNeedsWheel);
  const nav = (kind: 'back' | 'forward' | 'reload') => {
    const go = () => (live ? bridge().site?.nav(sid, { kind }) : site[kind](projectId));
    // Moving the page while Fitts is using it is taking the wheel.
    if (browsing && !interactive && onNeedsWheel) onNeedsWheel(go);
    else go();
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
      style={style}
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
          {live && <DevicePicker projectId={sid} />}
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
            !interactive && !version && !browsing && !pointing && 'pointer-events-none',
          )}
          style={contentInsetRight ? { paddingRight: contentInsetRight } : undefined}
          inert={!interactive && !version && !browsing && !pointing ? true : undefined}
        >
          {live && (variant === 'now' || !TEST_BUILD) ? (
            <div className="relative h-full">
              <SiteCanvas
                projectId={sid}
                interactive={interactive || version}
                cursor={live.cursor}
                onElementClick={onElementClick}
                onNeedsWheel={version ? undefined : onNeedsWheel}
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
          ) : shot && (shotIsSite || !TEST_BUILD) ? (
            // A recorded run (or a rewind with the site closed): the stored step shot.
            <img src={shot} alt="" className="block max-w-none" />
          ) : TEST_BUILD && !version ? (
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
            <SitePending siteId={sid} />
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
/** What you pointed at, in words: "“Sign up” button", or "this image" when it has no name. */
function pointedLabel(el: PointedElement): string {
  const kind = copy.chat.pointKinds[el.kind];
  return el.name
    ? format(copy.chat.pointedNamed, { name: el.name, kind })
    : format(copy.chat.pointedUnnamed, { kind });
}

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

  const at = async (
    e: React.PointerEvent | React.MouseEvent,
  ): Promise<{ ref: string; label: string } | null> => {
    if (surface.refAtAsync) {
      const el = await surface.refAtAsync(e.clientX, e.clientY);
      return el ? { ref: el.ref, label: pointedLabel(el) } : null;
    }
    // Look through this layer to the site underneath.
    const layer = e.currentTarget as HTMLElement;
    layer.style.pointerEvents = 'none';
    const ref = surface.refAt(e.clientX, e.clientY);
    layer.style.pointerEvents = '';
    return ref ? { ref, label: '' } : null;
  };

  return (
    // Pointer-only picking layer; keyboard users attach context by typing in the message box.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="absolute inset-0 z-20 cursor-crosshair"
      onPointerMove={(e) => {
        void at(e).then((hit) => {
          const rect = hit ? surface.getElementRect(hit.ref) : null;
          setHover(hit && rect ? { ref: hit.ref, rect } : null);
        });
      }}
      onPointerLeave={() => setHover(null)}
      onClick={(e) => {
        void at(e).then((hit) => {
          if (!hit) return;
          useUi
            .getState()
            .set({ pointing: false, draftPointingAt: hit.ref, draftPointingLabel: hit.label });
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

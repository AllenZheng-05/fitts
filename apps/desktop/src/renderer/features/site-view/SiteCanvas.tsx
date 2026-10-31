// The live site, streamed from main's offscreen window (SPEC-phase2 §5.1). Frames are drawn at
// the site's own CSS-px size, so canvas and site coordinates are the same. Input is forwarded
// only while the user may drive (the interview, or after Take the wheel).
import type { SiteInput } from '@fitts/schema';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import { copy } from '../../copy';
import { bridge } from '../../lib/bridge';
import { cx } from '../../lib/cx';
import { format } from '../../lib/format';
import { isMac } from '../../lib/platform';
import { MESSAGE_BOX_ID } from './SiteView';

const KEYS_HINT_ID = 'site-keys-hint';
import { useDevice, useProjectDevice } from '../../state/device';

/** Fitts's own shortcuts (⌘, ⌘P ⌘⇧P ⌘. ⌘L): never sent to the site. */
function appShortcut(e: KeyboardEvent<HTMLDivElement>): boolean {
  if (!e.metaKey && !e.ctrlKey) return false;
  const k = e.key.toLowerCase();
  return k === ',' || k === 'p' || k === '.' || k === 'l';
}

const CURSORS: Record<string, string> = { hand: 'pointer', ibeam: 'text', iBeam: 'text' };

const modifiers = (e: {
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}) => {
  const m: NonNullable<Extract<SiteInput, { kind: 'key' }>['modifiers']> = [];
  if (e.shiftKey) m.push('shift');
  if (e.ctrlKey) m.push('control');
  if (e.altKey) m.push('alt');
  if (e.metaKey) m.push('meta');
  return m;
};

export function SiteCanvas({
  projectId,
  interactive,
  cursor,
  onElementClick,
  onNeedsWheel,
}: {
  projectId: string;
  interactive: boolean;
  cursor?: string | undefined;
  /** Reports what the user clicked while driving ("You clicked …", Phase 1 §7.3). */
  onElementClick?: ((ref: string, label: string) => void) | undefined;
  /**
   * Browsing without the wheel: scrolling and hovering always reach the site; a click or a key
   * asks this first (Take the wheel?), with the action to do once you have it.
   */
  onNeedsWheel?: ((then: () => void) => void) | undefined;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // The size frames actually arrive at: main's window can differ from the device's nominal size
  // ("Your screen" as main measures it), and the fit must use what's drawn.
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);

  // Frames: decode off the main thread, draw the newest.
  useEffect(() => {
    const site = bridge().site;
    if (!site) return;
    let latest = 0;
    return site.onFrame(projectId, (jpeg, width, height) => {
      const n = ++latest;
      void createImageBitmap(new Blob([jpeg as BlobPart], { type: 'image/jpeg' })).then(
        (bitmap) => {
          const canvas = canvasRef.current;
          if (n !== latest || !canvas) return bitmap.close();
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            setFrame({ width, height });
          }
          canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
          bitmap.close();
        },
      );
    });
  }, [projectId]);

  // The site window is the device's size (main emulates it; "Your screen" by default), drawn
  // scaled down to fit the panel, centered.
  const device = useProjectDevice(projectId);
  const view = useDevice((s) => s.views[projectId]) ?? { scale: 1, x: 0, y: 0 };
  useEffect(() => {
    bridge().site?.device(projectId, device);
  }, [projectId, device]);
  useEffect(() => {
    const box = boxRef.current;
    const site = bridge().site;
    if (!box || !site) return;
    const drawn = frame ?? device;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const scale = Math.min(width / drawn.width, height / drawn.height, 1);
      useDevice
        .getState()
        .setView(projectId, { scale, x: Math.max(0, (width - drawn.width * scale) / 2), y: 0 });
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [projectId, device, frame]);
  /** Panel px to site px. */
  const toSite = (x: number, y: number) => ({
    x: (x - view.x) / view.scale,
    y: (y - view.y) / view.scale,
  });

  // Input goes out strictly in order; a press waits for its element to be named first, so
  // "You clicked …" names what was under the pointer, not the page the click led to.
  const [enqueue] = useState(() => {
    let chain: Promise<void> = Promise.resolve();
    return (step: () => void | Promise<void>) => {
      chain = chain.then(step).catch(() => undefined);
    };
  });
  const send = (input: SiteInput) => {
    if (interactive) enqueue(() => bridge().site?.input(projectId, input));
  };
  // Scrolling and hovering don't change anything, so they always go through.
  const browse = (input: SiteInput) => {
    if (interactive || onNeedsWheel) enqueue(() => bridge().site?.input(projectId, input));
  };
  const mouse =
    (type: 'mouseDown' | 'mouseUp' | 'mouseMove') => (e: PointerEvent<HTMLDivElement>) => {
      const at = toSite(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
      const button: 'left' | 'right' | 'middle' =
        e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left';
      if (!interactive && onNeedsWheel) {
        if (type === 'mouseMove') browse({ kind: 'mouse', type, x: at.x, y: at.y });
        // A click is the user's to make: ask to take the wheel, then make it.
        if (type === 'mouseDown')
          onNeedsWheel(() => {
            const site = bridge().site;
            const click = { kind: 'mouse' as const, ...at, button, clickCount: 1 };
            site?.input(projectId, { ...click, type: 'mouseDown' });
            site?.input(projectId, { ...click, type: 'mouseUp' });
          });
        return;
      }
      if (type === 'mouseDown') {
        e.currentTarget.focus();
        if (interactive && onElementClick) {
          enqueue(async () => {
            const el = await bridge().site?.elementAt(projectId, at.x, at.y);
            if (el) onElementClick(el.ref, el.label);
          });
        }
      }
      send({ kind: 'mouse', type, x: at.x, y: at.y, button, clickCount: 1 });
    };
  const key = (type: 'keyDown' | 'keyUp') => (e: KeyboardEvent<HTMLDivElement>) => {
    // F6 leaves the site for the message box (as browsers move between panes); Fitts's own
    // shortcuts (⌘L, ⌘., ⌘P…) stay Fitts's.
    if (e.key === 'F6') {
      if (type === 'keyDown') {
        e.preventDefault();
        document.getElementById(MESSAGE_BOX_ID)?.focus();
      }
      return;
    }
    if (appShortcut(e)) return;
    if (!interactive) {
      // Without the wheel, Tab moves on through Fitts; typing meant for the site asks first.
      if (type === 'keyDown' && onNeedsWheel && (e.key.length === 1 || e.key === 'Enter'))
        onNeedsWheel(() => undefined);
      return;
    }
    // Every other key is the site's while it has focus, Tab and Esc included.
    e.preventDefault();
    send({
      kind: 'key',
      type,
      key: e.key,
      code: e.code,
      keyCode: e.keyCode,
      modifiers: modifiers(e),
      ...(e.repeat ? { repeat: true } : {}),
      ...(e.location ? { location: e.location } : {}),
    });
  };
  const [focused, setFocused] = useState(false);

  return (
    <div ref={boxRef} className="absolute inset-0 overflow-hidden bg-card" data-site-canvas>
      {/* An embedded app surface that forwards raw input, which jsx-a11y can't model. Once it
          has focus (a click, or Tab into it), every key goes to the site, Tab included; F6 or
          ⌘L leaves for the message box. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        role="application"
        aria-label={copy.site.liveLabel}
        aria-describedby={interactive && focused ? KEYS_HINT_ID : undefined}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={interactive || onNeedsWheel ? 0 : -1}
        className="h-full w-full outline-none"
        style={{ cursor: cursor ? (CURSORS[cursor] ?? cursor) : undefined }}
        onFocus={() => {
          setFocused(true);
          if (interactive) enqueue(() => bridge().site?.input(projectId, { kind: 'focus' }));
        }}
        onBlur={() => setFocused(false)}
        onPointerDown={mouse('mouseDown')}
        onPointerUp={mouse('mouseUp')}
        onPointerMove={mouse('mouseMove')}
        onWheel={(e: WheelEvent<HTMLDivElement>) =>
          browse({
            kind: 'wheel',
            ...toSite(e.nativeEvent.offsetX, e.nativeEvent.offsetY),
            deltaX: e.deltaX,
            deltaY: e.deltaY,
          })
        }
        onKeyDown={key('keyDown')}
        onKeyUp={key('keyUp')}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className={cx(
            'pointer-events-none block origin-top-left',
            device.mobile && 'rounded-card border-[1.5px] border-ink',
          )}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        />
      </div>
      {interactive && focused && (
        <p
          id={KEYS_HINT_ID}
          className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-pill bg-ink px-3 py-1 text-[12px] text-card"
        >
          {format(copy.site.keysHint, { leave: isMac() ? '⌘L' : 'Ctrl+L' })}
        </p>
      )}
    </div>
  );
}

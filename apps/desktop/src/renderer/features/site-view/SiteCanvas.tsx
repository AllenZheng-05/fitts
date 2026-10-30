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
import { bridge } from '../../lib/bridge';
import { cx } from '../../lib/cx';
import { useDevice, useProjectDevice } from '../../state/device';

/** Electron's sendInputEvent key names for keys whose DOM names differ. */
const KEY_NAMES: Record<string, string> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ' ': 'Space',
};

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
}: {
  projectId: string;
  interactive: boolean;
  cursor?: string | undefined;
  /** Reports what the user clicked while driving ("You clicked …", Phase 1 §7.3). */
  onElementClick?: ((ref: string, label: string) => void) | undefined;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

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
          }
          canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
          bitmap.close();
        },
      );
    });
  }, [projectId]);

  // "Fit": the site window follows the panel's size (debounced 150ms). A device: the window is
  // the device's size (main emulates it), drawn scaled down to fit the panel, centered.
  const device = useProjectDevice(projectId);
  const view = useDevice((s) => s.views[projectId]) ?? { scale: 1, x: 0, y: 0 };
  useEffect(() => {
    bridge().site?.device(projectId, device);
  }, [projectId, device]);
  useEffect(() => {
    const box = boxRef.current;
    const site = bridge().site;
    if (!box || !site) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (device) {
        const scale = Math.min(width / device.width, height / device.height, 1);
        useDevice
          .getState()
          .setView(projectId, { scale, x: Math.max(0, (width - device.width * scale) / 2), y: 0 });
        return;
      }
      useDevice.getState().setView(projectId, { scale: 1, x: 0, y: 0 });
      clearTimeout(timer);
      timer = setTimeout(() => site.resize(projectId, width, height), 150);
    });
    observer.observe(box);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [projectId, device]);
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
  const mouse =
    (type: 'mouseDown' | 'mouseUp' | 'mouseMove') => (e: PointerEvent<HTMLDivElement>) => {
      const at = toSite(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
      if (type === 'mouseDown') {
        e.currentTarget.focus();
        if (interactive && onElementClick) {
          enqueue(async () => {
            const el = await bridge().site?.elementAt(projectId, at.x, at.y);
            if (el) onElementClick(el.ref, el.label);
          });
        }
      }
      const button = e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left';
      send({ kind: 'mouse', type, x: at.x, y: at.y, button, clickCount: 1 });
    };
  const key = (type: 'keyDown' | 'keyUp') => (e: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || e.key === 'Tab') return;
    e.preventDefault();
    const name = KEY_NAMES[e.key] ?? e.key;
    send({ kind: 'key', type, keyCode: name, modifiers: modifiers(e) });
    // Printable characters also need a char event to type into fields.
    if (type === 'keyDown' && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      send({ kind: 'key', type: 'char', keyCode: e.key, modifiers: modifiers(e) });
    }
  };

  return (
    <div ref={boxRef} className="absolute inset-0 overflow-hidden bg-card" data-site-canvas>
      {/* The site is mouse-driven here; keyboard users drive it from the chat (Phase 1 §7.3).
          It's an embedded app surface that forwards raw input, which jsx-a11y can't model. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        role="application"
        aria-label="Your site (live)"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={interactive ? 0 : -1}
        className="h-full w-full outline-none"
        style={{ cursor: cursor ? (CURSORS[cursor] ?? cursor) : undefined }}
        onPointerDown={mouse('mouseDown')}
        onPointerUp={mouse('mouseUp')}
        onPointerMove={mouse('mouseMove')}
        onWheel={(e: WheelEvent<HTMLDivElement>) =>
          send({
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
            device && 'rounded-card border-[1.5px] border-ink',
          )}
          style={
            device
              ? { transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }
              : undefined
          }
        />
      </div>
    </div>
  );
}

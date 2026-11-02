import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { BackgroundBoundary } from './BackgroundBoundary';
import type { FieldMode } from './shapes';
import { StillField } from './StillField';

// three.js and Rapier are large: their own chunk, fetched only when the 3D field will run.
const ShapeField = lazy(() => import('./ShapeField').then((m) => ({ default: m.ShapeField })));

/** Any of these and the visitor gets the still image, never the WebGL bundle (SPEC-site). */
const STILL_QUERIES = [
  '(pointer: coarse)',
  '(max-width: 767.98px)',
  '(prefers-reduced-motion: reduce)',
];

let webgl: boolean | undefined;
function hasWebGL(): boolean {
  if (webgl !== undefined) return webgl;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    webgl = Boolean(gl);
  } catch {
    webgl = false;
  }
  return webgl;
}

const saveData = () =>
  Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);

const subscribe = (cb: () => void) => {
  const lists = STILL_QUERIES.map((q) => window.matchMedia(q));
  for (const l of lists) l.addEventListener('change', cb);
  return () => {
    for (const l of lists) l.removeEventListener('change', cb);
  };
};

export const wantsStill = () =>
  STILL_QUERIES.some((q) => window.matchMedia(q).matches) || saveData() || !hasWebGL();

/** After the first paint, when the browser is idle: the page is usable before the field loads. */
function useIdle(): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let cancel = () => undefined as void;
    const frame = requestAnimationFrame(() => {
      if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(() => setIdle(true), { timeout: 2500 });
        cancel = () => window.cancelIdleCallback(id);
      } else {
        const id = window.setTimeout(() => setIdle(true), 300);
        cancel = () => window.clearTimeout(id);
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      cancel();
    };
  }, []);
  return idle;
}

/**
 * The floating shapes behind every page: lively on Home, calm elsewhere. The still image shows
 * first (the same layout), and the 3D field replaces it once it has drawn, if it may run at all.
 */
export function Field({ mode }: { mode: Exclude<FieldMode, 'still'> }) {
  const still = useSyncExternalStore(subscribe, wantsStill, () => true);
  const idle = useIdle();
  const [drawn, setDrawn] = useState(false);
  if (still) return <StillField mode="still" />;
  return (
    <>
      {!drawn && <StillField mode={mode} />}
      {idle && (
        <BackgroundBoundary onError={() => setDrawn(false)}>
          <Suspense fallback={null}>
            <ShapeField mode={mode} onReady={() => setDrawn(true)} />
          </Suspense>
        </BackgroundBoundary>
      )}
    </>
  );
}

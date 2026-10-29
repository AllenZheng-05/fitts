import { lazy, Suspense, useSyncExternalStore } from 'react';
import { useSettings } from '../../state/settings';
import { useUi } from '../../state/ui';
import type { FieldMode } from './shapes';

// three.js and Rapier are large, so the field loads after the UI is up.
const ShapeField = lazy(() => import('./ShapeField').then((m) => ({ default: m.ShapeField })));

const REDUCED = '(prefers-reduced-motion: reduce)';
const hasMedia = () => typeof window.matchMedia === 'function';
const subscribeReduced = (cb: () => void) => {
  if (!hasMedia()) return () => undefined;
  const query = window.matchMedia(REDUCED);
  query.addEventListener('change', cb);
  return () => query.removeEventListener('change', cb);
};
const useReducedMotion = () =>
  useSyncExternalStore(subscribeReduced, () => hasMedia() && window.matchMedia(REDUCED).matches);

/**
 * Picks the field's mode (§6.12): lively on Welcome, calm elsewhere, still for reduced
 * motion or "Still" in Settings; "Lively" in Settings makes every screen lively. Off when
 * "Floating shapes" is off.
 */
export function Background() {
  const screen = useUi((s) => s.screen);
  const on = useSettings((s) => s.shapesOn);
  const movement = useSettings((s) => s.shapeMovement);
  const reduced = useReducedMotion();
  // No WebGL-capable window (unit tests run in jsdom): no field.
  if (!on || !hasMedia()) return null;
  const mode: FieldMode =
    reduced || movement === 'still'
      ? 'still'
      : movement === 'lively' || screen === 'welcome'
        ? 'lively'
        : 'calm';
  return (
    <Suspense fallback={null}>
      <ShapeField mode={mode} />
    </Suspense>
  );
}

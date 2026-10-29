import { useEffect, useState } from 'react';
import { useBackground } from '../../state/background';
import type { FieldMode } from './shapes';

/**
 * Whether the shape field should animate (§6.12): not while the window is hidden or
 * blurred, not while a before/after divider is being dragged, and never in Still mode.
 */
export function useFieldRunning(mode: FieldMode): boolean {
  const [visible, setVisible] = useState(() => !document.hidden && document.hasFocus());
  const sliderDragging = useBackground((s) => s.sliderDragging);
  useEffect(() => {
    const onFocus = () => setVisible(!document.hidden);
    const onBlur = () => setVisible(false);
    const onVisibility = () => setVisible(!document.hidden && document.hasFocus());
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  return mode !== 'still' && visible && !sliderDragging;
}

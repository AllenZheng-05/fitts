import { useEffect, useState, type RefObject } from 'react';
import type { FieldMode } from './shapes';

/**
 * Whether the shape field should animate: not while the tab is hidden, not while the field is
 * off screen, and never in Still mode. (The app also pauses while its window is blurred and a
 * before/after divider is dragged; a web page has neither reason.)
 */
export function useFieldRunning(mode: FieldMode, el: RefObject<Element | null>): boolean {
  const [visible, setVisible] = useState(() => !document.hidden);
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  useEffect(() => {
    const target = el.current;
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e?.isIntersecting ?? true));
    io.observe(target);
    return () => io.disconnect();
  }, [el]);
  return mode !== 'still' && visible && onScreen;
}

import { useEffect, useId, useLayoutEffect, useRef, type RefObject } from 'react';
import { isTopOverlay, useOverlayStack } from '../../state/overlays';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function focusableIn(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.closest('[inert]') && el.getAttribute('aria-hidden') !== 'true',
  );
}

interface OverlayOptions {
  open: boolean;
  onClose: () => void;
  containerRef: RefObject<HTMLElement | null>;
  /** Element to focus on open; defaults to the first focusable element. */
  initialFocusRef?: RefObject<HTMLElement | null> | undefined;
  /** Close when the pointer goes down outside the container (popovers and menus). */
  closeOnOutsidePointer?: boolean;
  /** Elements that count as "inside" for outside clicks, such as the trigger. */
  ignoreRefs?: RefObject<HTMLElement | null>[];
  /**
   * Where focus goes on close when nothing was focused at open, e.g. the project button
   * when ⌘P opened the menu.
   */
  fallbackFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Shared overlay behavior (SPEC §5.4, §7.2): joins the overlay stack, Esc closes only the
 * topmost overlay, Tab is trapped inside, and focus returns to the trigger on close.
 */
export function useOverlay({
  open,
  onClose,
  containerRef,
  initialFocusRef,
  closeOnOutsidePointer = false,
  ignoreRefs = [],
  fallbackFocusRef,
}: OverlayOptions): string {
  const id = useId();
  const onCloseRef = useRef(onClose);
  const ignoreRef = useRef(ignoreRefs);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
    ignoreRef.current = ignoreRefs;
  });

  useEffect(() => {
    if (!open) return;
    const { push, remove } = useOverlayStack.getState();
    const active = document.activeElement;
    const returnTo = active instanceof HTMLElement && active !== document.body ? active : null;
    push(id);

    const container = containerRef.current;
    const first = initialFocusRef?.current ?? (container && focusableIn(container)[0]) ?? container;
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopOverlay(id) || event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key === 'Tab' && container) trapTab(event, container);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!closeOnOutsidePointer || !isTopOverlay(id) || !container) return;
      const target = event.target as Node;
      const inside =
        container.contains(target) || ignoreRef.current.some((r) => r.current?.contains(target));
      if (!inside) onCloseRef.current();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown, true);
      remove(id);
      if (returnTo?.isConnected) returnTo.focus();
      else fallbackFocusRef?.current?.focus();
    };
    // Re-run only when the overlay opens or closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id]);

  return id;
}

function trapTab(event: KeyboardEvent, container: HTMLElement) {
  const items = focusableIn(container);
  if (items.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !container.contains(active))) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && (active === last || !container.contains(active))) {
    event.preventDefault();
    first?.focus();
  }
}

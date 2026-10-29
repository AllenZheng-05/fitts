import {
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../../lib/cx';
import { useOverlay } from './useOverlay';

const GAP = 8;
const EDGE = 12;

interface Position {
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

export interface PopoverProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role'> {
  open: boolean;
  onClose: () => void;
  /** The trigger; the popover opens under it and focus returns to it on close. */
  anchorRef: RefObject<HTMLElement | null>;
  /** Align the popover's left or right edge with the trigger's. */
  align?: 'start' | 'end';
  /** 440 for the project menu, 360 for the brief (SPEC §6.9, §6.10). */
  width: number;
  initialFocusRef?: RefObject<HTMLElement | null>;
  role?: 'dialog' | 'menu';
  children: ReactNode;
}

/** Anchored panel under its trigger. Esc or a click outside closes it (SPEC §5.4). */
export function Popover({
  open,
  onClose,
  anchorRef,
  align = 'start',
  width,
  initialFocusRef,
  role = 'dialog',
  className,
  children,
  ...rest
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position | null>(null);
  const placed = pos !== null;

  // Opens below the trigger; flips above when the content doesn't fit below and there is
  // more room above. Runs again once the content exists to measure it, before paint.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const raw = align === 'start' ? rect.left : rect.right - width;
      const left = Math.min(Math.max(EDGE, raw), window.innerWidth - width - EDGE);
      const below = window.innerHeight - rect.bottom - GAP - EDGE;
      const above = rect.top - GAP - EDGE;
      const height = ref.current?.scrollHeight ?? 0;
      setPos(
        height > below && above > below
          ? { left, bottom: window.innerHeight - rect.top + GAP, maxHeight: above }
          : { left, top: rect.bottom + GAP, maxHeight: below },
      );
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, placed, anchorRef, align, width]);

  useOverlay({
    open: open && pos !== null,
    onClose,
    containerRef: ref,
    initialFocusRef,
    closeOnOutsidePointer: true,
    ignoreRefs: [anchorRef],
    fallbackFocusRef: anchorRef,
  });

  if (!open || !pos) return null;
  return createPortal(
    <div
      ref={ref}
      role={role}
      tabIndex={-1}
      className={cx(
        'fixed z-40 flex animate-overlay-in flex-col overflow-hidden rounded-sheet border-[1.5px] border-ink bg-card shadow-hero motion-reduce:animate-none',
        className,
      )}
      style={{ ...pos, width }}
      {...rest}
    >
      {children}
    </div>,
    document.body,
  );
}

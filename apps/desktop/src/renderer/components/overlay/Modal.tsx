import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../../lib/cx';
import { useOverlay } from './useOverlay';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** id of the element that names the dialog (its title). */
  labelledBy: string;
  describedBy?: string;
  /** `alertdialog` for the destructive-action gate (SPEC §7.8). */
  role?: 'dialog' | 'alertdialog';
  /** `danger`: 2px ink border with a red offset shadow, the gate only. */
  tone?: 'default' | 'danger';
  /** Width in px; 640 for Add project (SPEC §6.11). */
  width?: number;
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

/**
 * Centered dialog over a 62% scrim. Focus is trapped, Esc closes it, and focus returns to
 * the trigger (SPEC §5.4). The app behind it is inert while it is open.
 */
export function Modal({
  open,
  onClose,
  labelledBy,
  describedBy,
  role = 'dialog',
  tone = 'default',
  width = 560,
  initialFocusRef,
  children,
}: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Declared before useOverlay so its cleanup runs first: the app must stop being inert
  // before focus returns to the trigger inside it.
  useEffect(() => {
    if (!open) return;
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    return () => root?.removeAttribute('inert');
  }, [open]);

  useOverlay({ open, onClose, containerRef: ref, initialFocusRef });

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-5">
      <div
        ref={ref}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={cx(
          'flex max-h-full w-full animate-overlay-in flex-col overflow-hidden rounded-hero bg-card motion-reduce:animate-none',
          tone === 'danger'
            ? 'border-2 border-ink shadow-danger'
            : 'border-[1.5px] border-ink shadow-hero',
        )}
        style={{ maxWidth: width }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

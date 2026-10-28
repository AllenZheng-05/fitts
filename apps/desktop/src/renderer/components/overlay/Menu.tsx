import { useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { cx } from '../../lib/cx';
import { Popover } from './Popover';

export interface MenuItem {
  id: string;
  label: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}

interface MenuProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  /** Accessible name of the menu. */
  label: string;
  items: MenuItem[];
  width?: number;
  align?: 'start' | 'end';
}

/** Popover with `role="menu"` and arrow-key focus between items (SPEC §5.4). */
export function Menu({ open, onClose, anchorRef, label, items, width = 240, align }: MenuProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: KeyboardEvent) => {
    const buttons = [
      ...(listRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not([disabled])',
      ) ?? []),
    ];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const target =
      event.key === 'ArrowDown'
        ? buttons[(index + 1) % buttons.length]
        : event.key === 'ArrowUp'
          ? buttons[(index - 1 + buttons.length) % buttons.length]
          : event.key === 'Home'
            ? buttons[0]
            : event.key === 'End'
              ? buttons.at(-1)
              : undefined;
    if (!target) return;
    event.preventDefault();
    target.focus();
  };

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      width={width}
      align={align}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="p-1.5"
    >
      <div ref={listRef} className="flex flex-col gap-0.5">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              item.onSelect();
              onClose();
            }}
            className={cx(
              'flex min-h-10 items-center rounded-row px-3 text-left text-[14px] font-semibold',
              'hover:bg-cobalt-tint focus-visible:bg-cobalt-tint disabled:cursor-not-allowed disabled:opacity-40',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </Popover>
  );
}

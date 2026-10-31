import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { cx } from '../lib/cx';
import { PANEL_LIMITS, panelSize, useLayout, type PanelName } from '../state/layout';
import { useBackground } from '../state/background';
import { ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';

/**
 * The grip between two panels: drag to resize, double-click (or Enter) to collapse or bring the
 * panel back, arrow keys to resize by 16px. It's a focusable separator with its size as the
 * value (WAI-ARIA window splitter). `side` is where the panel is: a panel on the right grows as
 * the grip moves left, the tray (bottom) as it moves up.
 */
export function ResizeHandle({
  panel,
  side,
  label,
}: {
  panel: PanelName;
  side: 'left' | 'right' | 'bottom';
  label: string;
}) {
  const state = useLayout((s) => s.panels[panel]);
  const size = panelSize(state, panel);
  const [min, max] = PANEL_LIMITS[panel];
  const drag = useRef<{ start: number; size: number } | null>(null);
  const vertical = side !== 'bottom';
  const sign = side === 'left' ? 1 : -1;
  const { resize, setCollapsed } = useLayout.getState();

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { start: vertical ? e.clientX : e.clientY, size: state.collapsed ? 0 : size };
    useBackground.setState({ sliderDragging: true });
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const next = d.size + sign * ((vertical ? e.clientX : e.clientY) - d.start);
    // Dragged well past its smallest size: it collapses.
    if (next < min / 2) setCollapsed(panel, true);
    else resize(panel, next);
  };
  const end = () => {
    drag.current = null;
    useBackground.setState({ sliderDragging: false });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const grow = vertical
      ? e.key === (side === 'left' ? 'ArrowRight' : 'ArrowLeft')
      : e.key === 'ArrowUp';
    const shrink = vertical
      ? e.key === (side === 'left' ? 'ArrowLeft' : 'ArrowRight')
      : e.key === 'ArrowDown';
    if (grow || shrink) {
      e.preventDefault();
      resize(panel, (state.collapsed ? min : size) + (grow ? 16 : -16));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      setCollapsed(panel, !state.collapsed);
    }
  };

  return (
    // A window splitter: focusable, with its own keyboard and pointer handling.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="separator"
      aria-label={label}
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-valuenow={state.collapsed ? 0 : size}
      aria-valuemin={0}
      aria-valuemax={max}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => setCollapsed(panel, !state.collapsed)}
      onKeyDown={onKeyDown}
      className={cx(
        'group relative z-10 flex flex-none items-center justify-center rounded-pill outline-none',
        vertical
          ? '-mx-3.5 w-3.5 cursor-col-resize self-stretch'
          : '-my-3.5 h-3.5 cursor-row-resize',
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          'rounded-pill bg-ink-faint transition-colors group-hover:bg-cobalt group-focus-visible:bg-cobalt',
          vertical ? 'h-10 w-1' : 'h-1 w-10',
        )}
      />
    </div>
  );
}

/** A collapsed panel: a slim bar that brings it back. */
export function CollapsedPanel({
  panel,
  side,
  label,
}: {
  panel: PanelName;
  side: 'left' | 'right' | 'bottom';
  label: string;
}) {
  const Icon = side === 'left' ? ChevronRight : side === 'right' ? ChevronLeft : ChevronUp;
  return (
    <button
      type="button"
      onClick={() => useLayout.getState().setCollapsed(panel, false)}
      className={cx(
        'flex flex-none items-center justify-center gap-1.5 rounded-panel border-[1.5px] border-ink bg-card text-[13px] font-semibold shadow-panel transition-tint hover:bg-paper',
        side === 'bottom'
          ? 'h-9 w-full'
          : 'w-9 flex-col self-stretch py-3 [writing-mode:vertical-rl]',
      )}
    >
      <Icon
        size={15}
        strokeWidth={2.5}
        aria-hidden="true"
        className={side === 'bottom' ? '' : 'rotate-90'}
      />
      {label}
    </button>
  );
}

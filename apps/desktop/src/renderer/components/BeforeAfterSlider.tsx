import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { copy } from '../copy';
import { cx } from '../lib/cx';
import { format } from '../lib/format';
import { useBackground } from '../state/background';

export const SLIDER_STEP = 5;

interface BeforeAfterSliderProps {
  before: ReactNode;
  after: ReactNode;
  beforeLabel?: string;
  afterLabel?: string;
  /** Divider position, 0–100: how much of the "before" pane shows. Uncontrolled by default. */
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  /** Lets the background shape field pause while the divider is dragged (SPEC §6.12). */
  onDragChange?: (dragging: boolean) => void;
  /** Cover the nearest positioned parent (a full-height comparison) instead of flowing. */
  fill?: boolean;
  className?: string;
}

const clamp = (n: number) => Math.min(100, Math.max(0, n));

/**
 * Two panes with a draggable divider and a sun "↔" knob (SPEC §5.4). Arrows move the
 * divider 5%, Home/End jump to the ends.
 */
export function BeforeAfterSlider({
  before,
  after,
  beforeLabel = copy.slider.before,
  afterLabel = copy.slider.after,
  value,
  defaultValue = 50,
  onChange,
  onDragChange,
  fill = false,
  className,
}: BeforeAfterSliderProps) {
  const [internal, setInternal] = useState(defaultValue);
  const position = clamp(value ?? internal);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const set = (next: number) => {
    const v = clamp(Math.round(next));
    if (value === undefined) setInternal(v);
    onChange?.(v);
  };

  const fromPointer = (event: PointerEvent) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    set(((event.clientX - rect.left) / rect.width) * 100);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const moves: Record<string, number> = {
      ArrowLeft: position - SLIDER_STEP,
      ArrowDown: position - SLIDER_STEP,
      ArrowRight: position + SLIDER_STEP,
      ArrowUp: position + SLIDER_STEP,
      Home: 0,
      End: 100,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    set(next);
  };

  return (
    <div
      ref={trackRef}
      className={cx(
        'isolate flex-none touch-none overflow-hidden select-none',
        fill ? 'absolute inset-0 z-10' : 'relative rounded-control border border-ink',
        className,
      )}
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        useBackground.setState({ sliderDragging: true });
        onDragChange?.(true);
        fromPointer(event);
      }}
      onPointerMove={(event) => {
        if (dragging.current) fromPointer(event);
      }}
      onPointerUp={(event) => {
        if (!dragging.current) return;
        dragging.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
        useBackground.setState({ sliderDragging: false });
        onDragChange?.(false);
      }}
    >
      {/* Side-by-side panes, as in the Finding reference: each shows its own content. */}
      <div className="absolute inset-0 flex">
        <div
          className="relative min-w-0 overflow-hidden bg-surface-2"
          style={{ width: `${position}%` }}
        >
          {before}
        </div>
        <div className="relative min-w-0 flex-1 overflow-hidden bg-cobalt-tint">{after}</div>
      </div>
      <PaneTag className="left-3">{beforeLabel}</PaneTag>
      <PaneTag className="right-3">{afterLabel}</PaneTag>

      <div
        role="slider"
        tabIndex={0}
        aria-label={copy.slider.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={position}
        aria-valuetext={format(copy.slider.valueText, { n: position })}
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="absolute top-0 bottom-0 z-10 flex w-10 -translate-x-1/2 cursor-ew-resize items-center justify-center focus-visible:outline-offset-[-2px]"
        style={{ left: `${position}%` }}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-ink"
        />
        <span
          aria-hidden="true"
          className="relative flex size-[30px] items-center justify-center rounded-full border-[1.5px] border-ink bg-sun text-[12px] font-bold text-ink"
        >
          ↔
        </span>
      </div>
    </div>
  );
}

function PaneTag({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={cx(
        'absolute top-3 z-[1] rounded-tag border border-ink bg-card px-[7px] py-0.5 text-[11px] font-bold',
        className,
      )}
    >
      {children}
    </span>
  );
}

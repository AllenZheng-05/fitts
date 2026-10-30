import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { beforeAfter } from './content';

const clamp = (n: number) => Math.min(100, Math.max(0, n));

/** Two screenshots laid over each other, revealed by a draggable divider (arrows move it 5%). */
export function BeforeAfter({ before, after }: { before: string; after: string }) {
  const [pos, setPos] = useState(50);
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const fromPointer = (e: PointerEvent) => {
    const r = track.current?.getBoundingClientRect();
    if (r && r.width > 0) setPos(clamp(((e.clientX - r.left) / r.width) * 100));
  };
  const onKey = (e: KeyboardEvent) => {
    const next = {
      ArrowLeft: pos - 5,
      ArrowDown: pos - 5,
      ArrowRight: pos + 5,
      ArrowUp: pos + 5,
      Home: 0,
      End: 100,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setPos(clamp(next));
  };

  return (
    <div
      ref={track}
      className="relative aspect-[16/10] touch-none overflow-hidden rounded-panel border-[1.5px] border-ink bg-card shadow-hero select-none"
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        fromPointer(e);
      }}
      onPointerMove={(e) => dragging.current && fromPointer(e)}
      onPointerUp={() => (dragging.current = false)}
    >
      <img src={after} alt="" className="absolute inset-0 size-full object-cover object-top" />
      <img
        src={before}
        alt=""
        className="absolute inset-0 size-full object-cover object-top"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      />
      <span className="absolute top-3 left-3 rounded-md border border-ink bg-card px-2 py-0.5 text-xs font-bold">
        {beforeAfter.before}
      </span>
      <span className="absolute top-3 right-3 rounded-md border border-ink bg-card px-2 py-0.5 text-xs font-bold">
        {beforeAfter.after}
      </span>
      <div
        role="slider"
        tabIndex={0}
        aria-label={beforeAfter.sliderLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        aria-valuetext={`${Math.round(pos)}% before`}
        onKeyDown={onKey}
        className="absolute top-0 bottom-0 flex w-11 -translate-x-1/2 cursor-ew-resize items-center justify-center"
        style={{ left: `${pos}%` }}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-ink"
        />
        <span
          aria-hidden="true"
          className="relative flex size-9 items-center justify-center rounded-full border-[1.5px] border-ink bg-sun text-sm font-bold"
        >
          ↔
        </span>
      </div>
    </div>
  );
}

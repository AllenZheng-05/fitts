import { useLayoutEffect, useRef, useState } from 'react';
import { copy } from '../../copy';
import { cx } from '../../lib/cx';
import { FittsMark } from './FittsMark';

/** The flight path from the start dot to where the cursor lands on the target. */
export const EMBLEM_PATH = 'M290 290 C 280 226, 234 180, 182 162';

/** Cursor travel time (SPEC §6.1). */
export const EMBLEM_MS = 1100;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * Welcome logo emblem, 300×300 (SPEC §6.1): layer tag, hero card with the mark, a dotted
 * flight path and a cobalt cursor landing on the coral target, and the Fitts's-law label.
 * With `animate`, on mount and once: the cursor travels the path over 1.1s (ease-in-out),
 * the path draws in behind it, and the target pulses on arrival. Reduced motion shows the
 * end state.
 */
export function FittsEmblem({ animate = false }: { animate?: boolean }) {
  const pathRef = useRef<SVGPathElement>(null);
  const revealRef = useRef<SVGPathElement>(null);
  const cursorRef = useRef<SVGPathElement>(null);
  const [arrived, setArrived] = useState(false);
  const maskId = 'emblem-path-reveal';

  useLayoutEffect(() => {
    const path = pathRef.current;
    const reveal = revealRef.current;
    const cursor = cursorRef.current;
    if (!animate || !path || !reveal || !cursor) return;
    if (typeof window.matchMedia !== 'function') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const length = path.getTotalLength();
    const end = path.getPointAtLength(length);
    reveal.style.strokeDasharray = `${length}`;
    let frame = 0;
    const started = performance.now();
    const step = (now: number) => {
      const t = easeInOut(Math.min(1, (now - started) / EMBLEM_MS));
      const p = path.getPointAtLength(length * t);
      cursor.setAttribute('transform', `translate(${p.x - end.x} ${p.y - end.y})`);
      reveal.style.strokeDashoffset = `${length * (1 - t)}`;
      if (t < 1) frame = requestAnimationFrame(step);
      else setArrived(true);
    };
    step(started);
    return () => cancelAnimationFrame(frame);
  }, [animate]);

  return (
    <div
      role="img"
      aria-label={copy.welcome.emblemLabel}
      className="relative size-[300px] flex-none"
      data-emblem={arrived ? 'arrived' : animate ? 'animating' : 'still'}
    >
      <span className="absolute top-0 left-0 rounded-label rounded-bl-none bg-cobalt px-3 py-[5px] font-mono text-[13px] font-medium text-card">
        {copy.welcome.emblemTag}
      </span>
      <div className="absolute top-[30px] left-0 flex size-[230px] items-center justify-center rounded-emblem border-[1.5px] border-ink bg-card shadow-hero">
        <FittsMark
          size={192}
          targetClassName={cx(
            'origin-center [transform-box:fill-box]',
            arrived && 'animate-target-pulse motion-reduce:animate-none',
          )}
        />
      </div>
      <svg
        className="absolute top-0 left-0"
        width="300"
        height="300"
        viewBox="0 0 300 300"
        aria-hidden="true"
      >
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="300" height="300">
            <path ref={revealRef} d={EMBLEM_PATH} fill="none" stroke="white" strokeWidth="8" />
          </mask>
        </defs>
        <path
          ref={pathRef}
          d={EMBLEM_PATH}
          fill="none"
          className="stroke-ink"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="1 9"
          mask={`url(#${maskId})`}
        />
        <circle cx="290" cy="290" r="5" className="fill-ink" />
        <path
          ref={cursorRef}
          d="M156 139 L182 152 L170 155 L165 167 Z"
          className="fill-cobalt stroke-ink"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      <span className="absolute top-[272px] left-0 rounded-label border border-ink bg-card px-2.5 py-1 font-mono text-[12px]">
        {copy.welcome.formula}
      </span>
    </div>
  );
}

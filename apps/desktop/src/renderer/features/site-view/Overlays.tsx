import { useEffect, useState } from 'react';
import type { Rect, SiteSurface } from './surface';

/** Re-measures while mounted: the site can move under the overlays at any time. */
function useTick(ms: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(timer);
  }, [ms]);
}

interface OverlaysProps {
  surface: SiteSurface;
  problems: { ref: string; pin: number }[];
  attention?: { ref: string; label: string } | undefined;
}

/**
 * Drawn over the mock site and aligned to its elements by ref (SPEC §6.4):
 * coral problem outlines with numbered pins, a cobalt attention box on what Fitts is
 * acting on, and the ghost cursor that glides between targets (300ms).
 */
export function Overlays({ surface, problems, attention }: OverlaysProps) {
  useTick(120);
  const focus = attention ? surface.getElementRect(attention.ref) : null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10">
      {problems.map(({ ref, pin }) => {
        const rect = surface.getElementRect(ref);
        return rect ? <Problem key={ref} rect={rect} pin={pin} /> : null;
      })}
      {focus && (
        <div
          className="absolute rounded-row border-[2.5px] border-cobalt bg-cobalt/8 transition-all duration-300 ease-out motion-reduce:transition-none"
          style={box(focus, 7)}
        />
      )}
      {focus && attention && <GhostCursor rect={focus} label={attention.label} />}
    </div>
  );
}

const box = (r: Rect, outset: number) => ({
  left: r.left - outset,
  top: r.top - outset,
  width: r.width + outset * 2,
  height: r.height + outset * 2,
});

function Problem({ rect, pin }: { rect: Rect; pin: number }) {
  return (
    <div className="absolute rounded-row border-[2.5px] border-coral" style={box(rect, 6)}>
      <span className="absolute -top-[13px] -right-[13px] flex size-6 items-center justify-center rounded-full border-[1.5px] border-ink bg-coral text-[12px] font-bold text-ink">
        {pin}
      </span>
    </div>
  );
}

function GhostCursor({ rect, label }: { rect: Rect; label: string }) {
  return (
    <div
      className="absolute flex items-start gap-1 transition-[left,top] duration-300 ease-out motion-reduce:transition-none"
      style={{
        left: rect.left + Math.min(28, rect.width / 2),
        top: rect.top + Math.min(30, rect.height - 6),
      }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24">
        <path
          d="M4 3l14 7-6 2-2 6z"
          className="fill-cobalt stroke-ink"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <span className="mt-4 rounded-row border border-ink bg-card px-[9px] py-[5px] font-sans text-[12px] font-bold whitespace-nowrap text-ink">
        {label}
      </span>
    </div>
  );
}

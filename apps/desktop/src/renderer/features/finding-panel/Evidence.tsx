import { DEVICES, type Finding } from '@fitts/schema';
import { useEffect, useState } from 'react';
import { copy } from '../../copy';
import { format } from '../../lib/format';

/** How much room to leave around the element when zooming, as a share of the view. */
const ZOOM_MARGIN = 0.9;

/**
 * The page when Fitts found the problem, pointing at it (Allen's feedback, round 5): zoomed to
 * the element with an outline, beside the whole page with the same box marked, so you can see
 * both what and where. A problem with no element (a page too wide) shows the whole shot, from
 * the device it happens on.
 */
export function Evidence({ finding, shot }: { finding: Finding; shot: string }) {
  const { box, shotSize } = finding;
  const device = finding.seenOn ? DEVICES.find((d) => d.id === finding.seenOn) : undefined;
  if (!box || !shotSize) {
    return (
      <figure className="flex flex-col gap-1.5">
        <div className="relative h-[420px] overflow-hidden rounded-control border border-ink bg-paper">
          <img
            src={shot}
            alt={copy.finding.shotAlt}
            className="absolute inset-0 size-full object-contain"
          />
          {finding.assets?.mask && (
            <img
              src={finding.assets.mask}
              alt=""
              className="pointer-events-none absolute inset-0 size-full object-contain"
            />
          )}
        </div>
        {device && (
          <figcaption className="text-[13px] text-muted">
            {format(copy.finding.seenOn, { device: device.label })}
          </figcaption>
        )}
      </figure>
    );
  }
  // The zoom: the box with room around it, at least a third of the page wide so it has context.
  const w = Math.min(
    shotSize.width,
    Math.max(box.width / (1 - ZOOM_MARGIN / 2), shotSize.width / 3),
  );
  const h = Math.min(shotSize.height, Math.max(box.height / (1 - ZOOM_MARGIN / 2), w * 0.55));
  const x = clamp(box.left + box.width / 2 - w / 2, 0, shotSize.width - w);
  const y = clamp(box.top + box.height / 2 - h / 2, 0, shotSize.height - h);
  const stroke = Math.max(2, w / 220);
  return (
    <figure className="grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)] gap-2">
      <div className="flex flex-col gap-1">
        <span className="text-[12px] font-semibold text-muted">{copy.finding.zoomed}</span>
        <Shot
          shot={shot}
          viewBox={`${x} ${y} ${w} ${h}`}
          size={shotSize}
          box={box}
          stroke={stroke}
          label={copy.finding.shotAlt}
          className="h-[340px]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[12px] font-semibold text-muted">{copy.finding.wholePage}</span>
        <Shot
          shot={shot}
          viewBox={`0 0 ${shotSize.width} ${shotSize.height}`}
          size={shotSize}
          box={box}
          stroke={Math.max(3, shotSize.width / 160)}
          label={copy.finding.wholePageAlt}
          className="h-[340px]"
        />
      </div>
    </figure>
  );
}

function Shot({
  shot,
  viewBox,
  size,
  box,
  stroke,
  label,
  className,
}: {
  shot: string;
  viewBox: string;
  size: { width: number; height: number };
  box: { left: number; top: number; width: number; height: number };
  stroke: number;
  label: string;
  className: string;
}) {
  // The outline pulses twice, unless motion is reduced.
  const [still] = useState(
    () =>
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [pulse, setPulse] = useState(!still);
  useEffect(() => {
    if (!pulse) return;
    const t = setTimeout(() => setPulse(false), 1600);
    return () => clearTimeout(t);
  }, [pulse]);
  const pad = stroke * 1.5;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      className={`w-full rounded-control border border-ink bg-paper ${className}`}
    >
      <image href={shot} x={0} y={0} width={size.width} height={size.height} />
      <rect
        x={box.left - pad}
        y={box.top - pad}
        width={box.width + pad * 2}
        height={box.height + pad * 2}
        rx={stroke * 2}
        fill="none"
        className="stroke-coral"
        strokeWidth={stroke}
      >
        {pulse && (
          <animate
            attributeName="stroke-opacity"
            values="1;0.25;1;0.25;1"
            dur="1.6s"
            repeatCount="1"
          />
        )}
      </rect>
    </svg>
  );
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi));

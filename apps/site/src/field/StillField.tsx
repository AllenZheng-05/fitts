// The still image of the field, for phones, reduced motion, Save-Data and no WebGL, and the
// picture shown until the 3D field has drawn. It is the same layout() as the 3D field (same
// shapes, sizes, colors and places), drawn as SVG with the 3D scene's light from the upper
// left: a highlight and an edge shade over each token color. No WebGL, no three.js.
import { useEffect, useState } from 'react';
import { layout, type FieldMode, type ShapeSpec } from './shapes';

const fill = (s: ShapeSpec) => `var(--${s.color})`;

function useViewport() {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [size, setSize] = useState(read);
  useEffect(() => {
    // Phones resize the viewport as the address bar slides; only redraw on a real change.
    const onResize = () =>
      setSize((s) => {
        const n = read();
        return Math.abs(n.w - s.w) > 40 || Math.abs(n.h - s.h) > 120 ? n : s;
      });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

/** One shape at the origin, drawn in its own coordinates (y down). */
function Shape({ spec, i }: { spec: ShapeSpec; i: number }) {
  const s = spec.size;
  const c = fill(spec);
  switch (spec.kind) {
    case 'sphere':
      return (
        <g>
          <circle r={s} style={{ fill: c }} />
          <circle r={s} fill="url(#field-shade)" />
          <circle r={s} fill="url(#field-light)" />
        </g>
      );
    case 'box': {
      // A rounded cube turned to show three faces: top lit, left in color, right in shade.
      const a = s * 0.62;
      const top = `0,${-a * 1.15} ${a},${-a * 0.58} 0,0 ${-a},${-a * 0.58}`;
      const left = `${-a},${-a * 0.58} 0,0 0,${a * 1.15} ${-a},${a * 0.58}`;
      const right = `${a},${-a * 0.58} ${a},${a * 0.58} 0,${a * 1.15} 0,0`;
      const join = { strokeLinejoin: 'round' as const, strokeWidth: s * 0.18 };
      return (
        <g transform={`rotate(${((i * 23) % 40) - 20})`}>
          <polygon points={left} style={{ fill: c, stroke: c, ...join }} />
          <polygon points={right} style={{ fill: c, stroke: c, ...join }} />
          <polygon points={right} style={{ fill: 'var(--ink)', opacity: 0.22 }} />
          <polygon points={top} style={{ fill: c, stroke: c, ...join }} />
          <polygon points={top} style={{ fill: 'var(--card)', opacity: 0.3 }} />
        </g>
      );
    }
    case 'torus':
      // A ring tilted toward the light.
      return (
        <g transform={`rotate(${-18 + i * 7})`}>
          <ellipse rx={s} ry={s * 0.62} fill="none" style={{ stroke: c }} strokeWidth={s * 0.64} />
          <ellipse
            rx={s}
            ry={s * 0.62}
            fill="none"
            stroke="url(#field-band)"
            strokeWidth={s * 0.64}
          />
        </g>
      );
    case 'capsule': {
      const h = s * 2.3 + s * 2;
      return (
        <g transform={`rotate(${28 + i * 9})`}>
          <rect x={-s} y={-h / 2} width={s * 2} height={h} rx={s} style={{ fill: c }} />
          <rect x={-s} y={-h / 2} width={s * 2} height={h} rx={s} fill="url(#field-side)" />
        </g>
      );
    }
    case 'pyramid': {
      const h = s * 1.7;
      const apex = `0,${-h / 2}`;
      const lit = `${apex} ${-s},${h / 2 - s * 0.12} ${s * 0.12},${h / 2 + s * 0.1}`;
      const dark = `${apex} ${s * 0.12},${h / 2 + s * 0.1} ${s},${h / 2 - s * 0.12}`;
      const join = { strokeLinejoin: 'round' as const, strokeWidth: s * 0.08 };
      return (
        <g transform={`rotate(${((i * 17) % 30) - 15})`}>
          <polygon points={lit} style={{ fill: c, stroke: c, ...join }} />
          <polygon points={dark} style={{ fill: c, stroke: c, ...join }} />
          <polygon points={dark} style={{ fill: 'var(--ink)', opacity: 0.22 }} />
          <polygon points={lit} style={{ fill: 'var(--card)', opacity: 0.12 }} />
        </g>
      );
    }
  }
}

/** The field as a picture: fixed behind the page, never in the way of a click. */
export function StillField({ mode }: { mode: FieldMode }) {
  const { w, h } = useViewport();
  const specs = layout(mode, w, h);
  return (
    <svg
      aria-hidden="true"
      data-field-still={mode}
      className="pointer-events-none fixed inset-0 z-0 size-full"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id="field-light" cx="0.36" cy="0.3" r="0.55">
          <stop offset="0" style={{ stopColor: 'var(--card)', stopOpacity: 0.6 }} />
          <stop offset="1" style={{ stopColor: 'var(--card)', stopOpacity: 0 }} />
        </radialGradient>
        <radialGradient id="field-shade" cx="0.4" cy="0.36" r="0.68">
          <stop offset="0.55" style={{ stopColor: 'var(--ink)', stopOpacity: 0 }} />
          <stop offset="1" style={{ stopColor: 'var(--ink)', stopOpacity: 0.3 }} />
        </radialGradient>
        <linearGradient id="field-band" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--card)', stopOpacity: 0.4 }} />
          <stop offset="0.45" style={{ stopColor: 'var(--card)', stopOpacity: 0 }} />
          <stop offset="1" style={{ stopColor: 'var(--ink)', stopOpacity: 0.28 }} />
        </linearGradient>
        <linearGradient id="field-side" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: 'var(--card)', stopOpacity: 0.35 }} />
          <stop offset="0.5" style={{ stopColor: 'var(--card)', stopOpacity: 0 }} />
          <stop offset="1" style={{ stopColor: 'var(--ink)', stopOpacity: 0.26 }} />
        </linearGradient>
      </defs>
      {specs.map((spec, i) => (
        <g key={spec.id} transform={`translate(${w / 2 + spec.x} ${h / 2 - spec.y})`}>
          <Shape spec={spec} i={i} />
        </g>
      ))}
    </svg>
  );
}

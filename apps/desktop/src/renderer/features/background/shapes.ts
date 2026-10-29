// The floating shapes behind the UI (SPEC §6.12). Sizes are in CSS pixels: the scene uses
// an orthographic camera where one world unit is one pixel, with the origin at the center.

export type ShapeKind = 'sphere' | 'box' | 'torus' | 'capsule' | 'pyramid';
export type FieldMode = 'lively' | 'calm' | 'still';

/** Token names, read from tokens.css at runtime so no color is hard-coded. */
export type ShapeColor = 'coral' | 'cobalt' | 'sun' | 'mint' | 'lilac' | 'wine' | 'neutral-ink';

export interface ShapeSpec {
  id: string;
  kind: ShapeKind;
  color: ShapeColor;
  /** Base size in px: radius for spheres, edge for boxes, outer radius for tori. */
  size: number;
  x: number;
  y: number;
}

const BIG: Omit<ShapeSpec, 'id' | 'x' | 'y'>[] = [
  { kind: 'sphere', color: 'coral', size: 62 },
  { kind: 'box', color: 'cobalt', size: 100 },
  { kind: 'torus', color: 'sun', size: 70 },
  { kind: 'capsule', color: 'mint', size: 30 },
  { kind: 'pyramid', color: 'lilac', size: 58 },
];

const SMALL: Omit<ShapeSpec, 'id' | 'x' | 'y'>[] = [
  { kind: 'sphere', color: 'mint', size: 12 },
  { kind: 'box', color: 'coral', size: 22 },
  { kind: 'sphere', color: 'sun', size: 9 },
  { kind: 'box', color: 'lilac', size: 18 },
  { kind: 'sphere', color: 'cobalt', size: 10 },
];

/** A small deterministic random source, so layouts (and screenshots) are stable. */
export function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/**
 * Starting layout. Lively: 10 shapes anywhere. Calm and still: 6 shapes biased to the edges,
 * where the gutters around the panels show them (§4, §6.12).
 */
export function layout(mode: FieldMode, width: number, height: number): ShapeSpec[] {
  const rand = seeded(mode === 'lively' ? 7 : 11);
  const scale = mode === 'lively' ? 1 : 0.8;
  const picks = mode === 'lively' ? [...BIG, ...SMALL] : [...BIG, ...SMALL.slice(0, 1)];
  const hw = width / 2;
  const hh = height / 2;
  return picks.map((spec, i) => {
    let x: number;
    let y: number;
    if (mode === 'lively') {
      x = (rand() * 2 - 1) * (hw - 120);
      y = (rand() * 2 - 1) * (hh - 120);
    } else {
      // Alternate edges: left, right, top, bottom, close to the window border.
      const edge = i % 4;
      const along = rand() * 2 - 1;
      const inset = 40 + rand() * 40;
      x = edge === 0 ? -hw + inset : edge === 1 ? hw - inset : along * (hw - 120);
      y = edge === 2 ? hh - inset : edge === 3 ? -hh + inset : along * (hh - 120);
    }
    return { ...spec, id: `${spec.kind}-${i}`, size: spec.size * scale, x, y };
  });
}

/** Severity → the color of the shape that drops in for a new finding (§6.12). */
export const SEVERITY_COLOR: Record<number, ShapeColor> = {
  4: 'wine',
  3: 'coral',
  2: 'sun',
  1: 'neutral-ink',
  0: 'neutral-ink',
};

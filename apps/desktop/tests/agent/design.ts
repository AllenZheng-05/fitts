// A direction for tests, resolved from real library parts (calm, warm, Japandi-like).
import { resolve, type Parts } from '@fitts/styles';
import type { Direction } from '../../src/agent/review/themefit';

export const CALM_PARTS: Parts = {
  color: 'earth-neutral',
  type: 'japandi',
  shape: 'organic',
  layout: 'gallery',
  decor: [],
  motion: 'quiet',
  density: 'airy',
};

export function testDirection(id: string, name: string, notes = 'Quiet and warm.'): Direction {
  const spec = resolve({ name, notes, parts: CALM_PARTS });
  const p = spec.palette;
  return {
    id,
    name,
    kind: 'closest',
    swatches: [p.bg, p.text, p.accent, p.accent2],
    typeface: spec.type.heading.family,
    notes,
    spec,
  };
}

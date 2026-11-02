// The device matrix (SPEC-phase4 §6.3): which screens a run checks every page at, chosen from
// what the site's CSS says (its breakpoints, whether it has dark or reduced-motion rules) and
// what the App Model read from the code. Pure: no site, no window.
import type { DeviceCell } from '@fitts/schema';

export interface MatrixInput {
  /** Width conditions from `@media`/`@container` rules, with how many rules use each. */
  breakpoints: { width: number; uses: number }[];
  /** The site has a `prefers-color-scheme` rule. */
  dark?: boolean;
  /** The site has a `prefers-reduced-motion` rule. */
  reducedMotion?: boolean;
}

/** At most this many cells per run; every reached page gets the cheap probes in each. */
export const MAX_CELLS = 10;
/** Two plain-width cells closer than this are the same cell. */
export const DEDUPE_PX = 8;
/** The most-used breakpoints get a cell just under and one at the width (≤ 4). */
export const MAX_BREAKPOINTS = 4;

const plain = (c: DeviceCell) =>
  !c.zoom && !c.textSpacing && !c.scheme && !c.motion && c.orientation !== 'landscape';

const cell = (
  id: string,
  label: string,
  width: number,
  height: number,
  extra: Partial<DeviceCell> = {},
): DeviceCell => {
  const mobile = extra.mobile ?? width < 600;
  return { id, label, width, height, mobile, touch: extra.touch ?? mobile, ...extra };
};

/** A width's cell: a phone-sized one is mobile and touch; the rest a desktop browser. */
export function cellForWidth(width: number, tag: string): DeviceCell {
  const w = Math.max(240, Math.round(width));
  const h = w < 600 ? Math.round(w * 2.1) : w < 1000 ? Math.round(w * 1.3) : 800;
  return cell(`w${w}`, `${tag} · ${w}×${h}`, w, h);
}

/**
 * The cells, in the order they're run. Rules 1–7 of §6.3, capped at 10 and deduped within 8px.
 * When the breakpoints would push past the cap, the 1440 desktop goes first (1280 already
 * covers a wide screen), then the landscape phone, then the least-used pairs.
 */
export function chooseCells(input: MatrixInput): DeviceCell[] {
  const bps = [...input.breakpoints]
    .filter((b) => Number.isFinite(b.width) && b.width >= 240 && b.width <= 2600)
    .sort((a, b) => b.uses - a.uses || a.width - b.width)
    .slice(0, MAX_BREAKPOINTS);
  const base: DeviceCell[] = [
    cell('reflow-320', 'Reflow · 320×640', 320, 640, { mobile: true, touch: true }),
    cell('phone', 'iPhone · 390×844', 390, 844, { mobile: true, touch: true }),
    cell('phone-landscape', 'iPhone landscape · 844×390', 844, 390, {
      mobile: true,
      touch: true,
      orientation: 'landscape',
    }),
  ];
  const pairs = bps.map((b) => [
    cellForWidth(b.width - 1, 'Just under the breakpoint'),
    cellForWidth(b.width, 'At the breakpoint'),
  ]);
  const wide: DeviceCell[] = [
    cell('laptop', 'Laptop · 1280×800', 1280, 800, { mobile: false, touch: false }),
    cell('desktop', 'Desktop · 1440×900', 1440, 900, { mobile: false, touch: false }),
  ];
  const special: DeviceCell[] = [
    cell('zoom-200', 'Text at 200% · 1280 wide', 1280, 800, {
      mobile: false,
      touch: false,
      zoom: 2,
    }),
    cell('text-spacing', 'Text spacing · 1280 wide', 1280, 800, {
      mobile: false,
      touch: false,
      textSpacing: true,
    }),
    ...(input.dark
      ? [
          cell('dark', 'Dark · 1280×800', 1280, 800, {
            mobile: false,
            touch: false,
            scheme: 'dark',
          }),
        ]
      : []),
    ...(input.reducedMotion
      ? [
          cell('reduced-motion', 'Reduced motion · 1280×800', 1280, 800, {
            mobile: false,
            touch: false,
            motion: 'reduce',
          }),
        ]
      : []),
  ];
  let cells = [...base, ...pairs.flat(), ...wide, ...special];
  cells = dedupe(cells, new Set(pairs.flat().map((c) => c.id)));
  // Over the cap: the 1440 desktop goes first (1280 already covers a wide screen), then the
  // landscape phone, then the least-used breakpoint pairs.
  if (cells.length > MAX_CELLS) cells = cells.filter((c) => c.id !== 'desktop');
  if (cells.length > MAX_CELLS) cells = cells.filter((c) => c.id !== 'phone-landscape');
  let drop = pairs.length - 1;
  while (cells.length > MAX_CELLS && drop >= 0) {
    const gone = new Set(pairs[drop]!.map((c) => c.id));
    cells = cells.filter((c) => !gone.has(c.id));
    drop -= 1;
  }
  return cells.slice(0, MAX_CELLS);
}

/**
 * Plain-width cells within 8px of another are the same screen, so the later one goes. The
 * breakpoint pairs are pinned: B−1 and B are two layouts on purpose, and a fixed cell near
 * either of them is what goes.
 */
export function dedupe(cells: DeviceCell[], pinned = new Set<string>()): DeviceCell[] {
  const kept: DeviceCell[] = [];
  const ids = new Set<string>();
  const order = [
    ...cells.filter((c) => pinned.has(c.id)),
    ...cells.filter((c) => !pinned.has(c.id)),
  ];
  for (const c of order) {
    if (ids.has(c.id)) continue;
    const same =
      plain(c) &&
      !pinned.has(c.id) &&
      kept.some((o) => plain(o) && Math.abs(o.width - c.width) < DEDUPE_PX);
    if (same) continue;
    ids.add(c.id);
    kept.push(c);
  }
  const keep = new Set(kept.map((c) => c.id));
  return cells.filter((c, i) => keep.has(c.id) && cells.findIndex((x) => x.id === c.id) === i);
}

/** The widths named by `@media` conditions in a stylesheet's text, with how often each appears. */
export function widthsFromCss(css: string): { width: number; uses: number }[] {
  const counts = new Map<number, number>();
  const re =
    /\((?:min|max)-width\s*:\s*(\d+(?:\.\d+)?)(px|em|rem)\)|\(width\s*[<>]=?\s*(\d+(?:\.\d+)?)(px|em|rem)\)|(\d+(?:\.\d+)?)(px|em|rem)\s*[<>]=?\s*width/g;
  for (const m of css.matchAll(re)) {
    const n = Number(m[1] ?? m[3] ?? m[5]);
    const unit = m[2] ?? m[4] ?? m[6];
    if (!Number.isFinite(n)) continue;
    const px = unit === 'px' ? n : n * 16;
    const w = Math.round(px);
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts].map(([width, uses]) => ({ width, uses })).sort((a, b) => a.width - b.width);
}

/** Detected breakpoints merged with the App Model's: uses add up, widths within 8px merge. */
export function mergeBreakpoints(
  detected: { width: number; uses: number }[],
  model: number[] = [],
): { width: number; uses: number }[] {
  const out: { width: number; uses: number }[] = [];
  const add = (width: number, uses: number) => {
    const near = out.find((b) => Math.abs(b.width - width) < DEDUPE_PX);
    if (near) near.uses += uses;
    else out.push({ width, uses });
  };
  for (const d of detected) add(d.width, d.uses);
  for (const w of model) add(w, 1);
  return out.sort((a, b) => a.width - b.width);
}

/** The environment-line pieces of a cell (SPEC-phase4 §5.1). */
export function cellWords(c: DeviceCell): string {
  const parts = [
    `${c.width}×${c.height}`,
    c.touch ? 'touch' : 'mouse',
    c.scheme ?? 'light',
    `${(c.zoom ?? 1) * 100}%`,
  ];
  if (c.textSpacing) parts.push('text spacing');
  if (c.motion === 'reduce') parts.push('reduced motion');
  if (c.orientation === 'landscape') parts.push('landscape');
  return parts.join(' · ');
}

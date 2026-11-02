// Android probes (SPEC-phase4 §9.3): pure functions over a parsed `uiautomator dump` and the
// screen's pixels. Bounds are device pixels; dp = px / (density / 160). Each returns probe items
// in the same shape the web probes do, so the aggregator, templates and repros work unchanged.
import type { ProbeItem } from '@fitts/schema';

/** One node of a uiautomator dump. */
export interface AndroidNode {
  /** resource-id (React Native's testID), else a stable a<n> for the screen. */
  ref: string;
  /** "android.widget.TextView", "android.view.ViewGroup", ... */
  cls: string;
  text: string;
  desc: string;
  bounds: { x: number; y: number; w: number; h: number };
  clickable: boolean;
  focusable: boolean;
  enabled: boolean;
  checked?: boolean;
  children: AndroidNode[];
}

const MIN_DP = 48;

const short = (cls: string) => cls.split('.').pop() ?? cls;
/** Icon fonts draw from the Private Use Area: a glyph is nothing a screen reader can say. */
export const sayable = (s: string) => s.replace(/[\uE000-\uF8FF\u200B-\u200D\uFEFF]/g, '').trim();
const speak = (n: AndroidNode) => sayable(n.text) || sayable(n.desc);
const dp = (px: number, density: number) => px / (density / 160);

export function flatten(root: AndroidNode): AndroidNode[] {
  const out: AndroidNode[] = [];
  const walk = (n: AndroidNode) => {
    out.push(n);
    n.children.forEach(walk);
  };
  walk(root);
  return out;
}

/** Text a screen reader would find inside a node (its own, else its descendants'). */
export function spoken(n: AndroidNode): string {
  if (speak(n)) return speak(n);
  return n.children.map(spoken).filter(Boolean).join(' ').trim();
}

const item = (n: AndroidNode, measured: string, expected: string): ProbeItem => ({
  ref: n.ref,
  selector: short(n.cls),
  measured,
  expected,
});

const label = (n: AndroidNode) => {
  const s = spoken(n);
  return s ? `"${s.slice(0, 40)}"` : `the ${short(n.cls)} ${n.ref}`;
};

/** Clickable targets under 48dp in either dimension. */
export function androidTarget(nodes: AndroidNode[], density: number): ProbeItem[] {
  return nodes
    .filter((n) => n.clickable && n.enabled && n.bounds.w > 0 && n.bounds.h > 0)
    .filter((n) => dp(n.bounds.w, density) < MIN_DP || dp(n.bounds.h, density) < MIN_DP)
    .map((n) =>
      item(
        n,
        `${label(n)} is ${Math.round(dp(n.bounds.w, density))}×${Math.round(dp(n.bounds.h, density))}dp`,
        `at least ${MIN_DP}×${MIN_DP}dp`,
      ),
    );
}

const ICONISH = /ImageView|ImageButton|ViewGroup|View$|Button$/;

/** Clickable or focusable icons and groups with nothing a screen reader can say. */
export function androidLabel(nodes: AndroidNode[]): ProbeItem[] {
  return nodes
    .filter((n) => (n.clickable || n.focusable) && ICONISH.test(n.cls) && !spoken(n))
    .map((n) =>
      item(n, `${label(n)} has no label a screen reader can read`, 'a content description'),
    );
}

/** Two clickable nodes on one screen that say the same thing. */
export function androidDuplicateLabel(nodes: AndroidNode[]): ProbeItem[] {
  const by = new Map<string, AndroidNode[]>();
  for (const n of nodes.filter((x) => x.clickable)) {
    const s = spoken(n).toLowerCase();
    if (s) by.set(s, [...(by.get(s) ?? []), n]);
  }
  return [...by.values()]
    .filter((list) => list.length > 1)
    .map((list) => {
      const first = list[0] as AndroidNode;
      return item(
        first,
        `${list.length} controls are all called ${label(first)}`,
        'each control named for what it does',
      );
    });
}

/** Two clickable nodes with identical bounds (one hides the other from touch and talkback). */
export function androidDuplicateBounds(nodes: AndroidNode[]): ProbeItem[] {
  const by = new Map<string, AndroidNode[]>();
  for (const n of nodes.filter((x) => x.clickable && x.bounds.w > 0 && x.bounds.h > 0)) {
    const k = `${n.bounds.x},${n.bounds.y},${n.bounds.w},${n.bounds.h}`;
    by.set(k, [...(by.get(k) ?? []), n]);
  }
  return [...by.values()]
    .filter((list) => list.length > 1)
    .map((list) => {
      const [a, b] = list as [AndroidNode, AndroidNode];
      return item(
        a,
        `${label(a)} and ${label(b)} are two tap targets in exactly the same place`,
        'one control per place on the screen',
      );
    });
}

/** Text fields with a content description (read instead of what's typed). */
export function androidEditableDesc(nodes: AndroidNode[]): ProbeItem[] {
  return nodes
    .filter((n) => /EditText/.test(n.cls) && n.desc.trim())
    .map((n) =>
      item(
        n,
        `the field ${n.ref} has a content description ("${n.desc.slice(0, 40)}")`,
        'a hint or label instead',
      ),
    );
}

/** The screen's pixels: RGBA, row-major. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

const lum = (r: number, g: number, b: number) => {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

export const ratio = (a: [number, number, number], b: [number, number, number]) => {
  const x = lum(...a);
  const y = lum(...b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/**
 * The two dominant colors in a box (quantized to 16 levels a channel) and how busy it is (how
 * many colors hold ≥ 5% of it). The background is the most common; the text the next.
 */
export function dominant(px: Pixels, b: AndroidNode['bounds']) {
  const counts = new Map<number, { n: number; r: number; g: number; bl: number }>();
  let total = 0;
  const x0 = Math.max(0, b.x);
  const y0 = Math.max(0, b.y);
  const x1 = Math.min(px.width, b.x + b.w);
  const y1 = Math.min(px.height, b.y + b.h);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * px.width + x) * 4;
      const r = px.data[i] ?? 0;
      const g = px.data[i + 1] ?? 0;
      const bl = px.data[i + 2] ?? 0;
      const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (bl >> 4);
      const c = counts.get(k) ?? { n: 0, r: 0, g: 0, bl: 0 };
      c.n += 1;
      c.r += r;
      c.g += g;
      c.bl += bl;
      counts.set(k, c);
      total += 1;
    }
  const ranked = [...counts.values()].sort((a, b2) => b2.n - a.n);
  const mean = (c: { n: number; r: number; g: number; bl: number }): [number, number, number] => [
    c.r / c.n,
    c.g / c.n,
    c.bl / c.n,
  ];
  return {
    bg: ranked[0] ? mean(ranked[0]) : null,
    fg: ranked[1] ? mean(ranked[1]) : null,
    busy: ranked.filter((c) => c.n / Math.max(1, total) >= 0.05).length,
  };
}

/**
 * Text contrast, estimated from the pixels (§9.3): each TextView's two dominant colors. Under
 * 4.5:1, or 3:1 for large text (≥ 18sp, estimated from the box height). A busy box (more than six
 * colors with 5% or more) can't be measured this way and is returned in `busy` (SAM's job).
 */
export function androidContrast(
  nodes: AndroidNode[],
  px: Pixels,
  density: number,
): { items: ProbeItem[]; busy: AndroidNode[] } {
  const items: ProbeItem[] = [];
  const busy: AndroidNode[] = [];
  for (const n of nodes) {
    if (!/TextView/.test(n.cls) || !n.text.trim() || n.bounds.w < 4 || n.bounds.h < 4) continue;
    const d = dominant(px, n.bounds);
    if (!d.bg || !d.fg) continue;
    if (d.busy > 6) {
      busy.push(n);
      continue;
    }
    const r = ratio(d.fg, d.bg);
    const large = dp(n.bounds.h, density) >= 30;
    const need = large ? 3 : 4.5;
    if (r < need)
      items.push(
        item(
          n,
          `"${n.text.slice(0, 40)}" is about ${r.toFixed(1)}:1 (estimate from the screen's pixels)`,
          `at least ${need}:1`,
        ),
      );
  }
  return { items, busy };
}

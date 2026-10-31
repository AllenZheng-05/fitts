// Palettes from a recipe and a seed hue, in OKLCH so a re-hued scheme keeps its lightness and
// contrast. Every palette leaves here with its text pairs at WCAG AA or better.
import type { ColorPart, Palette, Role, Tone } from './types';

type Rgb = [number, number, number];

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** OKLCH to linear sRGB (may be out of gamut). */
function oklchToLinear(l: number, c: number, h: number): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** An OKLCH color as hex, lowering chroma until it fits sRGB. */
export function oklchHex(l: number, c: number, h: number): string {
  let chroma = c;
  let rgb = oklchToLinear(l, chroma, h);
  while (!inGamut(rgb) && chroma > 0) {
    chroma = Math.max(0, chroma - 0.005);
    rgb = oklchToLinear(l, chroma, h);
  }
  return `#${rgb
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, fromLinear(v))) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

const parseHex = (hex: string): Rgb => {
  const n = hex.replace('#', '');
  const full = n.length === 3 ? [...n].map((ch) => ch + ch).join('') : n;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as Rgb;
};

/** Hex to OKLCH, for a brand color the site already has. */
export function hexOklch(hex: string): { l: number; c: number; h: number } {
  const [r, g, b] = parseHex(hex).map(toLinear) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return { l: L, c: Math.hypot(A, B), h: h < 0 ? h + 360 : h };
}

/** WCAG 2 relative luminance and contrast ratio. */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(toLinear) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Text pairs and the ratio each must reach. */
export const CONTRAST_PAIRS: [Role, Role, number][] = [
  ['text', 'bg', 7],
  ['text', 'surface', 4.5],
  ['muted', 'bg', 4.5],
  ['muted', 'surface', 4.5],
  ['accent', 'bg', 3],
  ['onAccent', 'accent', 4.5],
];

const toneHue = (t: Tone, seed: number) => t.h ?? (((seed + (t.dh ?? 0)) % 360) + 360) % 360;

/**
 * The palette for a scheme. `hue` re-seeds a scheme that allows it; `brand` (a hex the site
 * keeps) becomes the accent exactly when it reaches contrast, and seeds the hue either way.
 */
export function palette(scheme: ColorPart, opts: { hue?: number; brand?: string } = {}): Palette {
  const brand = opts.brand && /^#[0-9a-f]{6}$/i.test(opts.brand) ? opts.brand : undefined;
  const seed = scheme.rehue
    ? (opts.hue ?? (brand ? hexOklch(brand).h : undefined) ?? scheme.hue)
    : scheme.hue;
  const tones = { ...scheme.tones };
  const out = {} as Palette;
  for (const [role, t] of Object.entries(tones) as [Role, Tone][])
    out[role] = oklchHex(t.l, t.c, toneHue(t, seed));
  if (brand) out.accent = brand.toLowerCase();
  // Move each foreground away from its background until the pair passes.
  for (const [fg, bg, min] of CONTRAST_PAIRS) {
    const base = tones[fg];
    const bgL = hexOklch(out[bg]).l;
    let l = hexOklch(out[fg]).l;
    const c = fg === 'accent' && brand ? hexOklch(brand).c : base.c;
    const h = fg === 'accent' && brand ? hexOklch(brand).h : toneHue(base, seed);
    const dir = l >= bgL ? 1 : -1;
    for (let i = 0; i < 100 && contrast(out[fg], out[bg]) < min; i++) {
      l = Math.min(1, Math.max(0, l + dir * 0.01));
      out[fg] = oklchHex(l, c, h);
      // Ran out of room on this side: try the other.
      if ((l === 1 || l === 0) && contrast(out[fg], out[bg]) < min) {
        l = bgL;
        for (let j = 0; j < 100 && contrast(out[fg], out[bg]) < min; j++) {
          l = Math.min(1, Math.max(0, l - dir * 0.01));
          out[fg] = oklchHex(l, c, h);
        }
        break;
      }
    }
  }
  return out;
}

/** Color distance (OKLab Euclidean), for "is this palette color on the page". */
export function distance(a: string, b: string): number {
  const x = hexOklch(a);
  const y = hexOklch(b);
  const ax = x.c * Math.cos((x.h * Math.PI) / 180);
  const ay = x.c * Math.sin((x.h * Math.PI) / 180);
  const bx = y.c * Math.cos((y.h * Math.PI) / 180);
  const by = y.c * Math.sin((y.h * Math.PI) / 180);
  return Math.hypot(x.l - y.l, ax - bx, ay - by);
}

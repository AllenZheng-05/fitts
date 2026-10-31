// The design library's shapes. A design is a set of parts, one per kind (decoration can be
// several), composed fresh for each site.

export const PART_KINDS = [
  'color',
  'type',
  'shape',
  'layout',
  'decor',
  'motion',
  'density',
] as const;
export type PartKind = (typeof PART_KINDS)[number];

/** Where a part sits in time. "timeless" goes with every era. */
export type Era = 'classical' | 'vintage' | 'retro' | 'modern' | 'futuristic' | 'timeless';

/** The axes compatibility is judged on. */
export interface Mood {
  /** 1 calm and quiet … 5 loud and kinetic. */
  energy: 1 | 2 | 3 | 4 | 5;
  /** 1 casual and silly … 5 formal and serious. */
  formality: 1 | 2 | 3 | 4 | 5;
  eras: Era[];
}

export interface PartBase extends Mood {
  id: string;
  kind: PartKind;
  name: string;
  /** What it is and when it's right, in two or three sentences. */
  description: string;
  /** Words a brief might use that point here ("calm", "kids", "bank", "gothic"). */
  keywords: string[];
  /** Concrete rules the redesigner follows. */
  rules: string[];
  /** What this part never does. */
  never: string[];
  /** Part ids this one is known to clash with, whatever the axes say. */
  clashes?: string[];
}

/** A color role as OKLCH: lightness 0–1, chroma 0–0.37, hue as an offset from the seed hue. */
export interface Tone {
  l: number;
  c: number;
  /** Degrees added to the seed hue (default 0). */
  dh?: number;
  /** A fixed hue, ignoring the seed (Bauhaus red stays red). */
  h?: number;
}

export const ROLES = [
  'bg',
  'surface',
  'text',
  'muted',
  'border',
  'accent',
  'onAccent',
  'accent2',
] as const;
export type Role = (typeof ROLES)[number];
export type Palette = Record<Role, string>;

export interface ColorPart extends PartBase {
  kind: 'color';
  mode: 'light' | 'dark';
  /** The default seed hue, 0–360, used when the site has no brand color. */
  hue: number;
  /** False when the scheme only works in its own hues (blueprint blue, phosphor green). */
  rehue: boolean;
  tones: Record<Role, Tone>;
}

export interface FontRef {
  family: string;
  /** The Fontsource id the files come from. */
  id: string;
  weights: number[];
  /** CSS fallback stack after the family. */
  fallback: string;
}

export interface TypePart extends PartBase {
  kind: 'type';
  heading: FontRef;
  body: FontRef;
  /** A third face for labels, code or handwriting, when the pairing has one. */
  accent?: FontRef;
  /** Font sizes in px, smallest first; at most 6. */
  scale: number[];
  lineHeight: { heading: number; body: number };
  /** Letter spacing for headings, in em. */
  tracking: number;
  /** Heading case. */
  case: 'none' | 'upper' | 'small-caps';
}

export interface ShapePart extends PartBase {
  kind: 'shape';
  radius: { control: string; card: string };
  border: string;
  shadow: string;
  /** How buttons, cards, inputs and navigation look in this shape language. */
  components: { button: string; card: string; input: string; nav: string };
  css: string;
}

export interface LayoutPart extends PartBase {
  kind: 'layout';
  /** Max content width in px. */
  width: number;
  /** How pages are composed: hero, sections, grid, rhythm. */
  composition: string[];
}

export interface DecorPart extends PartBase {
  kind: 'decor';
  /** Needs three.js copied into the project (Fitts does it). */
  three?: boolean;
  css?: string;
}

export interface MotionPart extends PartBase {
  kind: 'motion';
  /** Duration range in ms and the easing curve. */
  duration: [number, number];
  easing: string;
}

export interface DensityPart extends PartBase {
  kind: 'density';
  /** The spacing scale in px. */
  space: number[];
  /** Vertical space between page sections, in px at desktop and phone width. */
  section: [number, number];
}

export type Part =
  ColorPart | TypePart | ShapePart | LayoutPart | DecorPart | MotionPart | DensityPart;

/** The parts of one design. */
export interface Parts {
  color: string;
  type: string;
  shape: string;
  layout: string;
  decor: string[];
  motion: string;
  density: string;
}

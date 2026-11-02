// Which success criterion each probe measures (SPEC-phase4 §5.1): a static table from probe
// and axe rule ids to WCAG 2.2 criteria, with the W3C Understanding page and Deque's rule page,
// so every repro can say what standard it's about. A probe mapped to `null` is a usability
// check (a Nielsen heuristic), not a WCAG one.
import type { ProbeName } from '@fitts/schema';

export interface Criterion {
  /** "1.4.3" */
  sc: string;
  name: string;
  level: 'A' | 'AA';
  url: string;
}

const understanding = (slug: string) => `https://www.w3.org/WAI/WCAG22/Understanding/${slug}`;

/** The criteria Fitts's probes and axe's rules touch, by number. */
export const WCAG: Record<string, Criterion> = {
  '1.1.1': {
    sc: '1.1.1',
    name: 'Non-text Content',
    level: 'A',
    url: understanding('non-text-content'),
  },
  '1.3.1': {
    sc: '1.3.1',
    name: 'Info and Relationships',
    level: 'A',
    url: understanding('info-and-relationships'),
  },
  '1.3.4': { sc: '1.3.4', name: 'Orientation', level: 'AA', url: understanding('orientation') },
  '1.3.5': {
    sc: '1.3.5',
    name: 'Identify Input Purpose',
    level: 'AA',
    url: understanding('identify-input-purpose'),
  },
  '1.4.2': { sc: '1.4.2', name: 'Audio Control', level: 'A', url: understanding('audio-control') },
  '1.4.3': {
    sc: '1.4.3',
    name: 'Contrast (Minimum)',
    level: 'AA',
    url: understanding('contrast-minimum'),
  },
  '1.4.4': { sc: '1.4.4', name: 'Resize Text', level: 'AA', url: understanding('resize-text') },
  '1.4.10': { sc: '1.4.10', name: 'Reflow', level: 'AA', url: understanding('reflow') },
  '1.4.12': { sc: '1.4.12', name: 'Text Spacing', level: 'AA', url: understanding('text-spacing') },
  '2.1.1': { sc: '2.1.1', name: 'Keyboard', level: 'A', url: understanding('keyboard') },
  '2.1.2': {
    sc: '2.1.2',
    name: 'No Keyboard Trap',
    level: 'A',
    url: understanding('no-keyboard-trap'),
  },
  '2.2.1': {
    sc: '2.2.1',
    name: 'Timing Adjustable',
    level: 'A',
    url: understanding('timing-adjustable'),
  },
  '2.4.1': { sc: '2.4.1', name: 'Bypass Blocks', level: 'A', url: understanding('bypass-blocks') },
  '2.4.2': { sc: '2.4.2', name: 'Page Titled', level: 'A', url: understanding('page-titled') },
  '2.4.3': { sc: '2.4.3', name: 'Focus Order', level: 'A', url: understanding('focus-order') },
  '2.4.4': {
    sc: '2.4.4',
    name: 'Link Purpose (In Context)',
    level: 'A',
    url: understanding('link-purpose-in-context'),
  },
  '2.4.6': {
    sc: '2.4.6',
    name: 'Headings and Labels',
    level: 'AA',
    url: understanding('headings-and-labels'),
  },
  '2.4.7': { sc: '2.4.7', name: 'Focus Visible', level: 'AA', url: understanding('focus-visible') },
  '2.4.11': {
    sc: '2.4.11',
    name: 'Focus Not Obscured (Minimum)',
    level: 'AA',
    url: understanding('focus-not-obscured-minimum'),
  },
  '2.5.3': { sc: '2.5.3', name: 'Label in Name', level: 'A', url: understanding('label-in-name') },
  '2.5.8': {
    sc: '2.5.8',
    name: 'Target Size (Minimum)',
    level: 'AA',
    url: understanding('target-size-minimum'),
  },
  '3.1.1': {
    sc: '3.1.1',
    name: 'Language of Page',
    level: 'A',
    url: understanding('language-of-page'),
  },
  '3.2.1': { sc: '3.2.1', name: 'On Focus', level: 'A', url: understanding('on-focus') },
  '3.2.2': { sc: '3.2.2', name: 'On Input', level: 'A', url: understanding('on-input') },
  '3.2.4': {
    sc: '3.2.4',
    name: 'Consistent Identification',
    level: 'AA',
    url: understanding('consistent-identification'),
  },
  '3.3.1': {
    sc: '3.3.1',
    name: 'Error Identification',
    level: 'A',
    url: understanding('error-identification'),
  },
  '3.3.2': {
    sc: '3.3.2',
    name: 'Labels or Instructions',
    level: 'A',
    url: understanding('labels-or-instructions'),
  },
  '3.3.3': {
    sc: '3.3.3',
    name: 'Error Suggestion',
    level: 'AA',
    url: understanding('error-suggestion'),
  },
  '4.1.2': {
    sc: '4.1.2',
    name: 'Name, Role, Value',
    level: 'A',
    url: understanding('name-role-value'),
  },
  '4.1.3': {
    sc: '4.1.3',
    name: 'Status Messages',
    level: 'AA',
    url: understanding('status-messages'),
  },
};

/**
 * Each probe's criteria (`null`: a usability check with no WCAG criterion). Every ProbeName
 * must be here: the type makes a new probe fail to compile until it says.
 */
export const PROBE_STANDARDS: Record<ProbeName, string[] | null> = {
  contrast: ['1.4.3'],
  'target-size': ['2.5.8'],
  'fitts-id': null,
  'font-inventory': null,
  spacing: null,
  'label-consistency': ['3.2.4'],
  'feedback-timing': ['4.1.3'],
  'back-mid-flow': null,
  'error-message': ['3.3.1', '3.3.3'],
  'placeholder-leak': null,
  'focus-visible': ['2.4.7'],
  'button-name': ['4.1.2'],
  'link-name': ['2.4.4', '4.1.2'],
  links: null,
  network: null,
  'web-vitals': null,
  'viewport-sweep': ['1.4.10'],
  'text-spacing': ['1.4.12'],
  'resize-text': ['1.4.4'],
  orientation: ['1.3.4'],
  // From the axe rule's own tags (axeStandards), per item.
  axe: null,
  keyboard: ['2.1.1', '2.1.2', '2.4.3'],
  navigation: null,
  surprise: ['3.2.1', '3.2.2', '2.2.1', '1.4.2'],
  state: null,
  perf: null,
};

/** The criteria for a probe's finding (empty for a usability check). */
export function probeStandards(probe: ProbeName): Criterion[] {
  return (PROBE_STANDARDS[probe] ?? []).flatMap((sc) => (WCAG[sc] ? [WCAG[sc]] : []));
}

/** "wcag143" → "1.4.3" (axe's tag form); other tags are ignored. */
export function scFromAxeTag(tag: string): string | undefined {
  const m = /^wcag(\d)(\d)(\d{1,2})$/.exec(tag);
  if (!m) return undefined;
  return `${m[1]}.${m[2]}.${Number(m[3])}`;
}

/** The criteria an axe violation's tags name (those Fitts knows the Understanding page for). */
export function axeStandards(tags: string[]): Criterion[] {
  const out: Criterion[] = [];
  for (const tag of tags) {
    const sc = scFromAxeTag(tag);
    const c = sc ? WCAG[sc] : undefined;
    if (c && !out.some((x) => x.sc === c.sc)) out.push(c);
  }
  return out;
}

/** Deque's page for an axe rule. */
export const axeRuleUrl = (ruleId: string, helpUrl?: string) =>
  helpUrl ?? `https://dequeuniversity.com/rules/axe/4.10/${ruleId}`;

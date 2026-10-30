// Pure probe math and analyses (SPEC-phase2 §7). The page script uses the measurement helpers;
// the agent runs the cross-step analyses (network, feedback timing, label consistency, Fitts ID)
// over what main recorded. No DOM, no I/O: everything here is unit-tested on plain data.
import type { ProbeItem, ProbeName } from '@fitts/schema';

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** The probes the page script runs on its own. */
export type PageProbeName =
  | 'contrast'
  | 'target-size'
  | 'button-name'
  | 'link-name'
  | 'placeholder-leak'
  | 'font-inventory'
  | 'spacing'
  | 'web-vitals';

export const PAGE_PROBES: PageProbeName[] = [
  'contrast',
  'target-size',
  'button-name',
  'link-name',
  'placeholder-leak',
  'font-inventory',
  'spacing',
  'web-vitals',
];

/** A probe result before the agent gives it a route and an evidence id. */
export interface PageProbeResult {
  probe: ProbeName;
  pass: boolean;
  items: ProbeItem[];
  summary?: string | undefined;
}

/** What changed on the page after an action (read in the page, timed from the action). */
export interface Feedback {
  /** First DOM change after the action, or null if nothing changed. */
  firstChangeMs: number | null;
  /** When a loading indicator first showed, or null. */
  busyMs: number | null;
  /** Text that appeared (newest last, trimmed). */
  added: string[];
  /** Text announced in a live region (role=status/alert, aria-live). */
  live: string[];
  /** Generic error text that appeared ("Error 0x3F"), as probe items. */
  errors: ProbeItem[];
}

/** One request main saw on the site, tagged with the route and the action that caused it. */
export interface RequestRecord {
  url: string;
  method: string;
  route: string;
  /** The ref of the control being used when it started, if any. */
  ref?: string;
  type: string;
  status: number;
  startMs: number;
  endMs: number | null;
  bytes: number;
  cacheControl?: string;
  etag?: string;
  /** The longest JSON array in the body (top level or one level down), if it was read. */
  arrayItems?: number;
}

// ── Measurement helpers ─────────────────────────────────────────────────────

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (c: Rgba) =>
  0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);

/** WCAG contrast ratio of two opaque colors. */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Template and serialization leaks people should never see. */
export const LEAK = /\((?:null|undefined)\)|^null$|\bundefined\b|\bNaN\b|\[object Object\]|\{\{/;

const GENERIC_ERROR =
  /\berror\b[\s:#-]*(?:code\s*)?(?:0x[0-9a-f]+|\d{3,})\b|something went wrong|an error (?:has )?occurred|^bad request$|^invalid input$|^error\.?$/i;

/** Error text that says nothing useful ("Error 0x3F", "Something went wrong"). */
export const isGenericError = (text: string) => GENERIC_ERROR.test(text.trim());

/** Spacing values off the 4px grid (1 and 2px hairlines don't count). */
export const offGridValues = (values: number[]) =>
  [...new Set(values)].filter((v) => v > 2 && v % 4 !== 0).sort((a, b) => a - b);

/** Fitts's index of difficulty, in bits: log₂(D/W + 1). */
export const fittsId = (distance: number, width: number) =>
  Math.log2(distance / Math.max(1, width) + 1);

// ── Cross-step analyses (run by the agent) ──────────────────────────────────

const site = (ref: string, measured: string, expected: string): ProbeItem => ({
  ref,
  selector: '',
  measured,
  expected,
});

/** Short text that says an action worked ("Message sent", "Saved", "Done!"). */
const CONFIRMS =
  /^(?:\W\s*)?(?:[\w-]+\s+){0,2}(?:sent|saved|added|created|deleted|removed|updated|posted)\b|^(?:done|success|thanks)\b[.!]?$/i;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface ActionTrace {
  ref: string;
  name: string;
  kind: 'click' | 'type';
  feedback: Feedback | null;
  navigated: boolean;
  /** Requests that started during the action (and its settle time). */
  requests: RequestRecord[];
  /** Characters typed (type actions). */
  chars?: number;
}

/**
 * Feedback timing (H1), from one action's trace:
 * - a request over 1s with nothing on screen by 1s (no loading indicator);
 * - a change that saves something with no confirmation;
 * - a button that changed nothing at all.
 */
export function feedbackTiming(t: ActionTrace): ProbeItem[] {
  const items: ProbeItem[] = [];
  const fb = t.feedback;
  const slow = t.requests.filter((r) => r.endMs !== null && r.endMs - r.startMs > 1000);
  if (slow.length > 0) {
    const dur = Math.max(...slow.map((r) => (r.endMs ?? 0) - r.startMs));
    const shown = fb?.busyMs !== null && fb?.busyMs !== undefined && fb.busyMs <= 1000;
    if (!shown)
      items.push(
        site(
          t.ref,
          `${(dur / 1000).toFixed(1)}s wait with no loading indicator`,
          'a loading indicator within 1s',
        ),
      );
  }
  const saved = t.requests.some((r) => MUTATING.has(r.method) && r.status > 0 && r.status < 400);
  if (saved && t.kind === 'click') {
    const said = [...(fb?.live ?? []), ...(fb?.added ?? []).filter((a) => a.length <= 60)].some(
      (a) => CONFIRMS.test(a),
    );
    if (!said)
      items.push(site(t.ref, `"${t.name}" saved with no confirmation`, 'a message that it worked'));
  }
  if (
    t.kind === 'click' &&
    fb &&
    fb.firstChangeMs === null &&
    !t.navigated &&
    t.requests.length === 0
  )
    items.push(
      site(t.ref, `"${t.name}" changed nothing on screen`, 'a visible response within 0.1s'),
    );
  return items;
}

/** Network problems on one route (H7 and performance). */
export function networkProblems(requests: RequestRecord[], traces: ActionTrace[]): ProbeItem[] {
  const items: ProbeItem[] = [];
  const api = requests.filter((r) => r.type === 'Fetch' || r.type === 'XHR');
  // Requests per keystroke: a request for most characters typed means no debounce.
  for (const t of traces) {
    if (t.kind !== 'type' || !t.chars || t.chars < 3) continue;
    const n = t.requests.filter((r) => r.type === 'Fetch' || r.type === 'XHR').length;
    if (n / t.chars >= 0.5)
      items.push(
        site(
          t.ref,
          `${n} requests for ${t.chars} characters typed`,
          'one request after typing pauses (debounce)',
        ),
      );
  }
  // The same endpoint fetched again and again with nothing to cache it.
  const byEndpoint = new Map<string, RequestRecord[]>();
  for (const r of api) {
    if (r.method !== 'GET') continue;
    const key = r.url.split('?')[0] ?? r.url;
    byEndpoint.set(key, [...(byEndpoint.get(key) ?? []), r]);
  }
  for (const [url, list] of byEndpoint) {
    if (list.length < 2) continue;
    if (list.some((r) => r.cacheControl || r.etag)) continue;
    const path = new URL(url).pathname;
    items.push(
      site(
        list[0]?.ref ?? '',
        `${path} fetched ${list.length} times, no Cache-Control or ETag`,
        'cache headers so repeats are cheap',
      ),
    );
  }
  // Payloads too big to send at once.
  const seen = new Set<string>();
  for (const r of api) {
    const key = r.url.split('?')[0] ?? r.url;
    if (seen.has(key)) continue;
    const big = r.bytes > 1_000_000;
    const many = (r.arrayItems ?? 0) > 1000;
    if (!big && !many) continue;
    seen.add(key);
    const parts = [
      big ? `${(r.bytes / 1_000_000).toFixed(1)} MB` : '',
      many ? `${(r.arrayItems ?? 0).toLocaleString('en-US')} items` : '',
    ].filter(Boolean);
    items.push(
      site(
        r.ref ?? '',
        `${new URL(r.url).pathname} returns ${parts.join(', ')}`,
        'at most 1 MB and 1,000 items (paginate)',
      ),
    );
  }
  return items;
}

const SYNONYMS: string[][] = [
  ['next', 'continue', 'proceed', 'go on'],
  ['send', 'submit', 'post', 'send text', 'send message'],
  ['cancel', 'dismiss', 'never mind'],
  ['back', 'previous', 'go back', 'return'],
  ['delete', 'remove', 'erase', 'trash'],
  ['save', 'update', 'apply', 'store'],
  ['search', 'find', 'look up'],
  ['close', 'done', 'finish'],
  ['add', 'new', 'create'],
];

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Step actions (not names of things, like the contacts in a list). */
const ACTION_WORD =
  /\b(next|continue|proceed|send|submit|create|save|done|finish|confirm|post|add|go|start|ok)\b/i;

export interface ForwardAction {
  route: string;
  ref: string;
  name: string;
  /** Where the click went. */
  to: string;
}

/**
 * Label consistency (H4). Flags:
 * - two differently labeled controls on one page that go to the same place;
 * - three or more labels for the forward step of one flow (/compose, /compose/recipient, …);
 * - synonyms for one action across the site ("Delete" here, "Remove" there).
 */
export function labelConsistency(
  forward: ForwardAction[],
  labels: { route: string; ref: string; name: string }[],
): ProbeItem[] {
  const items: ProbeItem[] = [];
  const flagged = new Set<string>();
  const flag = (a: { ref: string }, measured: string, expected: string) => {
    if (flagged.has(a.ref)) return;
    flagged.add(a.ref);
    items.push(site(a.ref, measured, expected));
  };
  forward = forward.filter((f) => ACTION_WORD.test(f.name));
  const sameTarget = new Map<string, ForwardAction[]>();
  for (const f of forward) {
    const key = `${f.route}→${f.to}`;
    const list = sameTarget.get(key) ?? [];
    if (!list.some((x) => x.ref === f.ref)) list.push(f);
    sameTarget.set(key, list);
  }
  for (const list of sameTarget.values()) {
    const names = [...new Set(list.map((f) => norm(f.name)))];
    if (names.length < 2) continue;
    for (const f of list)
      flag(
        f,
        `"${f.name}" and ${names
          .filter((n) => n !== norm(f.name))
          .map((n) => `"${n}"`)
          .join(', ')} do the same thing on ${f.route}`,
        'one label for one action',
      );
  }
  const flows = new Map<string, ForwardAction[]>();
  for (const f of forward) {
    const head = f.route.split('/').filter(Boolean)[0];
    if (!head) continue;
    flows.set(head, [...(flows.get(head) ?? []), f]);
  }
  for (const [head, list] of flows) {
    const names = [...new Set(list.map((f) => f.name.trim()))];
    if (names.length < 3) continue;
    for (const f of list)
      flag(
        f,
        `the /${head} flow moves on with ${names.map((n) => `"${n}"`).join(', ')}`,
        'the same word for the same step',
      );
  }
  for (const group of SYNONYMS) {
    const used = new Map<string, { ref: string; name: string }>();
    for (const l of labels) {
      const n = norm(l.name);
      if (group.includes(n) && !used.has(n)) used.set(n, l);
    }
    if (used.size < 2) continue;
    const words = [...used.values()].map((l) => `"${l.name}"`).join(' and ');
    for (const l of used.values())
      flag(l, `${words} name the same action`, 'one word for one action');
  }
  return items;
}

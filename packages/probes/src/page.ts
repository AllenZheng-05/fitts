// The in-page probes (SPEC-phase2 §7), bundled with axe-core into one IIFE. Main injects it into
// the site window's isolated world and calls `window.__fittsProbes`; the agent turns what these
// measure into ProbeResults (see analyze.ts). Nothing here changes the page except focus (the
// focus-visible probe restores it) and `data-fitts-ref` attributes (refs, as for the crawler).
import axe from 'axe-core';
import type { ProbeItem } from '@fitts/schema';
import {
  contrastRatio,
  isGenericError,
  LEAK,
  offGridValues,
  type Feedback,
  type PageProbeName,
  type PageProbeResult,
  type Rgba,
} from './analyze';

/** The ref helper main already injects (`REFS` in site-window.ts). */
export interface Refs {
  refOf(el: Element): string;
  find(ref: string): Element | null;
}

const INTERACTIVE =
  'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=switch],[role=checkbox],[role=menuitem]';
const FOCUSABLE = `${INTERACTIVE},[tabindex]:not([tabindex="-1"])`;

const visible = (el: Element): boolean => {
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
};

/** A short CSS path (tag#id or tag.class, up to 3 levels) for people reading the evidence. */
export function selectorOf(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node !== document.body && parts.length < 3) {
    const tag = node.tagName.toLowerCase();
    const ref = node.getAttribute('data-ref');
    if (ref) {
      parts.unshift(`${tag}[data-ref="${ref}"]`);
      break;
    }
    if (node.id) {
      parts.unshift(`${tag}#${node.id}`);
      break;
    }
    const cls = [...node.classList].slice(0, 2).join('.');
    parts.unshift(cls ? `${tag}.${cls}` : tag);
    node = node.parentElement;
  }
  return parts.join(' > ');
}

/** The element a finding should point at: the nearest one with its own ref, else this one. */
const anchorOf = (el: Element): Element =>
  el.closest('[data-ref],[data-testid]') ?? el.closest(INTERACTIVE) ?? el;

function item(F: Refs, el: Element, measured: string, expected: string): ProbeItem {
  const anchor = anchorOf(el);
  const src = anchor.closest('[data-fitts-src]')?.getAttribute('data-fitts-src');
  return {
    ref: F.refOf(anchor),
    selector: selectorOf(anchor),
    measured,
    expected,
    ...(src ? { src } : {}),
  };
}

// ── Color ─────────────────────────────────────────────────────────────────────

let ctx: CanvasRenderingContext2D | null = null;

/** Any CSS color → rgba, via a canvas (no DOM changes). */
export function parseColor(css: string): Rgba | null {
  ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#010203';
  ctx.fillStyle = css;
  const v = String(ctx.fillStyle);
  if (v === '#010203' && !/^#010203$/i.test(css.trim())) return null;
  if (v.startsWith('#')) {
    const n = parseInt(v.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const m = /rgba?\(([^)]+)\)/.exec(v);
  if (!m?.[1]) return null;
  const [r = 0, g = 0, b = 0, a = 1] = m[1].split(',').map((x) => Number(x.trim()));
  return { r, g, b, a };
}

const blend = (top: Rgba, under: Rgba): Rgba => ({
  r: top.r * top.a + under.r * (1 - top.a),
  g: top.g * top.a + under.g * (1 - top.a),
  b: top.b * top.a + under.b * (1 - top.a),
  a: 1,
});

/** The effective background behind an element (ancestors' colors blended over white). */
function backgroundOf(el: Element): Rgba {
  const layers: Rgba[] = [];
  for (let n: Element | null = el; n; n = n.parentElement) {
    const c = parseColor(getComputedStyle(n).backgroundColor);
    if (c && c.a > 0) {
      layers.push(c);
      if (c.a >= 1) break;
    }
  }
  return layers.reduceRight<Rgba>((under, top) => blend(top, under), {
    r: 255,
    g: 255,
    b: 255,
    a: 1,
  });
}

/** Author `::placeholder` colors that apply to this field (the last matching rule wins). */
function placeholderColor(el: Element): string | null {
  let color: string | null = null;
  const visit = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        if (!rule.selectorText.includes('placeholder') || !rule.style.color) continue;
        for (const sel of rule.selectorText.split(',')) {
          if (!sel.includes('placeholder')) continue;
          const base = sel.replace(/::?(-webkit-input-|-moz-)?placeholder/g, '').trim() || '*';
          try {
            if (el.matches(base)) color = rule.style.color;
          } catch {
            // A selector this engine can't match: ignore it.
          }
        }
      } else if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      visit(sheet.cssRules);
    } catch {
      // Cross-origin stylesheet: can't be read.
    }
  }
  return color;
}

// ── Static probes ─────────────────────────────────────────────────────────────

const AXE_RULES = ['color-contrast', 'button-name', 'link-name'];
/** One axe pass per `run` call, shared by the probes that use it. */
let axePass: Promise<axe.AxeResults> | null = null;

async function axeRule(rule: string): Promise<{ el: Element; message: string }[]> {
  axePass ??= axe.run(document, {
    runOnly: { type: 'rule', values: AXE_RULES },
    resultTypes: ['violations'],
  });
  const res = await axePass;
  const out: { el: Element; message: string }[] = [];
  for (const v of res.violations.filter((x) => x.id === rule))
    for (const node of v.nodes) {
      const target = node.target[0];
      const el = typeof target === 'string' ? document.querySelector(target) : null;
      if (el) out.push({ el, message: node.failureSummary ?? v.help });
    }
  return out;
}

async function contrast(F: Refs): Promise<PageProbeResult> {
  const items: ProbeItem[] = [];
  for (const { el } of await axeRule('color-contrast')) {
    const s = getComputedStyle(el);
    const fg = parseColor(s.color);
    const ratio = fg ? contrastRatio(blend(fg, backgroundOf(el)), backgroundOf(el)) : 0;
    const large =
      parseFloat(s.fontSize) >= 24 ||
      (parseFloat(s.fontSize) >= 18.66 && Number(s.fontWeight) >= 700);
    items.push(item(F, el, `text contrast ${ratio.toFixed(1)}:1`, `at least ${large ? 3 : 4.5}:1`));
  }
  // axe doesn't check placeholders; people read them, so they count (#8 on demo/chat).
  for (const el of document.querySelectorAll('input[placeholder],textarea[placeholder]')) {
    if (!visible(el) || (el as HTMLInputElement).value) continue;
    const css = placeholderColor(el);
    const fg = css ? parseColor(css) : null;
    if (!fg) continue;
    const bg = backgroundOf(el);
    const ratio = contrastRatio(blend(fg, bg), bg);
    if (ratio < 4.5)
      items.push(item(F, el, `placeholder contrast ${ratio.toFixed(1)}:1`, 'at least 4.5:1'));
  }
  return { probe: 'contrast', pass: items.length === 0, items };
}

/** An inline link inside a sentence is exempt from target size (WCAG 2.5.8). */
const inlineInText = (el: Element) =>
  el.tagName === 'A' &&
  getComputedStyle(el).display === 'inline' &&
  (el.parentElement?.textContent ?? '').trim().length > (el.textContent ?? '').trim().length + 20;

function targetSize(F: Refs): PageProbeResult {
  const items: ProbeItem[] = [];
  let comfortable = 0;
  for (const el of document.querySelectorAll(INTERACTIVE)) {
    if (!visible(el) || inlineInText(el)) continue;
    // A checkbox or radio inside its label: the label is the target.
    if (el.matches('input[type=checkbox],input[type=radio]') && el.closest('label')) continue;
    const r = el.getBoundingClientRect();
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    if (Math.min(w, h) < 24) items.push(item(F, el, `${w}×${h}px`, 'at least 24×24px'));
    else if (Math.min(w, h) < 44) comfortable += 1;
  }
  return {
    probe: 'target-size',
    pass: items.length === 0,
    items,
    summary:
      comfortable > 0
        ? `${comfortable} more targets are under the comfortable 44px for touch`
        : undefined,
  };
}

async function axeNamed(F: Refs, probe: 'button-name' | 'link-name'): Promise<PageProbeResult> {
  const what = probe === 'button-name' ? 'button' : 'link';
  const items = (await axeRule(probe)).map(({ el }) =>
    item(F, el, `${what} with no accessible name`, `a name people and screen readers can use`),
  );
  return { probe, pass: items.length === 0, items };
}

function placeholderLeak(F: Refs): PageProbeResult {
  const items: ProbeItem[] = [];
  const seen = new Set<Element>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent ?? '').trim();
    const parent = n.parentElement;
    if (!text || !parent || seen.has(parent) || !LEAK.test(text)) continue;
    if (parent.closest('script,style,noscript,code,pre') || !visible(parent)) continue;
    seen.add(parent);
    items.push(item(F, parent, `shows "${text.slice(0, 60)}"`, 'real content, not a placeholder'));
  }
  for (const el of document.querySelectorAll('input,textarea')) {
    const v = (el as HTMLInputElement).value;
    if (v && LEAK.test(v) && visible(el))
      items.push(item(F, el, `field shows "${v.slice(0, 60)}"`, 'real content'));
  }
  return { probe: 'placeholder-leak', pass: items.length === 0, items };
}

/** Elements that draw text of their own. */
function textElements(): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of document.body.querySelectorAll<HTMLElement>('*')) {
    if (out.length > 2000) break;
    if (el.closest('script,style,noscript,svg')) continue;
    const own = [...el.childNodes].some(
      (c) => c.nodeType === Node.TEXT_NODE && (c.textContent ?? '').trim(),
    );
    if (own && visible(el)) out.push(el);
  }
  return out;
}

function fontInventory(F: Refs): PageProbeResult {
  const families = new Map<string, { n: number; el: Element }>();
  const sizes = new Map<string, number>();
  // The palette too (theme-fit's inventory, §8.3): text and background colors by use.
  const colors = new Map<string, number>();
  const tally = (css: string) => {
    const c = parseColor(css);
    if (!c || c.a === 0) return;
    const hex = `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
    colors.set(hex, (colors.get(hex) ?? 0) + 1);
  };
  for (const el of document.body.querySelectorAll('*')) {
    if (colors.size > 200) break;
    if (visible(el)) tally(getComputedStyle(el).backgroundColor);
  }
  for (const el of textElements()) {
    const s = getComputedStyle(el);
    tally(s.color);
    const family = (s.fontFamily.split(',')[0] ?? '').replace(/["']/g, '').trim().toLowerCase();
    const f = families.get(family);
    if (f) f.n += 1;
    else families.set(family, { n: 1, el });
    sizes.set(s.fontSize, (sizes.get(s.fontSize) ?? 0) + 1);
  }
  const tooManyFamilies = families.size > 2;
  const tooManySizes = sizes.size > 6;
  const items: ProbeItem[] = [];
  if (tooManyFamilies)
    for (const [family, { n, el }] of families)
      items.push(item(F, el, `${family} (${n} elements)`, 'at most 2 font families'));
  if (tooManySizes)
    items.push(
      item(
        F,
        document.body,
        `${sizes.size} font sizes: ${[...sizes.keys()].join(', ')}`,
        'at most 6 sizes',
      ),
    );
  return {
    probe: 'font-inventory',
    pass: !tooManyFamilies && !tooManySizes,
    items,
    summary: `${families.size} font families (${[...families.keys()].join(', ')}), ${sizes.size} sizes; colors ${[
      ...colors,
    ]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([hex]) => hex)
      .join(' ')}`,
  };
}

const SPACING_PROPS = [
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'row-gap',
  'column-gap',
] as const;

/** px values the site's own stylesheets declare for spacing (browser defaults aren't counted). */
function authorSpacing(): Set<number> {
  const out = new Set<number>();
  const visit = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        for (const prop of [...SPACING_PROPS, 'margin', 'padding', 'gap']) {
          const v = rule.style.getPropertyValue(prop);
          for (const m of v.matchAll(/(-?\d+(?:\.\d+)?)px/g)) out.add(Math.abs(Number(m[1])));
        }
      } else if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      visit(sheet.cssRules);
    } catch {
      // Cross-origin stylesheet.
    }
  }
  return out;
}

function spacing(F: Refs): PageProbeResult {
  const declared = authorSpacing();
  const used = new Map<number, { el: Element; prop: string }>();
  for (const el of document.body.querySelectorAll('*')) {
    if (used.size > 200) break;
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    for (const prop of SPACING_PROPS) {
      const v = Math.round(parseFloat(s.getPropertyValue(prop)) * 2) / 2;
      if (v > 0 && declared.has(v) && !used.has(v)) used.set(v, { el, prop });
    }
  }
  const off = offGridValues([...used.keys()]);
  const items =
    off.length >= 3
      ? off.map((v) => {
          const u = used.get(v);
          return item(
            F,
            u?.el ?? document.body,
            `${u?.prop ?? 'spacing'} ${v}px`,
            'a multiple of 4px',
          );
        })
      : [];
  return {
    probe: 'spacing',
    pass: items.length === 0,
    items,
    summary: `spacing values in use: ${[...used.keys()].sort((a, b) => a - b).join(', ')}px`,
  };
}

async function webVitals(F: Refs): Promise<PageProbeResult> {
  const collect = (type: string) =>
    new Promise<PerformanceEntry[]>((resolve) => {
      const got: PerformanceEntry[] = [];
      try {
        const po = new PerformanceObserver((list) => got.push(...list.getEntries()));
        po.observe({ type, buffered: true });
        setTimeout(() => {
          po.disconnect();
          resolve(got);
        }, 60);
      } catch {
        resolve(got);
      }
    });
  const lcp: (PerformanceEntry & { element?: Element | null }) | undefined = (
    await collect('largest-contentful-paint')
  ).at(-1);
  const shifts = (await collect('layout-shift')) as (PerformanceEntry & {
    value: number;
    hadRecentInput: boolean;
  })[];
  const cls = shifts.filter((s) => !s.hadRecentInput).reduce((a, s) => a + s.value, 0);
  const items: ProbeItem[] = [];
  const lcpMs = lcp ? Math.round(lcp.startTime) : 0;
  if (lcpMs > 2500)
    items.push(item(F, lcp?.element ?? document.body, `LCP ${lcpMs}ms`, 'at most 2,500ms'));
  if (cls > 0.1) items.push(item(F, document.body, `CLS ${cls.toFixed(2)}`, 'at most 0.1'));
  return {
    probe: 'web-vitals',
    pass: items.length === 0,
    items,
    summary: `LCP ${lcpMs}ms, CLS ${cls.toFixed(2)}`,
  };
}

const STATIC: Record<string, (F: Refs) => PageProbeResult | Promise<PageProbeResult>> = {
  contrast,
  'target-size': targetSize,
  'button-name': (F) => axeNamed(F, 'button-name'),
  'link-name': (F) => axeNamed(F, 'link-name'),
  'placeholder-leak': placeholderLeak,
  'font-inventory': fontInventory,
  spacing,
  'web-vitals': webVitals,
};

async function run(names: PageProbeName[], F: Refs): Promise<PageProbeResult[]> {
  const out: PageProbeResult[] = [];
  axePass = null;
  for (const name of names) {
    const probe = STATIC[name];
    if (!probe) continue;
    try {
      out.push(await probe(F));
    } catch (e) {
      out.push({ probe: name, pass: true, items: [], summary: `couldn't run: ${String(e)}` });
    }
  }
  return out;
}

// ── Focus (driven by real Tab presses from main) ─────────────────────────────

const focusKey = (el: Element) => {
  const s = getComputedStyle(el);
  const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
  return [
    outline ? `${s.outlineStyle} ${s.outlineColor}` : '',
    s.boxShadow,
    s.borderColor,
    s.backgroundColor,
    s.textDecorationLine,
    s.color,
  ].join('|');
};
const baseline = new Map<Element, string>();

/** Records how each focusable looks unfocused, then blurs, so Tab starts at the top. */
function focusStart(): number {
  baseline.clear();
  (document.activeElement as HTMLElement | null)?.blur();
  for (const el of document.querySelectorAll(FOCUSABLE))
    if (visible(el) && el !== document.activeElement) baseline.set(el, focusKey(el));
  return baseline.size;
}

/** After a Tab: does the focused element look different from its unfocused self? */
function focusCheck(F: Refs): ProbeItem | null | 'none' {
  const el = document.activeElement;
  if (!el || el === document.body) return 'none';
  const before = baseline.get(el);
  if (before === undefined || focusKey(el) !== before) return null;
  return item(F, el, 'no visible change when focused with Tab', 'a visible focus indicator');
}

// ── Feedback (armed before an action, read after it) ─────────────────────────

const BUSY = /\b(loading|searching|sending|saving|please wait|working)\b|…$/i;
let feedback: {
  t0: number;
  first: number | null;
  busyAt: number | null;
  added: { el: Element; text: string }[];
  live: string[];
  observer: MutationObserver;
} | null = null;

function feedbackArm(): void {
  feedback?.observer.disconnect();
  const state = {
    t0: performance.now(),
    first: null as number | null,
    busyAt: null as number | null,
    added: [] as { el: Element; text: string }[],
    live: [] as string[],
    observer: new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes' && r.attributeName === 'data-fitts-ref') continue;
        const t = performance.now() - state.t0;
        state.first ??= t;
        const target = r.target instanceof Element ? r.target : r.target.parentElement;
        const nodes = r.type === 'childList' ? [...r.addedNodes] : [r.target];
        for (const n of nodes) {
          const el = n instanceof Element ? n : n.parentElement;
          const text = (n.textContent ?? '').trim().replace(/\s+/g, ' ');
          if (!el) continue;
          if (text && state.added.length < 40) state.added.push({ el, text: text.slice(0, 200) });
          const busy =
            el.closest('[aria-busy=true],[role=progressbar]') ||
            /spin|load|progress|skeleton/i.test(String(el.getAttribute('class') ?? '')) ||
            (text.length < 40 && BUSY.test(text));
          if (busy) state.busyAt ??= t;
          const live = el.closest(
            '[role=status],[role=alert],[aria-live]:not([aria-live=off]),output',
          );
          if (live && text) state.live.push(text.slice(0, 200));
        }
        if (target?.closest('[aria-busy=true]')) state.busyAt ??= t;
      }
    }),
  };
  state.observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  });
  feedback = state;
}

function feedbackRead(F: Refs): Feedback {
  if (!feedback) return { firstChangeMs: null, busyMs: null, added: [], live: [], errors: [] };
  const errors = feedback.added
    .filter((a) => a.text.length < 120 && isGenericError(a.text) && document.contains(a.el))
    .map((a) => {
      const field = document.querySelector('[aria-invalid=true]');
      return item(
        F,
        a.el,
        `"${a.text}"${field ? '' : ', no field marked invalid'}`,
        'says what went wrong and how to fix it, next to the field',
      );
    });
  return {
    firstChangeMs: feedback.first === null ? null : Math.round(feedback.first),
    busyMs: feedback.busyAt === null ? null : Math.round(feedback.busyAt),
    added: feedback.added.map((a) => a.text).slice(0, 20),
    live: feedback.live.slice(0, 10),
    errors,
  };
}

// ── Small reads for flow probes and the viewport sweep ───────────────────────

function valueOf(ref: string, F: Refs): string | null {
  const el = F.find(ref);
  return el && 'value' in el ? String((el as HTMLInputElement).value) : null;
}

function overflow(F: Refs, width: number): ProbeItem[] {
  const items: ProbeItem[] = [];
  const doc = document.documentElement;
  if (doc.scrollWidth > window.innerWidth + 1)
    items.push(
      item(
        F,
        document.body,
        `page is ${doc.scrollWidth}px wide at ${width}px`,
        `no sideways scrolling at ${width}px`,
      ),
    );
  for (const el of textElements()) {
    if (items.length > 8) break;
    const s = getComputedStyle(el);
    if (
      el.scrollWidth > el.clientWidth + 1 &&
      /hidden|clip/.test(s.overflowX) &&
      s.textOverflow !== 'ellipsis'
    )
      items.push(item(F, el, `text cut off at ${width}px`, 'text that fits or wraps'));
  }
  return items;
}

const api = {
  run,
  focusStart,
  focusCheck,
  feedbackArm,
  feedbackRead,
  valueOf,
  overflow,
};
export type ProbesApi = typeof api;
(window as unknown as { __fittsProbes: ProbesApi }).__fittsProbes = api;

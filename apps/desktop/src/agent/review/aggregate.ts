// The aggregator (SPEC-phase2 §8.2): probe failures become findings directly; reviewer drafts
// merge into them (as agreement) or into each other; duplicates across routes become one finding
// with `locations`; the severity rubric sets severity; the evidence check decides each finding's
// lane. Deterministic: same inputs, same findings.
import {
  DEVICES,
  type DeviceCell,
  type Finding,
  type FindingDraft,
  type Heuristic,
  type Lens,
  type ProbeItem,
  type ProbeName,
  type ProbeResult,
  type Severity,
} from '@fitts/schema';
import { keyboardKind, surpriseKind } from '@fitts/probes';
import { JUDGE_PERSONA } from './judge';
import { BRAND_PERSONA } from './brandfit';

/** The judge's titles for moving content (jumped, scrolled). */
const JUMPY = /jumps|scrolls by itself/i;
import { navigationKind } from '../crawler/navigation';
import type { PersonaReview } from './reviewers';

export const PANEL_SIZE = 5;

interface Template {
  title: string;
  finding: string;
  fix: string;
  heuristic?: Heuristic;
  lens: Lens;
  /** Rubric impact: how badly it gets in a person's way (1–4). */
  severity: Severity;
}

/** Plain-language findings for each probe's failures (§7 → §8.2). */
export function template(probe: ProbeName, item: ProbeItem): Template {
  const m = item.measured;
  switch (probe) {
    case 'contrast': {
      // Large text needs 3:1, the rest 4.5:1: the line names the bar this text missed.
      const need = /\d+(?:\.\d+)?:1/.exec(item.expected ?? '')?.[0] ?? '4.5:1';
      return /placeholder/.test(m)
        ? {
            title: 'Placeholder text is too faint to read',
            finding: `The hint text inside the field has ${m.replace('placeholder ', '')}, so people with low vision can't read it.`,
            fix: 'Darken the placeholder color to reach at least 4.5:1 contrast.',
            lens: 'accessibility',
            severity: 2,
          }
        : {
            title: 'Text is too faint to read',
            finding: `Some text has ${m}, below the ${need} contrast people need to read it comfortably.`,
            fix: `Darken the text color to reach at least ${need} contrast.`,
            lens: 'accessibility',
            severity: 2,
          };
    }
    case 'target-size':
      return {
        title: 'Tap target is too small',
        finding: `This control is ${m}, smaller than the 24×24px minimum, so it's easy to miss.`,
        fix: 'Give it at least 44×44px of tappable area (padding counts).',
        heuristic: 'H7',
        lens: 'ergonomics',
        severity: 2,
      };
    // SPEC-phase4 §9.3: Android, from the dump and the screen's pixels.
    case 'android-target':
      return {
        title: 'Tap target is too small',
        finding: `${m.charAt(0).toUpperCase()}${m.slice(1)}, under Android's 48×48dp minimum, so it's easy to miss.`,
        fix: 'Make it at least 48×48dp, or add hitSlop around the icon.',
        heuristic: 'H7',
        lens: 'ergonomics',
        severity: 2,
      };
    case 'android-label':
      return {
        title: 'Icon buttons have no accessible name',
        finding: `${m.charAt(0).toUpperCase()}${m.slice(1)}: TalkBack announces it as just "button".`,
        fix: 'Give it an accessibilityLabel that says what it does.',
        lens: 'accessibility',
        severity: 3,
      };
    case 'android-duplicate-label':
      return {
        title: 'Different controls have the same name',
        finding: `${m.charAt(0).toUpperCase()}${m.slice(1)}, so a screen reader can't tell them apart.`,
        fix: 'Name each control for what it does.',
        heuristic: 'H4',
        lens: 'accessibility',
        severity: 2,
      };
    case 'android-duplicate-bounds':
      return {
        title: 'Two controls sit in the same place',
        finding: `${m.charAt(0).toUpperCase()}${m.slice(1)}: one hides the other from touch and from TalkBack.`,
        fix: 'Keep one tap target per place; move the second action somewhere it can be reached.',
        lens: 'accessibility',
        severity: 2,
      };
    case 'android-editable-desc':
      return {
        title: 'A text field reads its description, not its value',
        finding: `${m.charAt(0).toUpperCase()}${m.slice(1)}, which TalkBack reads instead of what was typed.`,
        fix: 'Use a hint or a visible label instead of a content description.',
        lens: 'accessibility',
        severity: 2,
      };
    case 'android-contrast':
      return {
        title: 'Text is hard to read',
        finding: `${m.charAt(0).toUpperCase()}${m.slice(1)}.`,
        fix: 'Darken the text (or lighten its background) to at least 4.5:1.',
        lens: 'accessibility',
        severity: 2,
      };
    case 'button-name':
      return {
        title: 'Icon buttons have no accessible name',
        finding:
          'Screen readers announce these buttons as just "button", so people can’t tell what they do.',
        fix: 'Add an aria-label that says what each button does.',
        lens: 'accessibility',
        severity: 3,
      };
    case 'link-name':
      return {
        title: 'Links have no accessible name',
        finding: 'Screen readers can’t say where these links go.',
        fix: 'Add link text or an aria-label.',
        lens: 'accessibility',
        severity: 3,
      };
    case 'placeholder-leak':
      return {
        title: `Page ${m.replace(/^shows /, 'shows ')} instead of real content`,
        finding: `The page ${m}: a missing value leaked onto the screen, so people can’t see what they chose.`,
        fix: 'Read the right value, and show a clear fallback when it’s missing.',
        heuristic: 'H2',
        lens: 'usability',
        severity: 3,
      };
    case 'font-inventory':
      // A count of sizes is its own problem, not "families" (found auditing apps/site, Nov 2).
      if (/^\d+ font sizes:/.test(m))
        return {
          title: 'Too many text sizes',
          finding: `The site uses ${m.split(':')[0]}; more than about 6 makes the hierarchy hard to read.`,
          fix: 'Settle on a type scale of about 6 sizes and use them throughout.',
          heuristic: 'H4',
          lens: 'look-and-feel',
          severity: 2,
        };
      return {
        title: 'Too many font families',
        finding: `The site mixes ${m.split(' (')[0]} with other families; inconsistent type makes pages feel unrelated.`,
        fix: 'Use one family for text (two at most, with a clear role each).',
        heuristic: 'H4',
        lens: 'look-and-feel',
        severity: 2,
      };
    case 'spacing':
      return {
        title: 'Spacing is inconsistent and off-grid',
        finding: `Padding and margins use odd values (${m}), so spacing looks uneven from one element to the next.`,
        fix: 'Use spacing tokens on a 4px grid.',
        heuristic: 'H8',
        lens: 'look-and-feel',
        severity: 2,
      };
    case 'focus-visible':
      return {
        title: 'No visible focus when using the keyboard',
        finding:
          'Tabbing through the page shows no focus outline, so keyboard users can’t tell where they are.',
        fix: 'Remove the global `outline: none` and style :focus-visible instead.',
        lens: 'accessibility',
        severity: 3,
      };
    case 'viewport-sweep':
      return m.includes('wide')
        ? {
            title: 'Page scrolls sideways on small screens',
            finding: `At narrow widths the page is wider than the screen (${m}).`,
            fix: 'Let content wrap and size to the viewport.',
            lens: 'ergonomics',
            severity: 2,
          }
        : {
            title: 'Text gets cut off on small screens',
            finding: `Some text doesn’t fit at narrow widths (${m}).`,
            fix: 'Let the text wrap, or give it room.',
            lens: 'ergonomics',
            severity: 1,
          };
    case 'text-spacing':
      return {
        title: 'Text breaks with wider spacing',
        finding: `With WCAG’s text spacing applied (1.5 line height, wider letters and words), ${m}.`,
        fix: 'Let text containers grow with their content; avoid fixed heights and overflow: hidden on text.',
        lens: 'accessibility',
        severity: 2,
      };
    case 'resize-text':
      return {
        title: 'Page breaks at 200% text',
        finding: `At 200% text size, ${m}.`,
        fix: 'Size layout in rem and let content wrap, so text can double without clipping.',
        lens: 'accessibility',
        severity: 2,
      };
    case 'orientation':
      return {
        title: 'Page doesn’t work in landscape',
        finding: `In landscape, the page ${m}.`,
        fix: 'Support both orientations; never ask people to rotate their device.',
        lens: 'accessibility',
        severity: 2,
      };
    case 'axe': {
      const rule = item.rule;
      const impact = rule?.impact ?? 'moderate';
      const sev = impact === 'critical' ? 4 : impact === 'serious' ? 3 : impact === 'minor' ? 1 : 2;
      const bestPractice =
        rule?.tags.includes('best-practice') && !rule.tags.some((t) => /^wcag/.test(t));
      return {
        title: (rule?.help ?? m).replace(/\.$/, ''),
        finding: `${rule?.help ?? m} (axe rule ${rule?.id ?? 'unknown'}). People using a screen reader, a keyboard or zoom run into this.`,
        fix: `Fix the markup so the "${rule?.id ?? 'axe'}" rule passes: ${(rule?.help ?? m).toLowerCase()}.`,
        lens: 'accessibility',
        severity: (bestPractice ? Math.min(2, sev) : sev) as Template['severity'],
      };
    }
    case 'keyboard': {
      const kind = keyboardKind(m);
      return kind === 'stuck'
        ? {
            title: 'Keyboard focus gets stuck',
            finding: `Tabbing through the page, ${m}: keyboard users can't get out.`,
            fix: 'Let Tab move on (no focus traps outside open dialogs).',
            lens: 'accessibility',
            severity: 4,
          }
        : kind === 'unreachable'
          ? {
              title: 'A control can’t be reached with the keyboard',
              finding: `${m}, so people who don't use a mouse can't use it.`,
              fix: 'Use a real button or link, or give it tabindex="0" and key handlers.',
              lens: 'accessibility',
              severity: 3,
            }
          : kind === 'hidden'
            ? {
                title: 'The focused control is hidden',
                finding: `${m}: keyboard users can't see where they are.`,
                fix: 'Leave room for sticky headers (scroll-padding-top) and keep focused controls in view.',
                lens: 'accessibility',
                severity: 2,
              }
            : kind === 'skip-link'
              ? {
                  title: 'No way to skip the navigation',
                  finding: `${m}, so keyboard users tab through all of it on every page.`,
                  fix: 'Add a "Skip to content" link as the first focusable element.',
                  lens: 'accessibility',
                  severity: 1,
                }
              : {
                  title: 'A dialog doesn’t work with the keyboard',
                  finding: `${m.charAt(0).toUpperCase()}${m.slice(1)}.`,
                  fix: 'Move focus into the dialog, keep Tab inside it, close it on Esc and return focus to what opened it.',
                  lens: 'accessibility',
                  severity: 3,
                };
    }
    case 'navigation': {
      const kind = navigationKind(m);
      const t: Record<
        typeof kind,
        [string, string, Template['severity'], Heuristic | undefined, Lens]
      > = {
        'wrong-place': [
          'A link goes to the wrong page',
          'Point the control at the page it names.',
          3,
          'H4',
          'usability',
        ],
        loop: ['A page redirects in a loop', 'Break the redirect loop.', 4, 'H9', 'usability'],
        chain: [
          'Too many redirects before a page opens',
          'Redirect straight to the final address.',
          2,
          undefined,
          'performance',
        ],
        login: [
          'A page asks for a login it doesn’t need',
          'Let the page open without a login, or say why it needs one.',
          3,
          'H2',
          'usability',
        ],
        dropped: [
          'A redirect drops part of the address',
          'Keep the query and anchor through the redirect.',
          2,
          'H3',
          'usability',
        ],
        'back-trap': [
          'Back sends you straight back',
          'Use a replace-style redirect so Back leaves the page.',
          3,
          'H3',
          'usability',
        ],
        refresh: [
          'Refreshing a page breaks it',
          'Make the page load on its own from its address.',
          3,
          'H9',
          'usability',
        ],
        'soft-404': [
          'Unknown addresses show the home page',
          'Show a "page not found" page with status 404.',
          2,
          'H9',
          'usability',
        ],
      };
      const [title, fix, severity, heuristic, lens] = t[kind];
      return {
        title,
        finding: `${m.charAt(0).toUpperCase()}${m.slice(1)}.`,
        fix,
        ...(heuristic ? { heuristic } : {}),
        lens,
        severity,
      };
    }
    case 'surprise': {
      const kind = surpriseKind(m);
      const t: Record<typeof kind, [string, string, Template['severity']]> = {
        focus: [
          'Focus alone changes the page',
          'Change the page only when people press or submit something.',
          3,
        ],
        typing: [
          'Typing changes the page before you submit',
          'Wait for submit (or a button) before changing the page.',
          3,
        ],
        vanished: [
          'A message disappears before it can be read',
          'Keep messages up until dismissed, or at least 5 s plus reading time.',
          2,
        ],
        autoplay: [
          'Sound plays on its own',
          'Don’t autoplay sound; or start muted with a visible control.',
          3,
        ],
        moved: [
          'A control moves just as you reach for it',
          'Reserve space for late content so controls don’t move.',
          3,
        ],
      };
      const [title, fix, severity] = t[kind];
      return {
        title,
        finding: `${m.charAt(0).toUpperCase()}${m.slice(1)}.`,
        fix,
        lens: kind === 'moved' ? 'ergonomics' : 'accessibility',
        severity,
      };
    }
    case 'state':
      return {
        title: /fails/.test(m)
          ? 'The page breaks when a request fails'
          : /empty/.test(m)
            ? 'An empty list shows nothing at all'
            : 'No sign the page is loading',
        finding: `${m.charAt(0).toUpperCase()}${m.slice(1)}.`,
        fix: /fails/.test(m)
          ? 'Catch the error and say what went wrong, with a way to try again.'
          : /empty/.test(m)
            ? 'Say there’s nothing here yet and what to do about it.'
            : 'Show a loading indicator within a second.',
        heuristic: /fails/.test(m) ? 'H9' : 'H1',
        lens: 'usability',
        severity: /fails/.test(m) ? 3 : 2,
      };
    case 'perf':
      return {
        title: /KB$/.test(m)
          ? 'A file is too big for phones'
          : /tap/.test(m)
            ? 'Slow to answer a tap'
            : /layout shift/.test(m)
              ? 'The layout jumps while loading'
              : /page change/.test(m)
                ? 'Slow to change pages'
                : 'Slow to load on a phone',
        finding: `${m.charAt(0).toUpperCase()}${m.slice(1)}.`,
        fix: 'Size images, lazy-load below the fold, split code at route boundaries and drop duplicate requests.',
        lens: 'performance',
        // Measured on a dev server, the numbers are pessimistic: a low-severity lead, not a verdict.
        severity: /(dev build)/.test(m) ? 1 : 2,
      };
    case 'web-vitals':
      return {
        title: 'Slow to show the main content',
        finding: `Measured ${m}.`,
        fix: 'Load less up front and render the main content first.',
        lens: 'performance',
        severity: 1,
      };
    case 'feedback-timing':
      if (/no loading indicator/.test(m))
        return {
          title: 'No loading indicator while waiting',
          finding: `There’s a ${m.replace(' with no loading indicator', '')} with nothing on screen, so it looks like nothing happened.`,
          fix: 'Show a loading indicator within 0.1s and keep it until results arrive.',
          heuristic: 'H1',
          lens: 'usability',
          severity: 2,
        };
      if (/no confirmation/.test(m))
        return {
          title: `No confirmation after ${m.split('"')[1] ?? 'saving'}`,
          finding: `${m.split(' saved')[0]} goes through, but nothing says it worked, so people can’t tell if it was sent.`,
          fix: 'Show a short confirmation ("Message sent") after it succeeds.',
          heuristic: 'H1',
          lens: 'usability',
          severity: 3,
        };
      return {
        title: `${quoted(m.split('"')[1]) || 'A control'} does nothing visible`,
        finding: 'Pressing it changes nothing on screen.',
        fix: 'Give visible feedback, or remove the control.',
        heuristic: 'H1',
        lens: 'usability',
        severity: 1,
      };
    case 'back-mid-flow':
      return /no back or cancel/.test(m)
        ? {
            title: 'No back or cancel in this flow',
            finding: `There’s ${m}, so people who change their mind are stuck.`,
            fix: 'Add a Back link (and Cancel) on every step.',
            heuristic: 'H3',
            lens: 'usability',
            severity: 2,
          }
        : {
            title: 'Going back loses what you typed',
            finding: `Pressing Back mid-flow throws the draft away (${m}).`,
            fix: 'Keep the draft in shared state (or the URL) so Back restores it.',
            heuristic: 'H3',
            lens: 'usability',
            severity: 3,
          };
    case 'error-message':
      return {
        title: 'Error is a raw code, not an explanation',
        finding: `When it fails the page shows ${m.split(',')[0]}, which doesn’t say what went wrong or how to fix it.`,
        fix: 'Say what went wrong in plain words, next to the field, and how to fix it.',
        heuristic: 'H9',
        lens: 'usability',
        severity: 3,
      };
    case 'links':
      return {
        title: 'Link goes to a missing page',
        finding: `${m}: people who follow it hit a dead end.`,
        fix: 'Point the link at a real page, or remove it.',
        heuristic: 'H10',
        lens: 'usability',
        severity: 2,
      };
    case 'network':
      if (/characters typed/.test(m))
        return {
          title: 'Search sends a request on every keystroke',
          finding: `Typing sent ${m}, which wastes data and makes results flicker.`,
          fix: 'Debounce the search (about 250ms after typing stops).',
          heuristic: 'H7',
          lens: 'performance',
          severity: 2,
        };
      if (/no Cache-Control/.test(m))
        return {
          title: 'Repeated requests aren’t cached',
          finding: `${m}, so every repeat downloads it all again.`,
          fix: 'Send Cache-Control or ETag headers, and reuse recent results.',
          lens: 'performance',
          severity: 2,
        };
      return {
        title: 'Response is far too large',
        finding: `${m}: everything is sent at once instead of a page at a time.`,
        fix: 'Paginate: return 50 items and load more on demand.',
        heuristic: 'H8',
        lens: 'performance',
        severity: 2,
      };
    case 'label-consistency':
      return {
        title: 'One action has different labels',
        finding: `${m}, so people can’t tell whether they’re the same action.`,
        fix: 'Use one label for one action throughout the flow.',
        heuristic: 'H4',
        lens: 'usability',
        severity: 2,
      };
    case 'fitts-id':
      return {
        title: 'Main action is hard to reach',
        finding: `Reaching it takes ${m}.`,
        fix: 'Make it bigger and put it near where the previous step ended.',
        heuristic: 'H7',
        lens: 'ergonomics',
        severity: 1,
      };
  }
}

interface Cluster {
  key: string;
  route: string;
  routes: Set<string>;
  refs: string[];
  template?: Template;
  probe?: ProbeName;
  /** The device it showed up on, when only Fitts's phone pass saw it. */
  device?: string;
  items: ProbeItem[];
  evidenceIds: Set<string>;
  drafts: { persona: string; draft: FindingDraft }[];
}

export interface AggregateInput {
  runId: string;
  probes: ProbeResult[];
  reviews: PersonaReview[];
  /** When Fitts was on each route (for the timeline and rewind). */
  stepOf: (route: string) => { stepIndex: number; atMs: number };
  /** SPEC-phase4 §6.3: the run's device cells, so a finding can say where it happens. */
  cells?: DeviceCell[];
}

/** The cells of the run being aggregated (set by `aggregateWithChecks`). */
let CELLS: DeviceCell[] = [];

/** What to call a device id: a cell of this run, one of DEVICES, or the id itself. */
function deviceInfo(id: string): { label: string; mobile: boolean } {
  const cell = CELLS.find((c) => c.id === id);
  if (cell) return { label: cell.label, mobile: cell.mobile };
  const d = DEVICES.find((x) => x.id === id);
  return d ? { label: d.label, mobile: d.mobile } : { label: id, mobile: false };
}

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
const similar = (a: string, b: string) => {
  const x = words(a);
  const y = words(b);
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared / Math.max(1, Math.min(x.size, y.size)) >= 0.5;
};

/** How a fix for a probe finding is verified (§9.2): the same probe, the same problem. */
export interface Check {
  probe: ProbeName;
  title: string;
  routes: string[];
  /** For broken links: the hrefs that must load afterwards. */
  hrefs: string[];
  /** Seen only on this device (the phone pass): verification at desktop size can't check it. */
  device?: string;
}

/** The routes broken links point at ("/help returns 404"), by path. */
export function brokenTargets(probes: ProbeResult[]): Set<string> {
  const out = new Set<string>();
  for (const r of probes) {
    if (r.probe !== 'links' || r.pass) continue;
    for (const i of r.items) {
      const href = /^(\S+) (returns \d+|doesn't load)$/.exec(i.measured)?.[1];
      if (!href) continue;
      try {
        out.add(new URL(href, 'http://x').pathname);
      } catch {
        // Not a URL: nothing to skip.
      }
    }
  }
  return out;
}

/** One key for every phone-size cell (their findings all read "on a phone"); others by id. */
function deviceKey(device: string | undefined): string {
  if (!device) return '';
  return deviceInfo(device).mobile ? 'phone' : device;
}

export function aggregate(input: AggregateInput): Finding[] {
  return aggregateWithChecks(input).findings;
}

/** Findings, plus the check that verifies a fix for each probe finding (reviewer-only: none). */
export function aggregateWithChecks({ runId, probes, reviews, stepOf, cells }: AggregateInput): {
  findings: Finding[];
  checks: Map<string, Check>;
} {
  CELLS = cells ?? [];
  const clusters: Cluster[] = [];
  const byEvidence = new Map<string, Cluster[]>();

  // 1. Probe failures: one finding per problem (probe + what's wrong), across every route it
  //    shows up on ("same issue, 3 screens" is one finding with locations).
  // A page a broken link leads to is that link's problem (bench:chat, Nov 2): its own probes
  // (the server's error page: no lang, no landmarks) aren't the site's.
  const broken = brokenTargets(probes);
  for (const r of probes) {
    if (r.pass) continue;
    if (r.probe !== 'links' && broken.has(r.route)) continue;
    for (const item of r.items) {
      const t = template(r.probe, item);
      // Phone-size cells share one finding per problem (the title says "on a phone" for each).
      const key = `${r.probe}|${t.title}|${deviceKey(r.device)}`;
      let c = clusters.find((x) => x.key === key);
      if (!c) {
        c = {
          key,
          route: r.route,
          routes: new Set(),
          refs: [],
          template: t,
          probe: r.probe,
          ...(r.device ? { device: r.device } : {}),
          items: [],
          evidenceIds: new Set(),
          drafts: [],
        };
        clusters.push(c);
      }
      c.routes.add(r.route);
      c.items.push(item);
      if (item.ref && !c.refs.includes(item.ref)) c.refs.push(item.ref);
      c.evidenceIds.add(r.evidenceId);
      const list = byEvidence.get(r.evidenceId) ?? [];
      if (!list.includes(c)) byEvidence.set(r.evidenceId, [...list, c]);
    }
  }

  // 2. Reviewer drafts: into the probe finding they cite (same element if it has several),
  //    else into a matching draft cluster, else a new one.
  for (const { route, persona, drafts } of reviews) {
    for (const draft of drafts) {
      const cited = [...new Set(draft.evidenceIds.flatMap((id) => byEvidence.get(id) ?? []))];
      let c =
        cited.find((x) => draft.elementRef && x.refs.includes(draft.elementRef)) ??
        cited.find((x) => similar(x.template?.title ?? '', draft.title)) ??
        (cited.length === 1 ? cited[0] : undefined);
      // A draft about a page that a broken link leads to is that link's problem, seen from
      // the other end (demo/chat's /help).
      c ??= clusters.find(
        (x) => x.probe === 'links' && x.items.some((i) => i.measured.startsWith(`${route} `)),
      );
      // The judge's moment is the same thing a probe measured there (bench:chat, Nov 2: #29's
      // sheet is also a keyboard finding on its element, #30's tip a surprise finding): one
      // finding, with the judge's vote and the moment, not a duplicate.
      // A jump joins only a surprise finding: the row that jumped can carry another problem of
      // its own (A7's overlapping rows), which isn't the jump (bench:android, Nov 2).
      if (persona === JUDGE_PERSONA)
        c ??=
          clusters.find(
            (x) =>
              x.probe &&
              (x.probe === 'surprise' || !JUMPY.test(draft.title)) &&
              x.routes.has(route) &&
              draft.elementRef !== null &&
              x.refs.includes(draft.elementRef),
          ) ?? clusters.find((x) => x.probe === 'surprise' && x.routes.has(route));
      c ??= clusters.find(
        (x) =>
          !x.probe &&
          x.route === route &&
          ((draft.elementRef && x.refs.includes(draft.elementRef)) ||
            x.drafts.some((d) => similar(d.draft.title, draft.title))),
      );
      if (!c) {
        c = {
          key: `draft|${route}|${draft.title}`,
          route,
          routes: new Set([route]),
          refs: [],
          items: [],
          evidenceIds: new Set(),
          drafts: [],
        };
        clusters.push(c);
      }
      if (draft.elementRef && !c.refs.includes(draft.elementRef)) c.refs.push(draft.elementRef);
      for (const id of draft.evidenceIds) c.evidenceIds.add(id);
      // One vote per persona per finding.
      if (!c.drafts.some((d) => d.persona === persona)) c.drafts.push({ persona, draft });
    }
  }

  // 3. Same draft finding on several routes (no probe): one finding with locations.
  const merged: Cluster[] = [];
  for (const c of clusters) {
    // A judged moment is one event on one page (§6B.5): never merged with another page's.
    const judgedOnly = c.drafts.every((d) => d.persona === JUDGE_PERSONA);
    const twin =
      !c.probe && !judgedOnly
        ? merged.find(
            (m) =>
              !m.probe &&
              !m.drafts.every((d) => d.persona === JUDGE_PERSONA) &&
              m.drafts.some((d) => c.drafts.some((e) => similar(d.draft.title, e.draft.title))),
          )
        : undefined;
    if (!twin) {
      merged.push(c);
      continue;
    }
    for (const r of c.routes) twin.routes.add(r);
    for (const id of c.evidenceIds) twin.evidenceIds.add(id);
    for (const d of c.drafts)
      if (!twin.drafts.some((x) => x.persona === d.persona)) twin.drafts.push(d);
  }

  // 3b. The same missing loading sign, seen twice on a page: the state pass's forced slow response
  //     and the feedback probe's own wait. The page's feedback finding keeps it (bench:chat,
  //     Nov 2: /search's #13 came out as two findings).
  const loading = (c: Cluster) => /loading/i.test(c.template?.title ?? '');
  const waited = merged.find((c) => c.probe === 'feedback-timing' && loading(c));
  if (waited)
    for (const c of [...merged]) {
      if (c.probe !== 'state' || !loading(c)) continue;
      for (const r of waited.routes) {
        if (!c.routes.has(r)) continue;
        c.routes.delete(r);
        c.items = c.items.filter((i) => !i.measured.includes(` ${r} `));
      }
      if (c.routes.size === 0) {
        for (const id of c.evidenceIds) waited.evidenceIds.add(id);
        for (const d of c.drafts)
          if (!waited.drafts.some((x) => x.persona === d.persona)) waited.drafts.push(d);
        merged.splice(merged.indexOf(c), 1);
      } else if (!c.routes.has(c.route)) c.route = [...c.routes][0] ?? c.route;
    }

  // 3c. A dialog that pops up and traps the keyboard is one problem: the judge's "pops up" finding
  //     (judge-only, no probe) joins the keyboard *dialog* finding on the same element (bench:chat,
  //     Nov 2: #29's "Rate us" came out twice). Only those two: a keyboard finding across pages
  //     collects many refs, and a broader rule merged #30's moved button into "focus gets stuck".
  for (const c of [...merged]) {
    const judgedPopUp =
      !c.probe &&
      c.drafts.length > 0 &&
      c.drafts.every((d) => d.persona === JUDGE_PERSONA) &&
      c.drafts.some((d) => /pops up/i.test(d.draft.title));
    if (!judgedPopUp || c.refs.length === 0) continue;
    const kb = merged.find(
      (x) =>
        x !== c &&
        x.probe === 'keyboard' &&
        x.items.some((i) => keyboardKind(i.measured) === 'dialog' && c.refs.includes(i.ref)),
    );
    if (!kb) continue;
    for (const r of c.routes) kb.routes.add(r);
    for (const id of c.evidenceIds) kb.evidenceIds.add(id);
    kb.items.push(...c.items);
    for (const d of c.drafts)
      if (!kb.drafts.some((x) => x.persona === d.persona)) kb.drafts.push(d);
    merged.splice(merged.indexOf(c), 1);
  }

  // 4. Findings: severity rubric, then the evidence check.
  const findings = merged.map((c, n) => toFinding(c, n, runId, stepOf));
  const checks = new Map<string, Check>();
  merged.forEach((c, n) => {
    const f = findings[n];
    if (!f || !c.probe || !c.template) return;
    checks.set(f.id, {
      probe: c.probe,
      title: c.template.title,
      routes: [...c.routes],
      hrefs:
        c.probe === 'links'
          ? c.items.map((i) => i.measured.split(' ')[0] ?? '').filter(Boolean)
          : [],
      ...(c.device ? { device: c.device } : {}),
    });
  });
  return { findings, checks };
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] ?? 2) : ((s[mid - 1] ?? 2) + (s[mid] ?? 2)) / 2;
}

/**
 * Severity rubric (§8.2): impact (the probe's template, or the reviewers' median), raised one
 * step when it shows up on 3+ screens (frequency) or 3+ reviewers agree it matters
 * (persistence). One step at most: a minor problem everywhere is major, not catastrophic.
 */
/**
 * A control's name in a title, short: "Quiet Confidence A clean, confident portfolio…" (a card's
 * whole text, from its accessible name) becomes its first few words, in quotes.
 */
export function quoted(name: string | undefined): string {
  const n = (name ?? '').replace(/\s+/g, ' ').trim();
  if (!n) return '';
  const words = n.split(' ');
  const short = n.length > 32 ? `${words.slice(0, 4).join(' ').slice(0, 32)}…` : n;
  return `“${short}”`;
}

export function severityOf(impact: number, routes: number, agreeing: number): Severity {
  let s = Math.round(impact);
  if ((routes >= 3 || agreeing >= 3) && s >= 2 && s < 4) s += 1;
  return Math.min(4, Math.max(1, s)) as Severity;
}

function toFinding(
  c: Cluster,
  n: number,
  runId: string,
  stepOf: AggregateInput['stepOf'],
): Finding {
  const lead = c.drafts[0]?.draft;
  // Each reviewer counts once, however many pages they flagged it on; a probe isn't a reviewer.
  const who = [...new Set(c.drafts.map((d) => d.persona))].slice(0, PANEL_SIZE);
  const reviewers = who.length;
  const impact = c.template?.severity ?? median(c.drafts.map((d) => d.draft.severity));
  const severity = severityOf(impact, c.routes.size, reviewers);
  // Evidence check: grounded in something Fitts measured or did (a probe, the trace, the page's
  // controls), and either a probe finding or agreed by 2 of 5 reviewers.
  // SPEC-phase4 §6B.5: the judge's vote on a surprise event Fitts measured (an observation it
  // cites) counts as one reviewer, and the event itself as measured evidence.
  const judged =
    (c.drafts.some((d) => d.persona === JUDGE_PERSONA) &&
      [...c.evidenceIds].some((id) => id.startsWith('obs-'))) ||
    // A9: the brand check's one vote on the screens it looked at (Android's theme check).
    (c.drafts.some((d) => d.persona === BRAND_PERSONA) &&
      [...c.evidenceIds].some((id) => id.endsWith('#snapshot')));
  const grounded =
    Boolean(c.probe) ||
    judged ||
    [...c.evidenceIds].some(
      (id) => id.endsWith('#trace') || id.endsWith('#snapshot') || id.includes('-ev'),
    );
  const shown = grounded && (Boolean(c.probe) || reviewers >= 2 || judged);
  const routes = [...c.routes];
  const at = stepOf(c.route);
  const evidence = [
    ...c.items
      .slice(0, 3)
      .map(
        (i) =>
          `${i.measured}${c.device ? ` on ${deviceInfo(c.device).label}` : ''} (expected ${i.expected})`,
      ),
    ...c.drafts.flatMap((d) => d.draft.evidence).slice(0, 3),
  ];
  const heuristic = c.template?.heuristic ?? lead?.heuristic ?? undefined;
  return {
    id: `${runId}-f${n + 1}`,
    runId,
    severity,
    ...(heuristic ? { heuristic } : {}),
    lens: c.template?.lens ?? lead?.lens ?? 'usability',
    title: onDevice(c.template?.title ?? lead?.title ?? 'Problem', c.device),
    finding: c.template?.finding ?? lead?.finding ?? '',
    fix: c.template?.fix ?? lead?.fix ?? '',
    route: c.route,
    agreement: {
      agreeing: reviewers,
      total: PANEL_SIZE,
      who,
      ...(c.probe ? { measured: true } : {}),
    },
    evidence,
    ...(c.evidenceIds.size ? { evidenceIds: [...c.evidenceIds] } : {}),
    ...(c.refs[0] ? { elementRef: c.refs[0] } : {}),
    ...(lead && (lead.expected || lead.actual || lead.steps?.length)
      ? {
          reviewerRepro: {
            ...(lead.expected ? { expected: lead.expected } : {}),
            ...(lead.actual ? { actual: lead.actual } : {}),
            ...(lead.steps?.length ? { steps: lead.steps } : {}),
          },
        }
      : {}),
    ...seenOn(c),
    ...sourceOf(c.items),
    stepIndex: at.stepIndex,
    atMs: at.atMs,
    status: 'open',
    lane: shown ? 'shown' : 'suggestion',
    ...(routes.length > 1
      ? {
          locations: routes.map((route) => ({
            route,
            stepIndex: stepOf(route).stepIndex,
          })),
        }
      : {}),
  };
}

/**
 * The device a finding needs to be seen: the phone pass's own, or for the viewport sweep the
 * smallest width it broke at ("page is 980px wide at 360px"), as the nearest device.
 */
function seenOn(c: Cluster): Pick<Finding, 'seenOn'> | Record<string, never> {
  if (c.device) return { seenOn: c.device };
  if (c.probe !== 'viewport-sweep') return {};
  const widths = c.items.flatMap((i) => {
    const m = / at (\d+)px/.exec(i.measured);
    return m ? [Number(m[1])] : [];
  });
  if (widths.length === 0) return {};
  const w = Math.min(...widths);
  return { seenOn: w <= 480 ? 'phone' : 'tablet' };
}

/** `data-fitts-src` from the Fitts plugin ("src/pages/Compose.tsx:118:9"): high confidence. */
function sourceOf(items: ProbeItem[]): Pick<Finding, 'source'> | Record<string, never> {
  const src = items.find((i) => i.src)?.src;
  const m = src ? /^(.+?):(\d+)(?::(\d+))?$/.exec(src) : null;
  if (!m?.[1]) return {};
  return {
    source: {
      file: m[1],
      line: Number(m[2]),
      ...(m[3] ? { col: Number(m[3]) } : {}),
      confidence: 'plugin',
    },
  };
}

/** A probe item's problem as the aggregator names it (fix verification compares these). */
export const titleOf = (probe: ProbeName, item: ProbeItem) => template(probe, item).title;
export const impactOf = (probe: ProbeName, item: ProbeItem) => template(probe, item).severity;

/** A phone-pass finding says where it happens: "Tap target is too small on a phone". */
const onDevice = (title: string, device: string | undefined) =>
  device
    ? `${title} on ${deviceInfo(device).mobile ? 'a phone' : deviceInfo(device).label}`
    : title;

/** A probe result's problems as `probe|title` keys, with their impact (verification, §9.2). */
export function problems(probe: ProbeName, items: ProbeItem[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of items) out.set(`${probe}|${titleOf(probe, i)}`, impactOf(probe, i));
  return out;
}

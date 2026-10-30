// The aggregator (SPEC-phase2 §8.2): probe failures become findings directly; reviewer drafts
// merge into them (as agreement) or into each other; duplicates across routes become one finding
// with `locations`; the severity rubric sets severity; the evidence check decides each finding's
// lane. Deterministic: same inputs, same findings.
import {
  DEVICES,
  type Finding,
  type FindingDraft,
  type Heuristic,
  type Lens,
  type ProbeItem,
  type ProbeName,
  type ProbeResult,
  type Severity,
} from '@fitts/schema';
import type { PersonaReview } from './reviewers';

export const PANEL_SIZE = 5;
const PROBE = 'Probe';

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
    case 'contrast':
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
            finding: `Some text has ${m}, below the 4.5:1 contrast people need to read it comfortably.`,
            fix: 'Darken the text color to reach at least 4.5:1 contrast.',
            lens: 'accessibility',
            severity: 2,
          };
    case 'target-size':
      return {
        title: 'Tap target is too small',
        finding: `This control is ${m}, smaller than the 24×24px minimum, so it's easy to miss.`,
        fix: 'Give it at least 44×44px of tappable area (padding counts).',
        heuristic: 'H7',
        lens: 'ergonomics',
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
        title: `${m.split('"')[1] ?? 'A button'} does nothing visible`,
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

export function aggregate(input: AggregateInput): Finding[] {
  return aggregateWithChecks(input).findings;
}

/** Findings, plus the check that verifies a fix for each probe finding (reviewer-only: none). */
export function aggregateWithChecks({ runId, probes, reviews, stepOf }: AggregateInput): {
  findings: Finding[];
  checks: Map<string, Check>;
} {
  const clusters: Cluster[] = [];
  const byEvidence = new Map<string, Cluster[]>();

  // 1. Probe failures: one finding per problem (probe + what's wrong), across every route it
  //    shows up on ("same issue, 3 screens" is one finding with locations).
  for (const r of probes) {
    if (r.pass) continue;
    for (const item of r.items) {
      const t = template(r.probe, item);
      const key = `${r.probe}|${t.title}|${r.device ?? ''}`;
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
    const twin = !c.probe
      ? merged.find(
          (m) =>
            !m.probe &&
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
  const who = [...(c.probe ? [PROBE] : []), ...c.drafts.map((d) => d.persona)];
  const reviewers = c.drafts.length;
  const impact = c.template?.severity ?? median(c.drafts.map((d) => d.draft.severity));
  const severity = severityOf(impact, c.routes.size, reviewers);
  // Evidence check: grounded in something Fitts measured or did (a probe, the trace, the page's
  // controls), and either a probe finding or agreed by 2 of 5 reviewers.
  const grounded =
    Boolean(c.probe) ||
    [...c.evidenceIds].some(
      (id) => id.endsWith('#trace') || id.endsWith('#snapshot') || id.includes('-ev'),
    );
  const shown = grounded && (Boolean(c.probe) || reviewers >= 2);
  const routes = [...c.routes];
  const at = stepOf(c.route);
  const evidence = [
    ...c.items.slice(0, 3).map((i) => `${i.measured} (expected ${i.expected})`),
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
    agreement: { agreeing: who.length, total: PANEL_SIZE, who },
    evidence,
    ...(c.refs[0] ? { elementRef: c.refs[0] } : {}),
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
    ? `${title} on ${DEVICES.find((d) => d.id === device)?.mobile ? 'a phone' : device}`
    : title;

/** A probe result's problems as `probe|title` keys, with their impact (verification, §9.2). */
export function problems(probe: ProbeName, items: ProbeItem[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of items) out.set(`${probe}|${titleOf(probe, i)}`, impactOf(probe, i));
  return out;
}

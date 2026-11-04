// The report's content, from a run: what Fitts understood, the App Map, every finding with how it
// was noticed, reproduced and fixed, and what each model call cost. A pure function over the run
// (no model calls, no network); assets are only named here, and copied by export.ts.
import {
  appMap,
  type AppMapNode,
  type Change,
  type CostEvent,
  type CostPhase,
  type Finding,
  type Heuristic,
  type Lens,
  type Observation,
} from '@fitts/schema';
import { assetFile, shotFile, type RunInput } from './read';
import { scrubDeep } from './scrub';

export interface Picture {
  /** Relative to the report's folder ("assets/shot-_compose.jpg"). */
  src: string;
  alt: string;
}

export interface Figure extends Picture {
  width: number;
  height: number;
  box?: { left: number; top: number; width: number; height: number };
  /** SAM's outline of the element, as path data in the shot's pixels. */
  outline?: string;
}

export type ChangeStatus = 'verified' | 'review' | 'rolled-back' | 'undone' | 'retrying';

export interface ChangeView {
  id: string;
  kind: Change['kind'];
  title: string;
  status: ChangeStatus;
  /** Why it was rolled back, in Fitts's words. */
  reason?: string;
  /** How the status was reached: the check that ran again, and what it found. */
  evidence: string[];
  costUsd: number;
  attempts?: number;
  branch?: string;
  sha?: string;
  prNumber?: number;
  prUrl?: string;
  after?: Picture;
  pages: { route: string; before?: Picture; after?: Picture }[];
}

export interface FindingView {
  id: string;
  severity: number;
  title: string;
  heuristic?: Heuristic;
  lens: Lens;
  route: string;
  /** Other pages it was seen on. */
  alsoOn: string[];
  lane: 'shown' | 'suggestion' | 'owner-ok';
  status: Finding['status'];
  agreement: { agreeing: number; total: number; who: string[]; measured: boolean };
  finding: string;
  fix: string;
  evidence: string[];
  /** The Noticed lines that led to it, in the order Fitts noticed them. */
  noticed: { step: number; route: string; text: string }[];
  figure?: Figure;
  /** The moment a surprise judge saw: the first and last frames. */
  moment?: { before: Figure; after: Figure };
  mockup?: Picture;
  repro?: {
    start: string;
    device: string;
    steps: { n: number; text: string; shot?: Picture }[];
    expected: string;
    actual: string;
    environment: string;
    confirmed: 'replayed' | 'observed' | 'owner';
    wcag: { sc: string; name: string; url: string }[];
    rule?: { id: string; url: string };
  };
  /** Before a written repro: the steps that led there. */
  path: { step: number; label: string }[];
  playwright?: string;
  source?: string;
  seenOn?: string;
  diff?: { files: string[]; lines: { kind: 'add' | 'del'; text: string }[] };
  change?: ChangeView;
  ownerReason?: string;
}

export interface ModelUse {
  model: string;
  provider: CostEvent['provider'];
  tasks: CostEvent['task'][];
  calls: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
}

export interface ReportData {
  project: string;
  /** Fitts's id for the project ("demo-chat"), which a display name may not match. */
  projectId: string;
  framework?: string;
  runId: string;
  /** ISO timestamps of the first and last logged events. */
  startedAt: string;
  endedAt: string;
  minutes: number;
  brief?: string;
  understood?: { summary: string; commit: string; modeled: boolean; notes: string[] };
  journeys: { name: string; status: string; reason?: string }[];
  stats: {
    found: number;
    shown: number;
    suggestions: number;
    ownerOk: number;
    verified: number;
    review: number;
    rolledBack: number;
    undone: number;
    open: number;
    dismissed: number;
    spentUsd: number;
    capUsd: number;
    calls: number;
    steps: number;
    pages: number;
    controls: { done: number; total: number };
  };
  cells: string[];
  map: AppMapNode;
  findings: FindingView[];
  suggestions: FindingView[];
  ownerOk: FindingView[];
  /** Changes not tied to one finding (a redesign). */
  otherChanges: ChangeView[];
  ledger: CostEvent[];
  byPhase: Record<CostPhase, number>;
  models: ModelUse[];
  priceTable?: string;
}

/** Asks for a file to be copied into the report; returns its path inside the report. */
export type AssetSink = (file: string, name: string) => string;

const OUTLINE_PATH = /^[MLHVZCQ0-9eE.,\s-]+$/i;

/**
 * SAM's outline as path data. SAM answers in the box's own pixels (from 0,0), so when the outline
 * fits the box but sits at the page's corner, it's moved onto the box.
 */
export function outlinePath(svg: string, box: Figure['box']): string | undefined {
  const d = /<path[^>]*\sd="([^"]+)"/.exec(svg)?.[1];
  if (!d || !OUTLINE_PATH.test(d) || d.length > 200_000) return undefined;
  if (!box) return d;
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const xs = nums.filter((_, i) => i % 2 === 0);
  const ys = nums.filter((_, i) => i % 2 === 1);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const local = minX < 4 && minY < 4 && maxX <= box.width + 6 && maxY <= box.height + 6;
  const atCorner = box.left > 8 || box.top > 8;
  if (!local || !atCorner) return d;
  const dx = Math.round(box.left * 10) / 10;
  const dy = Math.round(box.top * 10) / 10;
  return d.replace(/(-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)/g, (_m, x: string, y: string) => {
    const nx = Math.round((Number(x) + dx) * 10) / 10;
    const ny = Math.round((Number(y) + dy) * 10) / 10;
    return `${nx} ${ny}`;
  });
}

const STATUS: Record<Change['status'], ChangeStatus> = {
  verified: 'verified',
  'rolled-back': 'rolled-back',
  undone: 'undone',
  retrying: 'retrying',
};

const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);

export function buildReport(
  run: RunInput,
  sink: AssetSink,
  readText: (file: string) => string,
): ReportData {
  const s = run.state;
  const picture = (url: string | undefined, alt: string, name?: string): Picture | undefined => {
    const file = assetFile(run, url);
    if (!file) return undefined;
    return { src: sink(file, safeName(name ?? url?.split('/').pop() ?? 'asset')), alt };
  };
  const stepShot = (step: number | undefined, alt: string): Picture | undefined => {
    const file = shotFile(run, step);
    return file ? { src: sink(file, `step-${step}.jpg`), alt } : undefined;
  };
  const cellLabel = (id: string | undefined) =>
    id ? (s.cells?.find((c) => c.id === id)?.label ?? id) : undefined;

  const changeView = (c: Change, f?: Finding): ChangeView => {
    const status: ChangeStatus =
      c.status === 'verified' && c.checked === 'review' ? 'review' : STATUS[c.status];
    const evidence: string[] = [];
    if (status === 'verified') {
      evidence.push(
        f
          ? `Re-checked on the fix branch’s own dev server: “${f.title}” is gone, and no new problems at severity 2 or higher appeared on ${f.route}.`
          : 'Re-checked on the fix branch’s own dev server, page by page.',
        'The project’s own tests and CI checks, where it has them, still passed before the change was committed.',
      );
      if (f?.evidence[0]) evidence.push(`Before the fix: ${f.evidence[0]}.`);
    } else if (status === 'review') {
      evidence.push(
        `A reviewer compared ${f?.route ?? 'the page'} before and after the change with what was expected. Checked by review, not measured: there’s no measurement for this kind of problem to run again.`,
      );
    } else if (status === 'rolled-back') {
      evidence.push(
        `Rolled back: ${c.reason ?? 'it didn’t pass the checks'}. The code went back to the last good commit.`,
      );
    } else if (status === 'undone') {
      evidence.push('Undone by the owner after it was made.');
    }
    if ((c.attempts ?? 1) > 1) evidence.push(`It took ${c.attempts} passes to pass the checks.`);
    return {
      id: c.id,
      kind: c.kind,
      title: c.title,
      status,
      ...(c.reason ? { reason: c.reason } : {}),
      evidence,
      costUsd: c.costUsd,
      ...(c.attempts ? { attempts: c.attempts } : {}),
      ...(c.branch ? { branch: c.branch } : {}),
      ...(c.sha ? { sha: c.sha } : {}),
      ...(c.prNumber ? { prNumber: c.prNumber } : {}),
      ...(c.prUrl && /^https:\/\/github\.com\//.test(c.prUrl) ? { prUrl: c.prUrl } : {}),
      ...optional(
        'after',
        f ? picture(f.assets?.after, `${f.route} after the fix`, `after-${f.id}.jpg`) : undefined,
      ),
      pages: (c.pages ?? []).map((p) => ({
        route: p.route,
        ...optional('before', picture(p.before, `${p.route} before`)),
        ...optional('after', picture(p.after, `${p.route} after`)),
      })),
    };
  };

  const observations = s.observations ?? [];
  const noticedFor = (f: Finding) => {
    const ids = new Set(f.evidenceIds ?? []);
    const seen = new Set<string>();
    return observations
      .filter((o: Observation) => o.findingId === f.id || ids.has(o.id))
      .sort((a, b) => a.step - b.step)
      .filter((o) => {
        const key = `${o.route}|${o.text}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((o) => ({ step: o.step, route: o.route, text: o.text }));
  };

  const figureFor = (f: Finding): Figure | undefined => {
    const file = assetFile(run, f.assets?.shot);
    const size = f.shotSize;
    if (!file || !size) return undefined;
    const box = f.box && f.box.width > 0 && f.box.height > 0 ? f.box : undefined;
    const maskFile = assetFile(run, f.assets?.mask);
    const outline = maskFile ? outlinePath(readText(maskFile), box) : undefined;
    return {
      src: sink(file, safeName(f.assets?.shot?.split('/').pop() ?? `shot-${f.id}.jpg`)),
      alt: `The page ${f.route} when Fitts found this${box || outline ? ', with the element outlined' : ''}`,
      width: size.width,
      height: size.height,
      ...(box ? { box } : {}),
      ...(outline ? { outline } : {}),
    };
  };

  const momentFor = (f: Finding): FindingView['moment'] => {
    const m = f.moment;
    const first = m?.frames[0];
    const last = m?.frames.at(-1);
    if (!m || !first || !last || first === last) return undefined;
    const frame = (url: string, label: string, svgUrl?: string): Figure | undefined => {
      const file = assetFile(run, url);
      if (!file) return undefined;
      const svg = assetFile(run, svgUrl);
      const outline = svg ? outlinePath(readText(svg), undefined) : undefined;
      return {
        src: sink(file, safeName(url.split('/').pop() ?? 'frame.jpg')),
        alt: label,
        width: m.width,
        height: m.height,
        ...(m.box ? { box: m.box } : {}),
        ...(outline ? { outline } : {}),
      };
    };
    const before = frame(first.url, `${f.route} about 2 seconds before`, m.outlines?.first);
    const after = frame(last.url, `${f.route} about 2 seconds after`, m.outlines?.last);
    return before && after ? { before, after } : undefined;
  };

  const findingView = (f: Finding): FindingView => {
    const change = s.changes.find((c) => c.findingIds.includes(f.id));
    const r = f.repro;
    const evidence = [...new Set(f.evidence)];
    return {
      id: f.id,
      severity: f.severity,
      title: f.title,
      ...(f.heuristic ? { heuristic: f.heuristic } : {}),
      lens: f.lens,
      route: f.route,
      alsoOn: [...new Set((f.locations ?? []).map((l) => l.route))].filter((x) => x !== f.route),
      lane: f.lane ?? 'shown',
      status: f.status,
      agreement: {
        agreeing: f.agreement.agreeing,
        total: f.agreement.total,
        who: f.agreement.who,
        measured: Boolean(f.agreement.measured),
      },
      finding: f.finding,
      fix: f.fix,
      evidence,
      noticed: noticedFor(f),
      ...optional('figure', figureFor(f)),
      ...optional('moment', momentFor(f)),
      ...optional('mockup', picture(f.assets?.mockup, `A mockup of ${f.route} with the fix`)),
      ...(r
        ? {
            repro: {
              start: r.start.url,
              device: r.start.device,
              steps: r.steps.map((st) => ({
                n: st.n,
                text: st.text,
                ...optional('shot', stepShot(st.shot, `Step ${st.n}: ${st.route}`)),
              })),
              expected: r.expected,
              actual: r.actual,
              environment: r.environment,
              confirmed: r.confirmed,
              wcag: r.wcag ?? [],
              ...(r.rule ? { rule: r.rule } : {}),
            },
          }
        : {}),
      path: f.replay ?? [],
      ...(r?.playwright ? { playwright: r.playwright } : {}),
      ...(f.source ? { source: `${f.source.file}:${f.source.line}` } : {}),
      ...optional('seenOn', cellLabel(f.seenOn)),
      ...(f.diff && f.diff.lines.length ? { diff: f.diff } : {}),
      ...optional('change', change ? changeView(change, f) : undefined),
      ...(f.ownerReason ? { ownerReason: f.ownerReason } : {}),
    };
  };

  const order = (a: Finding, b: Finding) => b.severity - a.severity || a.stepIndex - b.stepIndex;
  const findings = [...s.findings].sort(order);
  const lane = (f: Finding) => f.lane ?? 'shown';

  const models = new Map<string, ModelUse>();
  for (const e of run.ledger) {
    const m = models.get(e.model) ?? {
      model: e.model,
      provider: e.provider,
      tasks: [],
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      usd: 0,
    };
    if (!m.tasks.includes(e.task)) m.tasks.push(e.task);
    m.calls += 1;
    m.inputTokens += e.inputTokens;
    m.outputTokens += e.outputTokens;
    m.usd += e.usd;
    models.set(e.model, m);
  }

  const changes = s.changes.map((c) => ({ c, status: changeView(c).status }));
  const count = (st: ChangeStatus) => changes.filter((x) => x.status === st).length;
  const brief = run.project?.brief?.summary ?? s.brief.summary;

  const data: ReportData = {
    project: run.project?.name ?? s.projectId,
    projectId: s.projectId,
    ...(run.project?.framework ? { framework: run.project.framework } : {}),
    runId: s.runId,
    startedAt: new Date(run.startedAt).toISOString(),
    endedAt: new Date(run.endedAt).toISOString(),
    minutes: Math.max(1, Math.round((run.endedAt - run.startedAt) / 60_000)),
    ...(brief ? { brief } : {}),
    ...(run.appModel
      ? {
          understood: {
            summary: run.appModel.summary,
            commit: run.appModel.commit,
            modeled: run.appModel.modeled,
            notes: run.appModel.notes,
          },
        }
      : {}),
    journeys: (s.journeys ?? []).map((j) => ({
      name: j.name,
      status: j.status,
      ...(j.reason ? { reason: j.reason } : {}),
    })),
    stats: {
      found: findings.length,
      shown: findings.filter((f) => lane(f) === 'shown').length,
      suggestions: findings.filter((f) => lane(f) === 'suggestion').length,
      ownerOk: findings.filter((f) => lane(f) === 'owner-ok').length,
      verified: count('verified'),
      review: count('review'),
      rolledBack: count('rolled-back'),
      undone: count('undone'),
      open: findings.filter((f) => lane(f) === 'shown' && f.status === 'open').length,
      dismissed: findings.filter((f) => f.status === 'dismissed').length,
      spentUsd: s.cost.spentUsd,
      capUsd: s.cost.capUsd,
      calls: run.ledger.length,
      steps: s.step,
      pages: s.routes.filter((r) => r.status === 'done').length || s.routes.length,
      controls: s.controlsTried,
    },
    cells: (s.cells ?? []).map((c) => c.label),
    map: appMap(s, run.appModel),
    findings: findings.filter((f) => lane(f) === 'shown').map(findingView),
    suggestions: findings.filter((f) => lane(f) === 'suggestion').map(findingView),
    ownerOk: findings.filter((f) => lane(f) === 'owner-ok').map(findingView),
    otherChanges: s.changes.filter((c) => c.findingIds.length === 0).map((c) => changeView(c)),
    ledger: run.ledger,
    byPhase: s.cost.byPhase,
    models: [...models.values()].sort((a, b) => b.usd - a.usd),
    ...optional('priceTable', run.ledger[0]?.priceTable),
  };
  // One pass over every string: no keys, no paths on this machine.
  return scrubDeep(data);
}

function optional<K extends string, V>(key: K, value: V | undefined) {
  return (value === undefined ? {} : { [key]: value }) as Partial<Record<K, V>>;
}

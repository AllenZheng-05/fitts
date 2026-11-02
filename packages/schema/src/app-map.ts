// The App Map (SPEC-phase4 §8.2): every page of the app as a node in a tree grouped by URL path,
// each holding what it does, what Fitts checked there, what it found and what it fixed. It's the
// App Model plus the run's coverage, findings and changes: a pure function, no model calls.
import type { AppModelSummary, Change, Finding, RunState } from './index';

export interface AppMapPage {
  file?: string;
  features: { name: string; description: string }[];
  journeys: { id: string; name: string; status: string }[];
  reached: boolean;
  why?: string;
  /** Device cells the run checked (labels). */
  cells: string[];
  findings: {
    id: string;
    title: string;
    severity: number;
    status: Finding['status'];
    lane: Finding['lane'];
  }[];
  changes: { id: string; title: string; status: Change['status'] }[];
  /** Open findings' suggested fixes. */
  proposed: { findingId: string; fix: string }[];
}

export interface AppMapNode {
  /** "/compose"; templates as "/team/:id". */
  path: string;
  /** The page's title or its last segment. */
  label: string;
  children: AppMapNode[];
  page?: AppMapPage;
  /** A template node: how many concrete pages the run reached under it ("× 3 pages"). */
  instances?: number;
  /** Rolled up from the node and everything under it. */
  totals: { findings: number; worst: number; fixed: number; open: number };
}

const FIXED = new Set<Finding['status']>(['verified', 'pr-opened']);

const segments = (path: string) => path.split('/').filter(Boolean);

/** "/team/:id" matches "/team/7" (same depth, each segment equal or a parameter). */
export function matchesTemplate(template: string, path: string): boolean {
  const t = segments(template);
  const p = segments(path);
  return t.length === p.length && t.every((s, i) => s.startsWith(':') || s === p[i]);
}

const routeOf = (path: string) => (path.split(/[?#]/)[0] ?? '/').replace(/\/+$/, '') || '/';

/** The App Map for a run: the model's pages, the routes the run reached, and every finding's. */
export function appMap(
  run: RunState,
  model: AppModelSummary | undefined = run.appModel,
): AppMapNode {
  const templates = (model?.pages ?? []).map((p) => p.route).filter((r) => r.includes(':'));
  // Each concrete path folds into its template when the model names one.
  const canonical = (path: string) => {
    const r = routeOf(path);
    return templates.find((t) => matchesTemplate(t, r)) ?? r;
  };
  const instances = new Map<string, Set<string>>();
  const paths = new Set<string>();
  const add = (path: string) => {
    const c = canonical(path);
    paths.add(c);
    if (c !== routeOf(path)) instances.set(c, (instances.get(c) ?? new Set()).add(routeOf(path)));
  };
  for (const p of model?.pages ?? []) add(p.route);
  for (const r of run.routes) add(r.path);
  for (const f of run.findings) {
    add(f.route);
    for (const l of f.locations ?? []) add(l.route);
  }
  const reached = new Set(
    run.routes.filter((r) => r.status === 'done').map((r) => canonical(r.path)),
  );
  const why = new Map((run.coverage?.unreached ?? []).map((u) => [canonical(u.route), u.why]));
  const cells = (run.cells ?? []).map((c) => c.label);
  const status = new Map((run.journeys ?? []).map((j) => [j.id, j.status]));
  const shownOn = (f: Finding, path: string) =>
    canonical(f.route) === path || (f.locations ?? []).some((l) => canonical(l.route) === path);

  const pageOf = (path: string): AppMapPage => {
    const mp = model?.pages.find((p) => p.route === path);
    const findings = run.findings.filter(
      (f) => (f.lane ?? 'shown') !== 'suggestion' && shownOn(f, path),
    );
    const ids = new Set(findings.map((f) => f.id));
    const isReached = reached.has(path);
    const whyNot = why.get(path);
    return {
      ...(mp?.file ? { file: mp.file } : {}),
      features: (mp?.features ?? []).map((x) => ({ name: x.name, description: x.description })),
      journeys: (model?.journeys ?? [])
        .filter((j) => j.pages.some((p) => canonical(p) === path) || canonical(j.start) === path)
        .map((j) => ({ id: j.id, name: j.name, status: status.get(j.id) ?? 'planned' })),
      reached: isReached,
      ...(!isReached && whyNot ? { why: whyNot } : {}),
      cells: isReached ? cells : [],
      findings: findings.map((f) => ({
        id: f.id,
        title: f.title,
        severity: f.severity,
        status: f.status,
        lane: f.lane,
      })),
      changes: run.changes
        .filter((c) => c.findingIds.some((id) => ids.has(id)))
        .map((c) => ({ id: c.id, title: c.title, status: c.status })),
      proposed: findings
        .filter((f) => f.status === 'open' && (f.lane ?? 'shown') === 'shown')
        .map((f) => ({ findingId: f.id, fix: f.fix })),
    };
  };

  const labelOf = (path: string) =>
    model?.pages.find((p) => p.route === path)?.title ?? segments(path).at(-1) ?? '/';

  // The tree: every path's ancestors exist (a missing one is a group node with no page).
  const nodes = new Map<string, AppMapNode>();
  const nodeFor = (path: string): AppMapNode => {
    let n = nodes.get(path);
    if (n) return n;
    n = {
      path,
      label: path === '/' ? labelOf('/') : labelOf(path),
      children: [],
      totals: { findings: 0, worst: 0, fixed: 0, open: 0 },
    };
    nodes.set(path, n);
    if (path !== '/') {
      const parent = `/${segments(path).slice(0, -1).join('/')}`;
      nodeFor(parent === '/' ? '/' : parent).children.push(n);
    }
    return n;
  };
  const root = nodeFor('/');
  for (const path of paths) {
    const n = nodeFor(path);
    n.page = pageOf(path);
    const seen = instances.get(path);
    if (seen?.size) n.instances = seen.size;
  }
  // Roll up: each finding once per subtree.
  const rollUp = (n: AppMapNode): Map<string, Finding> => {
    const mine = new Map<string, Finding>();
    for (const f of n.page?.findings ?? []) {
      const full = run.findings.find((x) => x.id === f.id);
      if (full) mine.set(full.id, full);
    }
    n.children.sort((a, b) => a.path.localeCompare(b.path));
    for (const c of n.children) for (const [id, f] of rollUp(c)) mine.set(id, f);
    const shown = [...mine.values()].filter((f) => (f.lane ?? 'shown') === 'shown');
    n.totals = {
      findings: shown.length,
      worst: Math.max(0, ...shown.map((f) => f.severity)),
      fixed: shown.filter((f) => FIXED.has(f.status)).length,
      open: shown.filter((f) => f.status === 'open').length,
    };
    return mine;
  };
  rollUp(root);
  return root;
}

/** The map's nodes in tree order (depth first), with their depth. */
export function flattenMap(root: AppMapNode): { node: AppMapNode; depth: number }[] {
  const out: { node: AppMapNode; depth: number }[] = [];
  const walk = (n: AppMapNode, depth: number) => {
    out.push({ node: n, depth });
    for (const c of n.children) walk(c, depth + 1);
  };
  walk(root, 0);
  return out;
}

/** The map as nested Markdown lists (the report, §8.3): each page with its features, findings and fixes. */
export function mapMarkdown(root: AppMapNode): string[] {
  const lines: string[] = [];
  for (const { node, depth } of flattenMap(root)) {
    const pad = '  '.repeat(depth);
    const p = node.page;
    const state = !p ? '' : p.reached ? '' : ` (not reached${p.why ? `: ${p.why}` : ''})`;
    const tally = node.totals.findings
      ? ` · ${node.totals.findings} found, ${node.totals.fixed} fixed`
      : '';
    lines.push(
      `${pad}- **${node.path}**${node.instances ? ` (× ${node.instances} pages)` : ''}${state}${tally}`,
    );
    if (!p) continue;
    for (const f of p.features) lines.push(`${pad}  - Does: ${f.name}`);
    for (const f of p.findings.filter((x) => (x.lane ?? 'shown') === 'shown'))
      lines.push(`${pad}  - Found: ${f.title} (severity ${f.severity})`);
    for (const c of p.changes.filter((x) => x.status === 'verified'))
      lines.push(`${pad}  - Fixed: ${c.title}`);
  }
  return lines;
}

/** The PR body's compact per-page table (§8.3): page, fixed, open. */
export function mapTable(root: AppMapNode): string[] {
  const rows = flattenMap(root).filter(({ node }) => node.page && node.page.findings.length > 0);
  if (rows.length === 0) return [];
  return [
    '| Page | Fixed | Open |',
    '| --- | --- | --- |',
    ...rows.map(({ node }) => {
      const p = node.page;
      const fixed = p?.findings.filter((f) => FIXED.has(f.status)).length ?? 0;
      const open =
        p?.findings.filter((f) => f.status === 'open' && (f.lane ?? 'shown') === 'shown').length ??
        0;
      return `| ${node.path} | ${fixed} | ${open} |`;
    }),
  ];
}

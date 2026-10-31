import type { Change, Project, RunState } from '@fitts/schema';
import { copy } from '../copy';
import { format, formatUsd } from './format';
import { severityLabel } from './severity';

export interface RunStats {
  found: number;
  fixed: number;
  undone: number;
  rolled: number;
  dismissed: number;
  open: number;
  prs: number;
  spentUsd: number;
}

/** The Done screen's numbers (SPEC §6.8), recomputed from the run so Undo and Retry move them. */
export function runStats(run: RunState): RunStats {
  const verified = run.changes.filter((c) => c.status === 'verified' || c.status === 'retrying');
  return {
    found: run.findings.length,
    fixed: run.changes.filter((c) => c.status === 'verified').length,
    undone: run.changes.filter((c) => c.status === 'undone').length,
    rolled: run.changes.filter((c) => c.status === 'rolled-back').length,
    dismissed: run.findings.filter((f) => f.status === 'dismissed').length,
    open: run.findings.filter((f) => f.status === 'open').length,
    prs: new Set(verified.flatMap((c) => (c.prNumber ? [c.prNumber] : []))).size,
    spentUsd: run.cost.spentUsd,
  };
}

export function mathLine(stats: RunStats): string {
  return format(stats.undone > 0 ? copy.done.mathUndone : copy.done.math, { ...stats });
}

function statusText(change: Change): string {
  const r = copy.done.report;
  switch (change.status) {
    case 'rolled-back':
      return `${r.statusRolledBack}${change.reason ? ` (${change.reason})` : ''}`;
    case 'undone':
      return r.statusUndone;
    case 'retrying':
      return r.statusRetrying;
    default:
      return r.statusVerified;
  }
}

/** The markdown summary "Export report" saves (SPEC §2, §6.8). */
export function buildReport(project: Project | undefined, run: RunState, now = new Date()): string {
  const r = copy.done.report;
  const stats = runStats(run);
  const lines = [
    `# ${format(r.title, { project: project?.name ?? run.projectId, run: run.runId.replace('run-', '') })}`,
    '',
    format(r.generated, { date: now.toISOString().slice(0, 10) }),
    '',
    `## ${r.summary}`,
    '',
    `- ${copy.done.stats.found}: ${stats.found}`,
    `- ${copy.done.stats.fixed}: ${stats.fixed}`,
    `- ${copy.done.stats.prs}: ${stats.prs}`,
    `- ${copy.done.stats.spent}: ${formatUsd(stats.spentUsd)}`,
    '',
    mathLine(stats),
    '',
    `## ${r.changes}`,
    '',
    ...run.changes.map(
      (c) =>
        `- ${c.severity !== undefined ? `[${severityLabel(c.severity, 'short')}] ` : ''}${c.title}` +
        `${c.prNumber ? ` · PR #${c.prNumber}` : ''} · ${formatUsd(c.costUsd)} · ${statusText(c)}`,
    ),
    '',
    `## ${r.findings}`,
    '',
    ...run.findings.map((f) => {
      // Where it stands, in words, with the PR that fixed it (the redesign's, if it did).
      const change = run.changes.find((c) => c.findingIds.includes(f.id));
      const status = r.findingStatus[f.status];
      const pr = f.prNumber ? ` · PR #${f.prNumber}` : '';
      const by = change?.kind === 'redesign' ? ` ${r.byRedesign}` : '';
      return `- [${severityLabel(f.severity, 'short')}] ${f.title} · ${f.heuristic ?? copy.audit.lens[f.lens]} · ${f.route} · ${status}${by}${pr}`;
    }),
    '',
    `## ${r.cost}`,
    '',
    ...(Object.keys(copy.done.costLegend) as (keyof typeof copy.done.costLegend)[]).map(
      (k) => `- ${copy.done.costLegend[k]}: ${formatUsd(run.cost.byPhase[k])}`,
    ),
    '',
  ];
  return lines.join('\n');
}

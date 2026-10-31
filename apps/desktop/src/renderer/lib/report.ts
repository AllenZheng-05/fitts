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
  /** Open, with enough evidence to show. */
  open: number;
  /** Open, without enough evidence yet (SPEC-phase2 §8.2). */
  suggestions: number;
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
    open: run.findings.filter((f) => f.status === 'open' && f.lane !== 'suggestion').length,
    suggestions: run.findings.filter((f) => f.status === 'open' && f.lane === 'suggestion').length,
    prs: new Set(verified.flatMap((c) => (c.prNumber ? [c.prNumber] : []))).size,
    spentUsd: run.cost.spentUsd,
  };
}

export function mathLine(stats: RunStats): string {
  const p = copy.done.mathParts;
  const parts = [
    format(p.fixed, { n: stats.fixed }),
    ...(stats.undone > 0 ? [format(p.undone, { n: stats.undone })] : []),
    format(p.rolled, { n: stats.rolled }),
    format(p.dismissed, { n: stats.dismissed }),
    ...(stats.open > 0 ? [format(p.open, { n: stats.open })] : []),
    ...(stats.suggestions > 0 ? [format(p.suggestions, { n: stats.suggestions })] : []),
  ];
  return format(copy.done.math, { found: stats.found, parts: parts.join(' + ') });
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
    // Each finding in full (Allen's feedback, round 4): what, how to fix it, and the evidence.
    ...[...run.findings]
      .sort((a, b) => b.severity - a.severity)
      .flatMap((f) => {
        // Where it stands, in words, with the PR that fixed it (the redesign's, if it did).
        const change = run.changes.find((c) => c.findingIds.includes(f.id));
        const status = r.findingStatus[f.status];
        const pr = f.prNumber ? ` · PR #${f.prNumber}` : '';
        const by = change?.kind === 'redesign' ? ` ${r.byRedesign}` : '';
        const lane = f.lane === 'suggestion' ? ` · ${r.suggestion}` : '';
        return [
          `### [${severityLabel(f.severity, 'short')}] ${f.title}`,
          '',
          `${f.heuristic ?? copy.audit.lens[f.lens]} · ${f.route} · ${status}${by}${pr}${lane}`,
          '',
          ...(f.finding ? [`**${copy.finding.findingPrefix}** ${f.finding}`, ''] : []),
          ...(f.fix ? [`**${copy.finding.fixPrefix}** ${f.fix}`, ''] : []),
          ...(f.evidence.length > 0
            ? [`${r.evidence}:`, '', ...f.evidence.map((e) => `- ${e}`), '']
            : []),
        ];
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

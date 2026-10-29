import type { Change, ChatItem, CostPhase, RunState } from '@fitts/schema';
import { useEffect, useId, useState } from 'react';
import { Button } from '../../components/Button';
import { Chip, SeverityBadge } from '../../components/Chip';
import { Select } from '../../components/fields';
import { FittsAvatar } from '../../components/brand/FittsAvatar';
import { RichText } from '../../components/RichText';
import { copy } from '../../copy';
import { bridge } from '../../lib/bridge';
import { cx } from '../../lib/cx';
import { format, formatUsd } from '../../lib/format';
import { buildReport, mathLine, runStats, type RunStats } from '../../lib/report';
import { DEMO_PAST_RUNS } from '../../mock/fixtures/demo-chat';
import { DEMO_CHAT } from '../../mock/fixtures/projects';
import { startRoute } from '../../mock/sites';
import { getEngine } from '../../state/engine';
import { useProject } from '../../state/projects';
import { useSite } from '../../state/site';
import { useToasts } from '../../state/toasts';
import { currentDirection } from '../redesign/redesign';
import { SiteView } from '../site-view/SiteView';

/** How many verified changes show before "See all N changes". */
const COLLAPSED = 4;

/** Done (SPEC §6.8): a preview of every fix combined beside the run summary. */
export function DoneLayout({ run }: { run: RunState }) {
  const project = useProject(run.projectId);
  const stats = runStats(run);
  const runNumber = run.runId.replace('run-', '');

  // The preview opens on the page that shows the fixes best.
  useEffect(() => {
    useSite.getState().navigate(run.projectId, startRoute(run.projectId, true));
  }, [run.projectId]);

  const previewUrl = run.projectId === DEMO_CHAT ? 'localhost:5180' : project?.url;
  return (
    <>
      <SiteView
        projectId={run.projectId}
        label={copy.done.preview}
        className="w-[520px] flex-none"
        interactive
        variant="fixed"
        direction={currentDirection(run)}
        addressHost={previewUrl}
        header={
          <span className="text-[12px] text-muted">
            {stats.fixed === 0 ? (
              // No fixes (or an audit-only live site): there is no preview branch to show.
              copy.done.previewAsIs
            ) : (
              <RichText
                text={format(copy.done.previewCaption, {
                  branch: `**fitts/preview-run-${runNumber}**`,
                  n: stats.fixed,
                })}
              />
            )}
          </span>
        }
      />
      <RunSummary run={run} stats={stats} />
    </>
  );
}

function RunSummary({ run, stats }: { run: RunState; stats: RunStats }) {
  const project = useProject(run.projectId);
  const toast = useToasts((s) => s.show);
  const [pastRunId, setPastRunId] = useState<string | null>(null);
  const titleId = useId();
  const runNumber = run.runId.replace('run-', '');
  const pastRuns = run.projectId === DEMO_CHAT ? DEMO_PAST_RUNS : [];
  const past = pastRuns.find((r) => r.runId === pastRunId);
  const closing =
    stats.found === 0
      ? copy.fitts.doneNothing
      : ([...run.chat]
          .reverse()
          .find(
            (c): c is Extract<ChatItem, { type: 'fitts.message' }> => c.type === 'fitts.message',
          )?.text ?? copy.fitts.done);

  const shown: RunStats = past
    ? { ...stats, found: past.found, fixed: past.fixed, prs: past.prs, spentUsd: past.spentUsd }
    : stats;

  return (
    <section
      aria-labelledby={titleId}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-panel border-[1.5px] border-ink bg-card shadow-panel"
    >
      <h2 id={titleId} className="sr-only">
        {copy.done.summary}
      </h2>
      <div className="flex flex-none items-start gap-3 border-b border-ink px-[18px] py-4">
        <FittsAvatar size={40} />
        <p className="flex-1 text-[16px] leading-normal">
          <RichText text={closing} />
        </p>
        <div className="flex flex-none gap-2">
          <Select
            label={copy.done.runPicker}
            hideLabel
            value={pastRunId ?? run.runId}
            onChange={(e) => setPastRunId(e.target.value === run.runId ? null : e.target.value)}
            options={[
              { value: run.runId, label: format(copy.done.currentRun, { n: runNumber }) },
              ...pastRuns.map((r) => ({ value: r.runId, label: r.label })),
            ]}
          />
          <Button
            size="sm"
            onClick={() => {
              void bridge()
                .saveTextFile(
                  `fitts-${run.projectId}-run-${runNumber}.md`,
                  buildReport(project, run),
                )
                .then((path) => path && toast(copy.done.reportSaved));
            }}
          >
            {copy.done.exportReport}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => getEngine().startInterview(run.projectId)}
          >
            {copy.done.newRun}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-[18px] py-3.5">
        <div className="flex gap-2.5">
          <Stat label={copy.done.stats.found} value={String(shown.found)} tone="bg-coral-tint" />
          <Stat label={copy.done.stats.fixed} value={String(shown.fixed)} tone="bg-mint-tint" />
          <Stat label={copy.done.stats.prs} value={String(shown.prs)} tone="bg-cobalt-tint" />
          <Stat
            label={copy.done.stats.spent}
            value={formatUsd(shown.spentUsd)}
            tone="bg-sun-tint"
          />
        </div>
        {past ? (
          <p className="text-[14px] text-muted">{copy.done.pastRun}</p>
        ) : (
          <>
            <p className="text-[13px] text-muted">{mathLine(stats)}</p>
            <ChangeList run={run} />
            <CostBar run={run} />
          </>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={cx('flex flex-1 flex-col rounded-card border border-ink px-3 py-2.5', tone)}>
      <span className="text-[12px] font-bold">{label}</span>
      <span className="font-display text-[28px] font-extrabold">{value}</span>
    </div>
  );
}

const SEVERITY_ORDER = (c: Change) => (c.severity ?? (c.kind === 'redesign' ? 3.5 : 0)) * -1;

function ChangeList({ run }: { run: RunState }) {
  const [all, setAll] = useState(false);
  const titleId = useId();
  if (run.changes.length === 0) {
    return <p className="text-[14px] text-muted">{copy.done.nothingChanged}</p>;
  }
  const rolled = run.changes.filter((c) => c.status === 'rolled-back' || c.status === 'retrying');
  const rest = run.changes
    .filter((c) => !rolled.includes(c))
    .sort((a, b) => SEVERITY_ORDER(a) - SEVERITY_ORDER(b));
  const shown = all ? [...rest, ...rolled] : [...rest.slice(0, COLLAPSED), ...rolled];

  return (
    <div className="flex flex-col gap-[7px]">
      <h3 id={titleId} className="font-display text-[17px] font-bold">
        {copy.done.changedTitle}
      </h3>
      <ul aria-labelledby={titleId} className="flex flex-col gap-1.5">
        {shown.map((change) => (
          <ChangeRow key={change.id} run={run} change={change} />
        ))}
      </ul>
      {run.changes.length > shown.length || all ? (
        <button
          type="button"
          aria-expanded={all}
          onClick={() => setAll((a) => !a)}
          className="self-start text-[13px] font-semibold text-cobalt-ink underline hover:text-cobalt-deep"
        >
          {all ? copy.done.showFewer : format(copy.done.seeAll, { n: run.changes.length })}
        </button>
      ) : null}
    </div>
  );
}

function ChangeRow({ run, change }: { run: RunState; change: Change }) {
  const engine = getEngine();
  const toast = useToasts((s) => s.show);
  const rolledBack = change.status === 'rolled-back';
  const retrying = change.status === 'retrying';
  const undone = change.status === 'undone';
  const badge =
    rolledBack || retrying ? (
      <Chip>{copy.done.rolledBack}</Chip>
    ) : change.kind === 'redesign' ? (
      <Chip tone="lilac">{copy.done.lookAndFeel}</Chip>
    ) : change.kind === 'wording' ? (
      <Chip tone="sun">{copy.done.wording}</Chip>
    ) : change.severity !== undefined ? (
      <SeverityBadge severity={change.severity} form="short" />
    ) : null;

  return (
    <li
      className={cx(
        'flex min-h-[50px] items-center gap-2.5 rounded-control px-2.5 py-2',
        rolledBack || retrying
          ? 'border border-dashed border-danger bg-danger-tint'
          : 'border border-ink',
        undone && 'bg-neutral-tint',
      )}
    >
      {badge}
      <span className={cx('flex-1 text-[14px] font-semibold', undone && 'text-muted')}>
        {(rolledBack || retrying) && change.reason ? change.reason : change.title}
        {undone && (
          <span className="block text-[12px] font-normal">
            {change.merged
              ? format(copy.done.reverted, { n: (change.prNumber ?? 0) + 9 })
              : format(copy.done.undone, { n: change.prNumber ?? 0 })}
          </span>
        )}
      </span>
      {change.prNumber && !rolledBack && !retrying && !undone && (
        <button
          type="button"
          onClick={() => toast(format(copy.items.prToast, { n: change.prNumber ?? 0 }))}
          className="font-mono text-[13px] text-cobalt-ink underline hover:text-cobalt-deep"
        >
          PR #{change.prNumber}
        </button>
      )}
      {!rolledBack && !retrying && (
        <span className="font-mono text-[12px] text-muted">{formatUsd(change.costUsd)}</span>
      )}
      {retrying ? (
        <span role="status" className="text-[13px] font-semibold text-cobalt-ink">
          {copy.done.retrying}
        </span>
      ) : rolledBack ? (
        <Button
          size="inline"
          variant="sun"
          onClick={() => engine.retryChange(run.projectId, change.id)}
        >
          {copy.done.tryAgain}
        </Button>
      ) : undone ? (
        <Button size="inline" onClick={() => engine.retryChange(run.projectId, change.id)}>
          {copy.done.redo}
        </Button>
      ) : (
        <Button size="inline" onClick={() => engine.undoChange(run.projectId, change.id)}>
          {copy.done.undo}
        </Button>
      )}
    </li>
  );
}

const COST_COLORS: Record<CostPhase, string> = {
  fixes: 'bg-cobalt',
  reviewers: 'bg-lilac',
  crawling: 'bg-mint',
  summing: 'bg-sun',
  media: 'bg-coral',
};

/** "Where the $13.92 went": a stacked bar with an amount legend (SPEC §6.8). */
function CostBar({ run }: { run: RunState }) {
  const titleId = useId();
  const phases = Object.keys(COST_COLORS) as CostPhase[];
  const total = phases.reduce((sum, p) => sum + run.cost.byPhase[p], 0) || 1;
  return (
    <div className="flex flex-col gap-[7px]">
      <h3 id={titleId} className="font-display text-[17px] font-bold">
        {format(copy.done.costTitle, { total: formatUsd(run.cost.spentUsd) })}
      </h3>
      <div aria-hidden="true" className="flex h-4 overflow-hidden rounded-pill border border-ink">
        {phases.map((p) => (
          <span
            key={p}
            className={COST_COLORS[p]}
            style={{ width: `${(run.cost.byPhase[p] / total) * 100}%` }}
          />
        ))}
      </div>
      <ul aria-labelledby={titleId} className="flex flex-wrap gap-x-3.5 gap-y-1 text-[13px]">
        {phases.map((p) => (
          <li key={p} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cx('inline-block size-2.5 rounded-tag', COST_COLORS[p])}
            />
            {copy.done.costLegend[p]} {formatUsd(run.cost.byPhase[p])}
          </li>
        ))}
      </ul>
    </div>
  );
}

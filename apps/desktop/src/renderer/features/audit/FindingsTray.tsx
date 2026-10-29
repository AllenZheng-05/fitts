import type { Finding, RunState, Severity } from '@fitts/schema';
import { FilterChip, SeverityBadge } from '../../components/Chip';
import { copy } from '../../copy';
import { cx } from '../../lib/cx';
import { format, formatClock } from '../../lib/format';
import { getEngine } from '../../state/engine';
import { useUi } from '../../state/ui';

type Filter = 'all' | 'usability' | 'accessibility' | 'performance' | 'look-and-feel';
const FILTERS: Filter[] = ['all', 'usability', 'accessibility', 'performance', 'look-and-feel'];

/** Ergonomics and content findings sit under Usability in the tray filters. */
const filterOf = (f: Finding): Filter =>
  f.lens === 'ergonomics' || f.lens === 'content' ? 'usability' : f.lens;

function statusLine(f: Finding): { text: string; className: string } {
  switch (f.status) {
    case 'fixing':
      return { text: copy.audit.fixingNow, className: 'font-semibold text-cobalt-ink' };
    case 'verified':
    case 'pr-opened':
      return { text: copy.audit.fixedShort, className: 'font-semibold text-mint-ink' };
    case 'dismissed':
      return { text: copy.audit.dismissed, className: 'text-muted' };
    case 'rolled-back':
      return { text: copy.audit.rolledBack, className: 'font-semibold text-danger-ink' };
    case 'undone':
      return { text: copy.audit.undone, className: 'text-muted' };
    default:
      return {
        text: `${f.heuristic ?? copy.audit.lens[f.lens]} · ${f.route}`,
        className: 'text-muted',
      };
  }
}

/** Findings tray (SPEC §6.4): title, lens filters, a horizontal list of cards, timeline. */
export function FindingsTray({ run }: { run: RunState }) {
  const filter = useUi((s) => s.findingsFilter);
  const selectedId = useUi((s) => s.openFindingId);
  const shown = run.findings.filter((f) => filter === 'all' || filterOf(f) === filter);

  return (
    <section
      aria-labelledby="tray-title"
      className="flex flex-none flex-col gap-2.5 rounded-panel border-[1.5px] border-ink bg-card px-3.5 py-3 shadow-panel"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="tray-title" className="mr-auto font-display text-[16px] font-bold">
          {format(copy.audit.trayTitle, { n: run.findings.length })}
        </h2>
        <div role="group" aria-label={copy.audit.filters} className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <FilterChip
              key={f}
              pressed={filter === f}
              onClick={() => useUi.getState().set({ findingsFilter: f })}
            >
              {copy.audit.filter[f]}
            </FilterChip>
          ))}
        </div>
      </div>
      <ul className="flex min-h-[78px] gap-2.5 overflow-x-auto pb-1">
        {shown.map((f) => {
          const line = statusLine(f);
          const selected = f.id === selectedId;
          return (
            <li key={f.id} className="flex-[0_0_230px]">
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => useUi.getState().set({ openFindingId: f.id })}
                className={cx(
                  'flex h-full w-full flex-col gap-1 rounded-control px-[11px] py-[9px] text-left transition-tint hover:bg-paper',
                  selected ? 'border-2 border-cobalt px-2.5 py-2' : 'border border-ink',
                )}
              >
                <SeverityBadge severity={f.severity} />
                <span className="text-[14px] font-semibold">{f.title}</span>
                <span className={cx('text-[12px]', line.className)}>{line.text}</span>
              </button>
            </li>
          );
        })}
        {shown.length === 0 && (
          <li className="self-center text-[14px] text-muted">
            {run.findings.length === 0 ? copy.audit.noFindings : copy.audit.noMatches}
          </li>
        )}
      </ul>
      <Timeline run={run} />
    </section>
  );
}

const DOT_TONE: Record<Severity, string> = {
  4: 'bg-wine',
  3: 'bg-coral-tint',
  2: 'bg-sun-tint',
  1: 'bg-neutral-tint',
  0: 'bg-neutral-tint',
};

/** Start time, cobalt progress, a severity dot per finding (buttons that rewind), playhead. */
function Timeline({ run }: { run: RunState }) {
  const total = Math.max(run.stepEstimate, 1);
  const progress = Math.min(1, run.step / total);
  const pct = (n: number) => `${Math.min(100, Math.max(0, n * 100))}%`;
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[11px] text-muted">0:00</span>
      <div role="group" aria-label={copy.audit.timeline} className="relative h-[22px] flex-1">
        <div className="absolute inset-x-0 top-[9px] h-1 rounded-pill bg-track" />
        <div
          className="absolute top-[9px] left-0 h-1 rounded-pill bg-cobalt"
          style={{ width: pct(progress) }}
        />
        {run.findings.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-label={format(copy.audit.rewindTo, { title: f.title })}
            aria-pressed={run.rewindStep === f.stepIndex}
            onClick={() => getEngine().rewindTo(run.projectId, f.stepIndex)}
            className={cx(
              'absolute top-0.5 size-[18px] -translate-x-1/2 rounded-full border-[1.5px] border-ink hover:scale-110',
              DOT_TONE[f.severity],
              run.rewindStep === f.stepIndex && 'ring-2 ring-cobalt ring-offset-1',
            )}
            style={{ left: pct(f.stepIndex / total) }}
          />
        ))}
        <span
          aria-hidden="true"
          className="absolute top-0 h-[22px] w-[3px] -translate-x-1/2 rounded-pill bg-ink"
          style={{ left: pct(progress) }}
        />
      </div>
      <span className="font-mono text-[11px] text-muted">
        {format(copy.audit.timelineEnd, { time: formatClock(run.elapsedMs) })}
      </span>
    </div>
  );
}

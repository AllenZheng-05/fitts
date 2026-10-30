import type { Finding, RunState, Severity } from '@fitts/schema';
import { FilterChip, SeverityBadge } from '../../components/Chip';
import { copy } from '../../copy';
import { X } from 'lucide-react';
import { cx } from '../../lib/cx';
import { format, formatClock } from '../../lib/format';
import { getEngine } from '../../state/engine';
import { useUi } from '../../state/ui';
import { onRoute } from './routes';

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
      // Rolled back is safe (nothing was pushed), so sun, not the destructive red.
      return { text: copy.audit.rolledBack, className: 'font-semibold text-sun-ink' };
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
  const route = useUi((s) => s.findingsRoute);
  // Suggestions (not enough evidence, SPEC-phase2 §8.2) stay out of the tray.
  const findings = run.findings.filter((f) => f.lane !== 'suggestion');
  const shown = findings.filter(
    (f) => (filter === 'all' || filterOf(f) === filter) && (!route || onRoute(f.route, route)),
  );

  return (
    <section
      aria-labelledby="tray-title"
      className={cx(
        'flex flex-none flex-col gap-2.5 rounded-panel border-[1.5px] border-ink bg-card px-3.5 py-3 shadow-panel',
        // In a short window an open Finding panel needs the height more than the tray does.
        selectedId !== null && '[@media(max-height:859px)]:hidden',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="tray-title" className="font-display text-[16px] font-bold">
          {format(copy.audit.trayTitle, { n: findings.length })}
        </h2>
        {route && (
          <span className="inline-flex items-center gap-1 rounded-pill border border-ink py-0.5 pr-0.5 pl-2.5 font-mono text-[12px]">
            {format(copy.audit.onPage, { route })}
            <button
              type="button"
              aria-label={copy.audit.allPages}
              onClick={() => useUi.getState().set({ findingsRoute: null })}
              className="flex size-6 items-center justify-center rounded-pill hover:bg-paper"
            >
              <X size={12} strokeWidth={2.5} aria-hidden="true" />
            </button>
          </span>
        )}
        <span className="mr-auto" />
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
            {findings.length > 0
              ? copy.audit.noMatches
              : run.controlsTried.done >= run.controlsTried.total
                ? copy.audit.noFindingsDone
                : copy.audit.noFindings}
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
        {run.findings
          .filter((f) => f.lane !== 'suggestion')
          .map((f) => (
            <button
              key={f.id}
              type="button"
              aria-label={format(copy.audit.rewindTo, { title: f.title })}
              aria-pressed={run.rewindStep === f.stepIndex}
              onClick={() => getEngine().rewindTo(run.projectId, f.stepIndex)}
              // A 24px target (WCAG 2.5.8) around the 18px dot.
              className="group absolute -top-px flex size-6 -translate-x-1/2 items-center justify-center rounded-full"
              style={{ left: pct(f.stepIndex / total) }}
            >
              <span
                aria-hidden="true"
                className={cx(
                  'size-[18px] rounded-full border-[1.5px] border-ink group-hover:scale-110',
                  DOT_TONE[f.severity],
                  run.rewindStep === f.stepIndex && 'ring-2 ring-cobalt ring-offset-1',
                )}
              />
            </button>
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

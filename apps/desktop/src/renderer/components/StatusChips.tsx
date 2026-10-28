import { Mic } from 'lucide-react';
import { copy } from '../copy';
import { cx } from '../lib/cx';
import { format, formatUsd } from '../lib/format';

/** "Mic on": shown only while the mic is live (SPEC §5.4). */
export function MicOnChip() {
  return (
    <span
      role="status"
      className="inline-flex min-h-10 items-center gap-[5px] rounded-control border border-ink bg-mint-tint px-2.5 text-[13px] font-bold text-mint-ink"
    >
      <Mic size={15} strokeWidth={2.2} aria-hidden="true" />
      {copy.status.micOn}
    </span>
  );
}

interface CostChipProps {
  spentUsd: number;
  /** During a run: `$1.84 / $20`. Without a cap: the total, `$13.92`. */
  capUsd?: number | undefined;
}

export const COST_WARN_RATIO = 0.8;

/** Turns sun-tint at 80% of the cap (SPEC §5.4). */
export function CostChip({ spentUsd, capUsd }: CostChipProps) {
  const spent = formatUsd(spentUsd);
  const cap = capUsd === undefined ? undefined : formatUsd(capUsd, { dropWholeCents: true });
  const warn = capUsd !== undefined && spentUsd >= capUsd * COST_WARN_RATIO;
  return (
    <span
      data-warn={warn || undefined}
      aria-label={
        cap
          ? format(copy.status.costDuring, { spent, cap })
          : format(copy.status.costTotal, { spent })
      }
      className={cx(
        'inline-flex min-h-10 items-center rounded-control border border-ink px-3 font-mono text-[13px]',
        warn ? 'bg-sun-tint text-sun-ink' : 'bg-card text-ink',
      )}
    >
      {cap ? `${spent} / ${cap}` : spent}
    </span>
  );
}

export type DotStatus = 'done' | 'testing' | 'queued';

const DOTS: Record<DotStatus, string> = {
  done: 'bg-mint border-ink',
  testing: 'bg-cobalt border-ink',
  queued: 'bg-card border-ink-faint',
};

/** Decorative status dot. Always pair it with words (SPEC §10). */
export function StatusDot({ status, className }: { status: DotStatus; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-block size-[9px] flex-none rounded-full border',
        DOTS[status],
        className,
      )}
    />
  );
}

interface ProgressBarProps {
  label: string;
  /** 0–1. Omit for indeterminate. */
  value?: number;
  tone?: 'mint' | 'cobalt';
  className?: string;
}

export function ProgressBar({ label, value, tone = 'mint', className }: ProgressBarProps) {
  const fill = tone === 'mint' ? 'bg-mint' : 'bg-cobalt';
  const indeterminate = value === undefined;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={indeterminate ? undefined : 0}
      aria-valuemax={indeterminate ? undefined : 100}
      aria-valuenow={indeterminate ? undefined : Math.round(value * 100)}
      className={cx('h-1.5 overflow-hidden rounded-pill bg-track', className)}
    >
      {indeterminate ? (
        <div className={cx('h-full w-2/5 rounded-pill animate-indeterminate', fill)} />
      ) : (
        <div className={cx('h-full rounded-pill', fill)} style={{ width: `${value * 100}%` }} />
      )}
    </div>
  );
}

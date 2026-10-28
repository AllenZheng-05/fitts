import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import type { Severity } from '@fitts/schema';
import { cx } from '../lib/cx';
import { severityLabel, severityTone, type SeverityForm } from '../lib/severity';

export type ChipTone = 'neutral' | 'mint' | 'cobalt' | 'sun' | 'lilac' | 'coral' | 'outline';

const TONES: Record<ChipTone, string> = {
  neutral: 'bg-neutral-tint text-neutral-ink',
  mint: 'bg-mint-tint text-mint-ink',
  cobalt: 'bg-cobalt-tint text-cobalt-deep',
  sun: 'bg-sun-tint text-sun-ink',
  lilac: 'bg-lilac-tint text-lilac-ink',
  coral: 'bg-coral-tint text-coral-ink',
  outline: 'border border-ink bg-card text-ink',
};

/** `sm` badges (12px bold) · `md` status chips (13px semibold), e.g. "git", "Works". */
type ChipSize = 'sm' | 'md';

const SIZES: Record<ChipSize, string> = {
  sm: 'px-2 py-0.5 text-[12px] font-bold',
  md: 'px-[11px] py-[7px] text-[13px] font-semibold',
};

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
  size?: ChipSize;
  icon?: ReactNode;
}

/** A non-interactive pill (SPEC §5.4). */
export function Chip({
  tone = 'neutral',
  size = 'sm',
  icon,
  className,
  children,
  ...rest
}: ChipProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 self-start rounded-pill whitespace-nowrap',
        TONES[tone],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
}

export interface SeverityBadgeProps {
  severity: Severity;
  /** `short` "Sev 3" · `list` "Severity 3" · `detail` "Severity 3 · Major". */
  form?: SeverityForm;
  className?: string;
}

/** Severity is always spelled out, never color alone (SPEC §10). */
export function SeverityBadge({ severity, form = 'list', className }: SeverityBadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center self-start rounded-pill px-2 py-0.5 text-[12px] font-bold whitespace-nowrap',
        form === 'detail' && 'px-[9px] py-[3px]',
        severityTone(severity),
        className,
      )}
    >
      {severityLabel(severity, form)}
    </span>
  );
}

export interface FilterChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  pressed: boolean;
}

/** 32px toggle pill used for findings filters (SPEC §6.4). */
export function FilterChip({ pressed, className, ...rest }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cx(
        'min-h-8 rounded-pill border border-ink px-3 text-[13px] transition-tint',
        pressed ? 'bg-ink text-card' : 'bg-card text-ink hover:bg-paper',
        className,
      )}
      {...rest}
    />
  );
}

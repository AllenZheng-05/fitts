import { cx } from '../lib/cx';

export interface Segment {
  id: string;
  label: string;
  disabled?: boolean;
  /** `danger` for "Stop run" only. */
  tone?: 'danger';
  onClick?: () => void;
}

interface SegmentedControlProps {
  /** Accessible name for the group, e.g. "Run controls". */
  label: string;
  segments: Segment[];
  /**
   * With `selected`, segments are toggle buttons (`aria-pressed`), like the model profile.
   * Without it they are plain actions, like the header run controls.
   */
  selected?: string | undefined;
  onSelect?: (id: string) => void;
  /** `sm` 40px header · `md` 44px settings. */
  size?: 'sm' | 'md';
  /** Stretch segments to fill the row. */
  fill?: boolean;
}

/** A joined button group with 1px ink dividers (SPEC §5.4). */
export function SegmentedControl({
  label,
  segments,
  selected,
  onSelect,
  size = 'sm',
  fill = false,
}: SegmentedControlProps) {
  const toggles = selected !== undefined;
  return (
    <div
      role="group"
      aria-label={label}
      className="flex overflow-hidden rounded-control border border-ink bg-card"
    >
      {segments.map((segment, i) => {
        const isSelected = toggles && segment.id === selected;
        return (
          <button
            key={segment.id}
            type="button"
            aria-pressed={toggles ? isSelected : undefined}
            disabled={segment.disabled}
            onClick={() => {
              segment.onClick?.();
              onSelect?.(segment.id);
            }}
            className={cx(
              'px-3 whitespace-nowrap transition-tint',
              // The group clips overflow, so the focus ring sits inside each segment.
              'focus-visible:-outline-offset-4',
              size === 'sm' ? 'min-h-10 text-[13px]' : 'min-h-11 text-[14px]',
              fill && 'flex-1',
              i < segments.length - 1 && 'border-r border-ink',
              segment.disabled
                ? 'cursor-not-allowed bg-surface-2 font-semibold text-disabled-ink'
                : isSelected
                  ? 'bg-ink font-bold text-card'
                  : cx(
                      'bg-card hover:bg-paper',
                      segment.tone === 'danger'
                        ? 'font-bold text-danger-ink'
                        : 'font-semibold text-ink',
                    ),
            )}
          >
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}

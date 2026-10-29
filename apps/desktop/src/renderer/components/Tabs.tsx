import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface TabItem {
  id: string;
  label: string;
  /** Second line under the label (segmented tabs only). */
  hint?: string;
  content: ReactNode;
}

interface TabsProps {
  label: string;
  items: TabItem[];
  selected: string;
  onSelect: (id: string) => void;
  /** `pills`: Finding panel (SPEC §6.5). `segmented`: Add project's two big tabs (§6.11). */
  variant?: 'pills' | 'segmented';
  panelClassName?: string;
}

/** Tabs with arrow-key navigation between tabs. */
export function Tabs({
  label,
  items,
  selected,
  onSelect,
  variant = 'pills',
  panelClassName,
}: TabsProps) {
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = items.find((t) => t.id === selected) ?? items[0];

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const last = items.length - 1;
    const moves: Record<string, number> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    const next = moves[event.key];
    const item = next === undefined ? undefined : items[next];
    if (next === undefined || !item) return;
    event.preventDefault();
    onSelect(item.id);
    tabRefs.current[next]?.focus();
  };

  const segmented = variant === 'segmented';

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label={label}
        className={
          segmented
            ? 'flex overflow-hidden rounded-control border border-ink'
            : 'flex flex-wrap gap-1.5'
        }
      >
        {items.map((tab, i) => {
          const active = tab.id === current?.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={active}
              aria-controls={`${baseId}-panel`}
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cx(
                'transition-tint',
                segmented
                  ? cx(
                      'flex min-h-[52px] flex-1 flex-col items-start justify-center px-3.5 py-2 text-left focus-visible:-outline-offset-4',
                      i < items.length - 1 && 'border-r border-ink',
                      active ? 'bg-ink text-card' : 'bg-card text-ink hover:bg-paper',
                    )
                  : cx(
                      'min-h-[34px] rounded-pill border border-ink px-3 text-[13px] font-semibold',
                      active ? 'bg-ink text-card' : 'bg-card text-ink hover:bg-paper',
                    ),
              )}
            >
              {segmented ? (
                <>
                  <strong className="text-[14px]">{tab.label}</strong>
                  {tab.hint && (
                    <span className={cx('text-[12px]', active ? 'text-card' : 'text-muted')}>
                      {tab.hint}
                    </span>
                  )}
                </>
              ) : (
                tab.label
              )}
            </button>
          );
        })}
      </div>
      {current && (
        <div
          role="tabpanel"
          id={`${baseId}-panel`}
          aria-labelledby={`${baseId}-tab-${current.id}`}
          className={panelClassName}
        >
          {current.content}
        </div>
      )}
    </div>
  );
}

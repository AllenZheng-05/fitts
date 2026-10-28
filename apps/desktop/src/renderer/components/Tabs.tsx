import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

interface TabsProps {
  label: string;
  items: TabItem[];
  selected: string;
  onSelect: (id: string) => void;
}

/** Pill tabs with arrow-key navigation, as in the Finding panel (SPEC §6.5). */
export function Tabs({ label, items, selected, onSelect }: TabsProps) {
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = items.find((t) => t.id === selected) ?? items[0];

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const last = items.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    const item = items[next];
    if (!item) return;
    onSelect(item.id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label={label} className="flex flex-wrap gap-1.5">
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
                'min-h-[34px] rounded-pill border border-ink px-3 text-[13px] font-semibold transition-tint',
                active ? 'bg-ink text-card' : 'bg-card text-ink hover:bg-paper',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {current && (
        <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${current.id}`}>
          {current.content}
        </div>
      )}
    </div>
  );
}

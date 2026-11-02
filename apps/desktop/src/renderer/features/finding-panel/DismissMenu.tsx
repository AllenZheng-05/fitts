// "Not a problem" with a reason (SPEC-phase4 §4.2): a small menu of the usual reasons, or the
// owner's own words. The reason is remembered per project, so the same finding stays out of
// the shown lane on later runs.
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { copy } from '../../copy';
import { cx } from '../../lib/cx';

const DISMISS_REASONS = ['intentional', 'audience', 'wontfix', 'wrong'] as const;

export function DismissMenu({
  onDismiss,
  pressed,
  className,
}: {
  onDismiss: (reason: string) => void;
  /** In a batch review: this finding's call is already "not a problem". */
  pressed?: boolean | undefined;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [other, setOther] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const d = copy.finding.dismissMenu;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const pick = (reason: string) => {
    setOpen(false);
    onDismiss(reason);
  };

  return (
    <div ref={ref} className={cx('relative', className)}>
      <Button
        size="md"
        variant={pressed ? 'dark' : 'secondary'}
        aria-pressed={pressed}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        className="min-h-11 w-full"
        onClick={() => setOpen((o) => !o)}
      >
        {copy.finding.notProblem}
      </Button>
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={d.label}
          className="absolute right-0 bottom-full z-40 mb-1 flex w-[260px] flex-col gap-1 rounded-card border-[1.5px] border-ink bg-card p-2 shadow-hero"
        >
          <span className="px-1 text-[12px] font-bold text-ink-2">{d.label}</span>
          {DISMISS_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              role="menuitem"
              onClick={() => pick(d.reasons[r])}
              className="rounded-row px-2 py-1.5 text-left text-[14px] hover:bg-paper"
            >
              {d.reasons[r]}
            </button>
          ))}
          <form
            className="mt-1 flex gap-1 border-t border-ink-faint pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (other.trim()) pick(other.trim());
            }}
          >
            <input
              type="text"
              aria-label={d.otherLabel}
              placeholder={d.otherPlaceholder}
              value={other}
              onChange={(e) => setOther(e.target.value)}
              className="min-h-9 min-w-0 flex-1 rounded-control border border-ink bg-card px-2 text-[13px]"
            />
            <Button type="submit" size="sm" disabled={!other.trim()}>
              {d.otherSend}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

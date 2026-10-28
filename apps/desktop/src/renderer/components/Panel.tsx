import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cx } from '../lib/cx';

interface ScrollBodyProps {
  label?: string | undefined;
  className?: string | undefined;
  children?: ReactNode;
}

/**
 * The panel's own scroll area. While its content overflows it becomes a focusable,
 * labelled region so keyboard users can scroll it (axe `scrollable-region-focusable`).
 */
export function ScrollBody({ label, className, children }: ScrollBodyProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      // A scrolling region must be keyboard-reachable; the rule can't see the dynamic role.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={overflowing ? 0 : undefined}
      role={overflowing ? 'region' : undefined}
      aria-label={overflowing ? label : undefined}
      className={cx('relative min-h-0 flex-1 overflow-y-auto', className)}
    >
      {children}
    </div>
  );
}

interface PanelProps {
  title?: ReactNode;
  /** Accessible name when there is no visible title. */
  label?: string;
  /** Controls on the title row, right-aligned. */
  actions?: ReactNode;
  /** A row under the title, separated by an ink divider (site toolbar, chat header). */
  toolbar?: ReactNode;
  footer?: ReactNode;
  /** Draw a divider under the title row. */
  divided?: boolean;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}

/**
 * Titled container: 1.5px ink border, radius 18, hard 3px shadow (SPEC §5.3). The body
 * owns its scrolling so the window never scrolls.
 */
export function Panel({
  title,
  label,
  actions,
  toolbar,
  footer,
  divided = false,
  className,
  bodyClassName,
  children,
}: PanelProps) {
  const titleId = useId();
  const hasHeader = Boolean(title ?? actions);
  return (
    <section
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : label}
      className={cx(
        'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-panel border-[1.5px] border-ink bg-card shadow-panel',
        className,
      )}
    >
      {hasHeader && (
        <div
          className={cx(
            'flex flex-none items-center gap-2 px-3.5 pt-3.5',
            divided ? 'border-b border-ink pb-3' : 'pb-2.5',
          )}
        >
          {title && (
            <h2 id={titleId} className="mr-auto font-display text-[16px] font-bold">
              {title}
            </h2>
          )}
          {actions}
        </div>
      )}
      {toolbar && (
        <div className="flex flex-none flex-wrap items-center gap-2 border-b border-ink px-3 py-2.5">
          {toolbar}
        </div>
      )}
      <ScrollBody
        label={typeof title === 'string' ? title : label}
        className={cx('px-3.5 pb-3.5', bodyClassName)}
      >
        {children}
      </ScrollBody>
      {footer && <div className="flex-none border-t border-ink px-3.5 py-2.5">{footer}</div>}
    </section>
  );
}

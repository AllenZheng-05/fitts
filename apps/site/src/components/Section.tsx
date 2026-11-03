import type { ReactNode } from 'react';
import { cx } from './ui';

/** A page's own title and lead, under the nav. */
export function PageHeader({ title, lead }: { title: string; lead?: string }) {
  return (
    <header className="mx-auto max-w-6xl px-4 pt-14 pb-6 sm:px-6 sm:pt-20">
      <h1 className="max-w-4xl font-display text-[44px] leading-[1.02] font-extrabold tracking-tight text-balance sm:text-7xl">
        {title}
      </h1>
      {lead && (
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-ink-2 sm:text-xl">{lead}</p>
      )}
    </header>
  );
}

/** A titled band of a page. Its children paint their own cards; the gutters show the shapes. */
export function Section({
  id,
  title,
  lead,
  children,
  className,
}: {
  id: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cx('py-12 sm:py-16', className)}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2
          id={`${id}-title`}
          className="font-display text-3xl font-extrabold tracking-tight sm:text-5xl"
        >
          {title}
        </h2>
        {lead && <div className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-2">{lead}</div>}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

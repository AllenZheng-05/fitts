import { ArrowRight } from 'lucide-react';
import { HonestyLabel } from '../components/Clip';
import { PageHeader, Section } from '../components/Section';
import { button, card, chip, chipBase, cx, size } from '../components/ui';
import {
  fill,
  published,
  runPath,
  runsCopy as copy,
  usd,
  type PublishedRun,
} from '../content/runs';
import { HONESTY, type Honesty } from '../media';

const honestyOf = (label?: string) =>
  (Object.keys(HONESTY) as Honesty[]).find((h) => HONESTY[h] === label);

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

export function Runs() {
  return (
    <>
      <PageHeader title={copy.title} lead={copy.lead} />
      <Section id="published" title={copy.listTitle}>
        <ul className="grid gap-6">
          {published.runs.map((r) => (
            <RunCard key={r.id} r={r} />
          ))}
        </ul>
      </Section>
      <Section id="share" title={copy.shareTitle} lead={copy.share}>
        <div className={cx(card, 'p-5')}>
          <pre className="rounded-row break-all whitespace-pre-wrap bg-ink p-4 font-mono text-[14px] text-card [text-shadow:none]">
            <code>{copy.shareCommand}</code>
          </pre>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{copy.shareNote}</p>
        </div>
      </Section>
    </>
  );
}

function RunCard({ r }: { r: PublishedRun }) {
  const s = copy.stats;
  const honesty = honestyOf(r.label);
  const facts = [
    fill(s.found, { n: r.shown }),
    r.suggestions ? fill(s.suggestions, { n: r.suggestions }) : '',
    fill(s.verified, { n: r.verified }),
    r.review ? fill(s.review, { n: r.review }) : '',
    r.rolledBack ? fill(s.rolledBack, { n: r.rolledBack }) : '',
    fill(s.spent, { usd: usd(r.spentUsd), calls: r.calls }),
  ].filter(Boolean);
  const fixes = r.verified + r.review + r.rolledBack;
  return (
    <li className={cx(card, 'flex flex-col gap-3 p-5 sm:p-6')}>
      <div className="flex flex-wrap items-center gap-2">
        {honesty ? (
          <HonestyLabel honesty={honesty} />
        ) : (
          r.label && <span className={cx(chipBase, chip.neutral)}>{r.label}</span>
        )}
        <span className="text-[15px] text-muted">
          {date(r.startedAt)} · {fill(s.minutes, { n: r.minutes })}
        </span>
      </div>
      <h3 className="font-display text-2xl font-bold">{r.project}</h3>
      <p className="leading-relaxed text-ink-2">{facts.join(' · ')}</p>
      {fixes === 0 && <p className="text-[15px] text-muted">{copy.noFixes}</p>}
      <a
        href={runPath(r.id)}
        className={cx(button.primary, size.md, 'self-start')}
        aria-label={`${copy.open}: ${r.project}, ${date(r.startedAt)}`}
      >
        {copy.open}
        <ArrowRight size={18} aria-hidden="true" />
      </a>
    </li>
  );
}

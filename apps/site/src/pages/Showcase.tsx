import { BeforeAfter } from '../components/BeforeAfter';
import { Clip, HonestyLabel } from '../components/Clip';
import { PageHeader, Section } from '../components/Section';
import { card, cx, link } from '../components/ui';
import { showcase } from '../content/showcase';
import { PORTFOLIO, SHOWCASE_MEDIA } from '../media';

const hasPortfolio = Boolean(PORTFOLIO.before && PORTFOLIO.after);

export function Showcase() {
  return (
    <>
      <PageHeader title={showcase.title} lead={showcase.lead} />
      <section aria-label={showcase.labelsTitle} className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="sr-only">{showcase.labelsTitle}</h2>
        <ul className="grid gap-3 md:grid-cols-3">
          {showcase.labels
            .filter((l) => l.honesty !== 'merged' || hasPortfolio)
            .map((l) => (
              <li key={l.honesty} className={cx(card, 'flex flex-col gap-2 p-4')}>
                <HonestyLabel honesty={l.honesty} />
                <p className="text-[15px] leading-relaxed text-ink-2">{l.body}</p>
              </li>
            ))}
        </ul>
      </section>

      <Portfolio />

      <section aria-label={showcase.title} className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <ul className="grid gap-6 md:grid-cols-2">
          {SHOWCASE_MEDIA.map((m) => (
            <li key={m.id} id={m.id} className={cx(card, 'flex flex-col gap-3 p-4')}>
              <Clip m={m} />
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <h2 className="font-display text-xl font-bold">{m.title}</h2>
                <HonestyLabel honesty={m.honesty} />
              </div>
              <p className="px-1 pb-1 leading-relaxed text-ink-2">{m.caption}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/** Only with both real images: never a fake or staged before and after. */
function Portfolio() {
  if (!hasPortfolio) return null;
  return (
    <Section id="portfolio" title={showcase.portfolioTitle} lead={showcase.portfolioLead}>
      <div className={cx(card, 'p-4')}>
        <p className="sr-only">{PORTFOLIO.alt}</p>
        <BeforeAfter
          before={PORTFOLIO.before}
          after={PORTFOLIO.after}
          labels={{
            before: showcase.before,
            after: showcase.after,
            sliderLabel: showcase.sliderLabel,
          }}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
          <p className="text-[15px] text-muted">{showcase.caption}</p>
          <HonestyLabel honesty="merged" />
        </div>
        {PORTFOLIO.prUrl && (
          <p className="mt-3 px-1">
            <a href={PORTFOLIO.prUrl} className={link}>
              {showcase.portfolioPr.replace('{n}', String(PORTFOLIO.prNumber))}
            </a>
          </p>
        )}
      </div>
    </Section>
  );
}

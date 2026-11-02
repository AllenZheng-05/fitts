import { PROBE_STANDARDS, WCAG, type Criterion } from '@fitts/probes';
import { useState } from 'react';
import { PageHeader, Section } from '../components/Section';
import { card, chip, chipBase, cx, link, type Tone } from '../components/ui';
import {
  CATALOG,
  fixCheckFor,
  GROUPS,
  type CatalogItem,
  type Evidence,
  type GroupId,
} from '../content/catalog';
import { checks } from '../content/checks';

const EVIDENCE_TONE: Record<Evidence, Tone> = {
  measured: 'mint',
  reviewers: 'cobalt',
  wonder: 'lilac',
};

export function Checks() {
  return (
    <>
      <PageHeader title={checks.title} lead={checks.lead} />
      <History />
      <Nielsen />
      <Catalog />
      <Benches />
    </>
  );
}

function History() {
  return (
    <Section id="paul-fitts" title={checks.fittsTitle}>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className={cx(card, 'p-6')}>
          {checks.fitts.map((p, i) => (
            <p key={p} className={cx('leading-relaxed text-ink-2', i > 0 && 'mt-4')}>
              {p}
            </p>
          ))}
        </div>
        <figure className={cx(card, 'self-start bg-cobalt-tint p-6')}>
          <p className="font-mono text-lg font-semibold sm:text-xl">{checks.formula}</p>
          <figcaption className="mt-3 leading-relaxed text-ink-2">{checks.formulaNote}</figcaption>
        </figure>
      </div>
    </Section>
  );
}

function Nielsen() {
  return (
    <Section id="nielsen" title={checks.nielsenTitle} lead={checks.nielsenLead}>
      <ul className="grid gap-3 md:grid-cols-2">
        {checks.heuristics.map((h) => (
          <li key={h.id} className={cx(card, 'flex gap-4 p-4')}>
            <span className="flex size-11 flex-none items-center justify-center rounded-control border-[1.5px] border-ink bg-sun font-mono text-sm font-bold">
              {h.id}
            </span>
            <div>
              <h3 className="font-semibold">{h.name}</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{h.how}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** The criteria a check names: its own list, or its probe's (from @fitts/probes). */
function criteriaOf(c: CatalogItem): Criterion[] {
  const ids = c.wcag ?? (c.probe ? (PROBE_STANDARDS[c.probe] ?? []) : []);
  return ids.flatMap((sc) => (WCAG[sc] ? [WCAG[sc]] : []));
}

function Standard({ c }: { c: CatalogItem }) {
  if (c.standardNote) return <>{c.standardNote}</>;
  const criteria = criteriaOf(c);
  const h = c.heuristic && checks.heuristics.find((x) => x.id === c.heuristic);
  if (!criteria.length && !h) return <>{checks.usability}</>;
  return (
    <ul className="flex flex-col gap-1">
      {criteria.map((w) => (
        <li key={w.sc}>
          <a href={w.url} className={link}>
            WCAG {w.sc} {w.name}
          </a>{' '}
          ({w.level})
        </li>
      ))}
      {h && (
        <li>
          {checks.heuristic} {h.id}: {h.name}
        </li>
      )}
    </ul>
  );
}

function Catalog() {
  const [group, setGroup] = useState<GroupId | null>(null);
  const shown = group ? CATALOG.filter((c) => c.group === group) : CATALOG;
  const groups = GROUPS.filter((g) => !group || g.id === group);
  return (
    <Section id="catalog" title={checks.catalogTitle} lead={checks.catalogLead}>
      <div role="group" aria-label={checks.filterLabel} className="flex flex-wrap gap-2">
        {[{ id: null, name: checks.all }, ...GROUPS].map((g) => (
          <button
            key={g.id ?? 'all'}
            type="button"
            aria-pressed={group === g.id}
            onClick={() => setGroup(g.id)}
            className={cx(
              'min-h-11 rounded-pill border-[1.5px] border-ink px-4 text-[15px] font-semibold transition-colors [text-shadow:none]',
              group === g.id ? 'bg-ink text-card' : 'bg-card text-ink hover:bg-paper',
            )}
          >
            {g.name}
          </button>
        ))}
      </div>
      <p role="status" className="mt-4 text-[15px] font-semibold text-ink-2">
        {checks.shown(shown.length, CATALOG.length)}
      </p>

      {groups.map((g) => (
        <div key={g.id} className="mt-10">
          <h3 className="font-display text-2xl font-bold">{g.name}</h3>
          <p className="mt-1 max-w-3xl leading-relaxed text-ink-2">{g.about}</p>
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {CATALOG.filter((c) => c.group === g.id).map((c) => (
              <CheckCard key={c.id} c={c} />
            ))}
          </ul>
        </div>
      ))}

      <div className={cx(card, 'mt-12 bg-sun-tint p-6')}>
        <h3 className="font-display text-xl font-bold">{checks.evidenceTitle}</h3>
        <p className="mt-2 max-w-3xl leading-relaxed text-ink-2">{checks.evidenceBody}</p>
      </div>
    </Section>
  );
}

function CheckCard({ c }: { c: CatalogItem }) {
  const fix = c.probe || c.evidence !== 'measured' ? fixCheckFor(c) : undefined;
  const row = 'grid gap-1 sm:grid-cols-[9rem_1fr] sm:gap-3';
  return (
    <li className={cx(card, 'flex flex-col p-5')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="font-semibold">{c.title}</h4>
        <span className={cx(chipBase, chip[EVIDENCE_TONE[c.evidence]])}>
          {checks.evidence[c.evidence]}
        </span>
      </div>
      <dl className="mt-3 flex flex-col gap-2 text-[15px] leading-relaxed">
        <div className={row}>
          <dt className="font-semibold text-muted">{checks.labels.what}</dt>
          <dd className="text-ink-2">{c.what}</dd>
        </div>
        <div className={row}>
          <dt className="font-semibold text-muted">{checks.labels.how}</dt>
          <dd className="text-ink-2">{c.how}</dd>
        </div>
        <div className={row}>
          <dt className="font-semibold text-muted">{checks.labels.standard}</dt>
          <dd className="text-ink-2">
            <Standard c={c} />
          </dd>
        </div>
        {fix && (
          <div className={row}>
            <dt className="font-semibold text-muted">{checks.labels.fix}</dt>
            <dd className="text-ink-2">{checks.fixCheck[fix]}</dd>
          </div>
        )}
      </dl>
    </li>
  );
}

function Benches() {
  return (
    <Section id="how-well" title={checks.benchTitle} lead={checks.benchLead}>
      <div className="flex flex-col gap-6">
        {checks.benches.map((b) => (
          <article key={b.name} className={cx(card, 'p-6')}>
            <h3 className="font-display text-2xl font-bold">{b.name}</h3>
            <p className="mt-1 font-mono text-[14px] text-muted">{b.run}</p>
            <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {b.stats.map((s) => (
                <div
                  key={s.label}
                  className="flex flex-col-reverse justify-end rounded-card border-[1.5px] border-ink bg-paper p-4"
                >
                  <dt className="mt-1 text-[15px] leading-snug text-ink-2">{s.label}</dt>
                  <dd className="font-display text-3xl font-extrabold">{s.value}</dd>
                </div>
              ))}
            </dl>
            {b.notes.map((n) => (
              <p key={n} className="mt-4 max-w-4xl leading-relaxed text-ink-2">
                {n}
              </p>
            ))}
            <p className="mt-4">
              <a href={b.key} className={link}>
                {b.keyLabel}
              </a>
            </p>
          </article>
        ))}
      </div>
    </Section>
  );
}

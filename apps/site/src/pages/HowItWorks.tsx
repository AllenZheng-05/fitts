import { DEVICES } from '@fitts/schema';
import { palette, PART_KINDS, partsOf } from '@fitts/styles';
import { ArrowRight, Mic, MonitorSmartphone } from 'lucide-react';
import { useId, useState } from 'react';
import { Clip } from '../components/Clip';
import { PageHeader, Section } from '../components/Section';
import { card, chip, chipBase, cx, link } from '../components/ui';
import { how, PROFILE_ROWS, type StepId } from '../content/how';
import { pages } from '../content/site';
import { LOOP_MEDIA, PR_MEDIA } from '../media';

export function HowItWorks() {
  return (
    <>
      <PageHeader title={how.title} lead={how.lead} />
      <Loop />
      <Models />
      <Profiles />
      <Section id="talk" title={how.talkTitle} lead={how.talkBody}>
        <ul className="flex flex-wrap gap-3">
          {how.talkExamples.map((e) => (
            <li key={e} className={cx(card, 'flex items-center gap-3 bg-lilac-tint px-5 py-4')}>
              <Mic size={18} aria-hidden="true" className="text-lilac-ink" />
              <span className="font-medium">{e}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Rails />
      <Section id="devices" title={how.devicesTitle} lead={how.devicesBody}>
        <ul className="flex flex-wrap gap-2">
          {DEVICES.map((d) => (
            <li
              key={d.id}
              className="flex min-h-11 items-center gap-2 rounded-pill border-[1.5px] border-ink bg-card px-4 text-[15px] font-medium"
            >
              <MonitorSmartphone size={16} aria-hidden="true" />
              {d.label}
            </li>
          ))}
        </ul>
      </Section>
      <Section id="android" title={how.androidTitle}>
        <ul className="grid gap-4 md:grid-cols-2">
          {how.androidBody.map((p) => (
            <li key={p} className={cx(card, 'bg-mint-tint p-5 leading-relaxed')}>
              {p}
            </li>
          ))}
        </ul>
      </Section>
      <Redesigns />
      <Section id="pull-request" title={how.prTitle} lead={how.prLead}>
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr] lg:items-start">
          {PR_MEDIA.src ? <Clip m={PR_MEDIA} className="shadow-panel" /> : null}
          <ol className="flex flex-col gap-3">
            {how.prCallouts.map((c, i) => (
              <li key={c.name} className={cx(card, 'flex gap-4 p-4')}>
                <span
                  aria-hidden="true"
                  className="flex size-8 flex-none items-center justify-center rounded-full bg-sun font-mono text-sm font-bold"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{c.name}</h3>
                  <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{c.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Section>
      <Section id="next" title={how.nextTitle}>
        <div className={cx(card, 'max-w-3xl p-6')}>
          <p className="leading-relaxed text-ink-2">{how.nextBody}</p>
          <p className="mt-4">
            <a href={how.roadmap} className={link}>
              {how.nextLink}
            </a>
          </p>
        </div>
      </Section>
    </>
  );
}

/** The loop: six step buttons, each opening its panel below (a disclosure, one open at a time). */
function Loop() {
  const [open, setOpen] = useState<StepId>('understand');
  const panelId = useId();
  const step = how.loop.find((s) => s.id === open) ?? how.loop[0];
  return (
    <Section id="loop" title={how.loopTitle} lead={how.loopLead}>
      <ol
        aria-label={how.loopLabel}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
      >
        {how.loop.map((s, i) => (
          <li key={s.id} className="relative flex">
            <button
              type="button"
              aria-expanded={open === s.id}
              aria-controls={panelId}
              onClick={() => setOpen(s.id)}
              className={cx(
                'flex w-full flex-col items-start gap-1 rounded-card border-[1.5px] border-ink p-3 text-left sm:p-4 transition-[transform,box-shadow] [text-shadow:none]',
                open === s.id
                  ? 'bg-ink text-card shadow-panel'
                  : 'bg-card shadow-button hover:-translate-x-px hover:-translate-y-px hover:shadow-panel',
              )}
            >
              <span className="font-mono text-[13px] opacity-80">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="font-display text-xl font-bold">{s.name}</span>
              <span className="text-[14px] leading-snug opacity-90">{s.short}</span>
            </button>
            {i < how.loop.length - 1 && (
              <ArrowRight
                size={16}
                aria-hidden="true"
                className="absolute top-1/2 -right-3 z-10 hidden -translate-y-1/2 text-ink lg:block"
              />
            )}
          </li>
        ))}
      </ol>

      {step && (
        <div
          id={panelId}
          role="region"
          aria-label={step.name}
          className={cx(card, 'mt-6 grid gap-6 p-6 shadow-hero lg:grid-cols-[3fr_2fr]')}
        >
          <div>
            <h3 className="font-display text-2xl font-bold">{step.name}</h3>
            <h4 className="mt-4 text-[13px] font-bold tracking-wide text-muted uppercase">
              {how.panel.does}
            </h4>
            <ul className="mt-2 flex list-disc flex-col gap-2 pl-5 leading-relaxed">
              {step.does.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            <h4 className="mt-5 text-[13px] font-bold tracking-wide text-muted uppercase">
              {how.panel.models}
            </h4>
            <ul className="mt-2 flex flex-col gap-1.5">
              {step.models.map((m) => (
                <li key={m} className="leading-relaxed">
                  {m}
                </li>
              ))}
            </ul>
            <h4 className="mt-5 text-[13px] font-bold tracking-wide text-muted uppercase">
              {how.panel.checks}
            </h4>
            <ul className="mt-2 flex flex-wrap gap-2">
              {step.checks.map((c) =>
                c.group ? (
                  <li key={c.text}>
                    <a
                      href={`${pages.checks.path}#checks-${c.group}`}
                      className="inline-flex min-h-11 items-center rounded-pill border-[1.5px] border-ink bg-card px-4 text-[15px] font-semibold [text-shadow:none] hover:bg-paper"
                    >
                      {c.text}
                    </a>
                  </li>
                ) : (
                  <li key={c.text} className="leading-relaxed text-ink-2">
                    {c.text}
                  </li>
                ),
              )}
            </ul>
          </div>
          {(() => {
            const m = LOOP_MEDIA[step.id];
            return m?.src ? <Clip m={m} /> : null;
          })()}
        </div>
      )}
    </Section>
  );
}

function Models() {
  return (
    <Section id="models" title={how.modelsTitle} lead={how.modelsLead}>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {how.models.map((m) => (
          <li key={m.name} className={cx(card, 'flex flex-col p-5')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-xl font-bold">{m.name}</h3>
              <span className={cx(chipBase, chip.cobalt)}>{m.verb}</span>
            </div>
            <p className="mt-2 leading-relaxed text-ink-2">{m.job}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[15px] text-muted">{how.voiceNote}</p>
    </Section>
  );
}

const PROFILES = ['economy', 'quality', 'open'] as const;

function Profiles() {
  return (
    <Section id="profiles" title={how.profilesTitle} lead={how.profilesLead}>
      {/* Wide screens: a table. Narrow screens: the same rows as cards (only one is shown). */}
      <div className={cx(card, 'hidden overflow-hidden md:block')}>
        <table className="w-full border-collapse text-left text-[15px]">
          <caption className="sr-only">{how.profilesCaption}</caption>
          <thead className="bg-surface-2">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                {how.profilesJob}
              </th>
              {PROFILES.map((p) => (
                <th key={p} scope="col" className="px-4 py-3 font-semibold">
                  {how.profiles[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PROFILE_ROWS.map((r) => (
              <tr key={r.label} className="border-t border-ink">
                <th scope="row" className="px-4 py-3 font-medium">
                  {r.label}
                </th>
                {PROFILES.map((p) => (
                  <td key={p} className="px-4 py-3 text-ink-2">
                    {r[p]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden">
        {PROFILE_ROWS.map((r) => (
          <li key={r.label} className={cx(card, 'p-4')}>
            <h3 className="font-semibold">{r.label}</h3>
            <dl className="mt-2 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-[15px]">
              {PROFILES.map((p) => (
                <div key={p} className="contents">
                  <dt className="text-muted">{how.profiles[p]}</dt>
                  <dd className="text-ink-2">{r[p]}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-muted">{how.profilesNote}</p>
    </Section>
  );
}

function Rails() {
  return (
    <Section id="rails" title={how.railsTitle} lead={how.railsLead}>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {how.rails.map((r) => (
          <li key={r.name} className={cx(card, 'p-5')}>
            <h3 className="font-semibold">{r.name}</h3>
            <p className="mt-1 leading-relaxed text-ink-2">{r.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Redesigns() {
  const schemes = partsOf('color').map((c) => ({ id: c.id, name: c.name, p: palette(c) }));
  return (
    <Section id="redesigns" title={how.redesignTitle} lead={how.redesignLead}>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {how.redesignFlow.map((s, i) => (
          <li key={s.name} className={cx(card, 'flex gap-4 p-4')}>
            <span
              aria-hidden="true"
              className="flex size-8 flex-none items-center justify-center rounded-full bg-ink font-mono text-sm text-card [text-shadow:none]"
            >
              {i + 1}
            </span>
            <div>
              <h3 className="font-semibold">{s.name}</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className={cx(card, 'mt-8 bg-lilac-tint p-6')}>
        <h3 className="font-display text-xl font-bold">{how.whenTitle}</h3>
        <p className="mt-2 max-w-3xl leading-relaxed text-ink-2">{how.when}</p>
      </div>

      <h3 className="mt-12 font-display text-2xl font-bold">{how.libraryTitle}</h3>
      <p className="mt-3 max-w-3xl leading-relaxed text-ink-2">{how.library}</p>
      <ul className="mt-6 flex flex-wrap gap-2">
        {PART_KINDS.map((k) => (
          <li
            key={k}
            className="rounded-pill border-[1.5px] border-ink bg-card px-3 py-1 text-[15px] [text-shadow:none]"
          >
            <b>{partsOf(k).length}</b> {how.libraryKinds[k]}
          </li>
        ))}
      </ul>
      <p className="mt-6 text-ink-2">{how.librarySwatches}</p>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {schemes.map(({ id, name, p }) => (
          <li key={id} className="overflow-hidden rounded-card border-[1.5px] border-ink bg-card">
            <div className="flex h-12" aria-hidden="true">
              {[p.bg, p.surface, p.text, p.accent, p.accent2].map((c, i) => (
                <span key={i} className="flex-1" style={{ background: c }} />
              ))}
            </div>
            <div className="px-3 py-2 text-[15px] font-medium">{name}</div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

import { Download as DownloadIcon } from 'lucide-react';
import { useState } from 'react';
import { PageHeader, Section } from '../components/Section';
import { button, card, chip, chipBase, cx, link, size } from '../components/ui';
import { download } from '../content/download';
import { builds, flags, links, macBeta } from '../content/site';
import { detectPlatform } from '../lib/platform';

export function Download() {
  const [detected] = useState(detectPlatform);
  return (
    <>
      <PageHeader title={download.title} lead={download.lead} />

      <Section id="builds" title={download.buildsTitle}>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {builds.map((b) => (
            <li key={b.id} className={cx(card, 'flex flex-col p-5')}>
              <h3 className="font-display text-xl font-bold">{b.name}</h3>
              <p className="text-[15px] text-muted">{b.note}</p>
              {b.platform === 'mac' && !flags.macTested && (
                <p className={cx(chipBase, chip.sun, 'mt-2')}>{macBeta}</p>
              )}
              <a
                href={b.href}
                className={cx(
                  b.platform === detected ? button.primary : button.secondary,
                  size.md,
                  'mt-4',
                )}
              >
                <DownloadIcon size={18} aria-hidden="true" />
                <span>
                  <span className="sr-only">
                    {download.get} {b.name},{' '}
                  </span>
                  {b.file}
                </span>
              </a>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-2">{b.install}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6">
          <a href={links.releases} className={link}>
            {download.releaseNotes}
          </a>
        </p>
      </Section>

      <Section id="requirements" title={download.requirementsTitle}>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {download.requirements.map((r) => (
            <li key={r.name} className={cx(card, 'p-5')}>
              <h3 className="font-semibold">{r.name}</h3>
              <p className="mt-1 leading-relaxed text-ink-2">{r.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="start" title={download.startTitle}>
        <ol className={cx(card, 'flex flex-col gap-4 p-5 sm:p-6')}>
          {download.steps.map((s, i) => (
            <li key={s} className="flex gap-4">
              <span
                aria-hidden="true"
                className="flex size-8 flex-none items-center justify-center rounded-full bg-ink font-mono text-sm text-card"
              >
                {i + 1}
              </span>
              <span className="pt-1 leading-relaxed">{s}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="works-with" title={download.worksTitle}>
        <ul className="grid gap-4 md:grid-cols-3">
          {download.works.map((w) => (
            <li key={w.name} className={cx(card, 'bg-mint-tint p-5')}>
              <h3 className="font-semibold">{w.name}</h3>
              <p className="mt-1 leading-relaxed text-ink-2">{w.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="limits" title={download.limitsTitle}>
        <ul className={cx(card, 'flex list-disc flex-col gap-2 py-5 pr-5 pl-10 sm:pr-6')}>
          {download.limits
            .filter((l) => flags.macTested === false || !l.startsWith('macOS'))
            .map((l) => (
              <li key={l} className="leading-relaxed">
                {l}
              </li>
            ))}
        </ul>
      </Section>

      <Section id="privacy" title={download.privacyTitle}>
        <dl className="grid gap-4 md:grid-cols-2">
          {download.privacy.map((p) => (
            <div key={p.name} className={cx(card, 'p-5')}>
              <dt className="font-semibold">{p.name}</dt>
              <dd className="mt-1 leading-relaxed text-ink-2">{p.body}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="faq" title={download.faqTitle}>
        <div className="flex max-w-3xl flex-col gap-3">
          {download.faq.map((f) => (
            <details key={f.q} className={cx(card, 'p-5')}>
              <summary className="cursor-pointer font-semibold">{f.q}</summary>
              <p className="mt-3 leading-relaxed text-ink-2">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>
    </>
  );
}

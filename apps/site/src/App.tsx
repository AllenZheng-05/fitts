import {
  Download,
  Hand,
  Mic,
  MonitorSmartphone,
  Octagon,
  Shield,
  Undo2,
  Wallet,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { BeforeAfter } from './BeforeAfter';
import {
  beforeAfter,
  control,
  demo,
  devices,
  downloads,
  faq,
  footer,
  hero,
  links,
  nav,
  science,
  start,
  steps,
  talk,
  type Os,
} from './content';

/** The real before and after: allenzheng.com's 2007 edition, and Fitts's verified redesign of it. */
const SHOTS = { before: '/media/portfolio-before.png', after: '/media/portfolio-after.png' };

/** The visitor's platform, for the main download button. */
function detectOs(): Os {
  const ua = navigator.userAgent;
  if (/Mac/i.test(ua)) return 'mac';
  if (/Linux|X11/i.test(ua) && !/Android/i.test(ua)) return 'linux';
  return 'windows';
}

/** GitHub's mark (lucide has no brand icons). */
function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

const CARD = 'rounded-card border-[1.5px] border-ink bg-card p-5 shadow-panel';
const BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-control border-[1.5px] border-ink px-5 font-semibold shadow-button transition-transform hover:-translate-y-px active:translate-y-px';

export function App() {
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-ink px-4 py-2 text-paper focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {nav.skip}
      </a>
      <Nav />
      <main id="main">
        <Hero />
        <Section id="before-after" title={beforeAfter.title} lead={beforeAfter.lead}>
          {SHOTS.after ? (
            <>
              <BeforeAfter before={SHOTS.before} after={SHOTS.after} />
              <p className="mt-3 text-sm text-muted">{beforeAfter.caption}</p>
            </>
          ) : (
            <div className="grid gap-4 md:grid-cols-[3fr_2fr] md:items-center">
              <img
                src={SHOTS.before}
                alt="The 2007 version of allenzheng.com: neon pink and yellow on black, five fonts, a visitor counter."
                className="w-full rounded-panel border-[1.5px] border-ink shadow-hero"
              />
              <p className={`${CARD} bg-sun-tint`}>{beforeAfter.pending}</p>
            </div>
          )}
        </Section>
        <Steps />
        <Science />
        <Section id="devices" title={devices.title} lead={devices.body}>
          <ul className="flex flex-wrap gap-2">
            {devices.list.map((d) => (
              <li
                key={d}
                className="flex items-center gap-2 rounded-full border-[1.5px] border-ink bg-card px-4 py-2 text-sm font-medium"
              >
                <MonitorSmartphone size={16} aria-hidden="true" />
                {d}
              </li>
            ))}
          </ul>
        </Section>
        <Control />
        <Section id="talk" title={talk.title} lead={talk.body}>
          <ul className="flex flex-wrap gap-3">
            {talk.examples.map((e) => (
              <li key={e} className={`${CARD} flex items-center gap-3 bg-lilac-tint`}>
                <Mic size={18} aria-hidden="true" className="text-lilac-ink" />
                <span className="font-medium">{e}</span>
              </li>
            ))}
          </ul>
        </Section>
        <Section id="demo" title={demo.title}>
          {links.video ? (
            <div className="aspect-video overflow-hidden rounded-panel border-[1.5px] border-ink shadow-hero">
              <iframe
                src={links.video}
                title={demo.title}
                className="size-full"
                allow="encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <p className={`${CARD} max-w-3xl`}>{demo.noVideo}</p>
          )}
        </Section>
        <GetStarted />
        <Faq />
      </main>
      <Footer />
    </>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b-[1.5px] border-ink bg-paper/95 backdrop-blur">
      <nav
        aria-label="Site"
        className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6"
      >
        <a href="#top" className="flex items-center gap-2 font-display text-2xl font-extrabold">
          <img src="/icon.png" alt="" className="size-8" />
          Fitts
        </a>
        <ul className="ml-auto hidden items-center gap-5 text-sm font-medium md:flex">
          <li>
            <a href="#how" className="hover:text-cobalt-ink">
              {nav.how}
            </a>
          </li>
          <li>
            <a href="#science" className="hover:text-cobalt-ink">
              {nav.science}
            </a>
          </li>
          <li>
            <a href="#demo" className="hover:text-cobalt-ink">
              {nav.demo}
            </a>
          </li>
        </ul>
        <a
          href="#download"
          className={`${BUTTON} ml-auto min-h-10 bg-cobalt px-4 text-sm text-white md:ml-0`}
        >
          {nav.download}
        </a>
        <a
          href={links.github}
          aria-label={nav.github}
          className="flex size-10 items-center justify-center rounded-control border-[1.5px] border-ink bg-card"
        >
          <GitHubMark />
        </a>
      </nav>
    </header>
  );
}

function DownloadMain() {
  const [os] = useState(detectOs);
  const d = downloads.find((x) => x.os === os) ?? downloads[0];
  return (
    <a href={d.href} className={`${BUTTON} bg-cobalt text-white`}>
      <Download size={18} aria-hidden="true" />
      {hero.download.replace('{os}', d.name.replace(/ \(.*\)$/, ''))}
    </a>
  );
}

function Hero() {
  return (
    <section id="top" className="mx-auto max-w-6xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24">
      <p className="font-mono text-sm text-muted">{hero.eyebrow}</p>
      <h1 className="mt-4 max-w-4xl font-display text-5xl leading-[1.02] font-extrabold tracking-tight text-balance sm:text-7xl">
        {hero.title}
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-2 sm:text-xl">{hero.lead}</p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <DownloadMain />
        <a href="#how" className={`${BUTTON} bg-card`}>
          {hero.watch}
        </a>
        <a href="#download" className="text-sm font-medium underline underline-offset-4">
          {hero.otherPlatforms}
        </a>
      </div>
      <p className="mt-4 text-sm text-muted">{hero.meta}</p>
      <img
        src="/media/app.png"
        alt="Fitts at work: the site it's testing on the left, findings and the conversation on the right."
        className="mt-14 w-full rounded-hero border-[1.5px] border-ink shadow-hero"
      />
    </section>
  );
}

function Section({
  id,
  title,
  lead,
  children,
  tone = '',
}: {
  id: string;
  title: string;
  lead?: string;
  children: ReactNode;
  tone?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-16 border-t-[1.5px] border-ink py-20 ${tone}`}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h2>
        {lead && <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-2">{lead}</p>}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

function Steps() {
  return (
    <Section id="how" title={steps.title} tone="bg-surface-2">
      <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {steps.items.map((s) => (
          <li key={s.n} className={CARD}>
            <span className="font-mono text-sm text-cobalt-ink">{s.n}</span>
            <h3 className="mt-2 font-display text-xl font-bold">{s.title}</h3>
            <p className="mt-2 leading-relaxed text-ink-2">{s.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Science() {
  return (
    <Section id="science" title={science.title}>
      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <div>
          <h3 className="font-display text-2xl font-bold">{science.fittsTitle}</h3>
          {science.fitts.map((p) => (
            <p key={p} className="mt-4 leading-relaxed text-ink-2">
              {p}
            </p>
          ))}
        </div>
        <figure className={`${CARD} self-start bg-cobalt-tint`}>
          <p className="font-mono text-lg font-semibold whitespace-nowrap sm:text-xl">
            {science.formula}
          </p>
          <figcaption className="mt-3 text-ink-2">{science.formulaNote}</figcaption>
        </figure>
      </div>

      <h3 className="mt-16 font-display text-2xl font-bold">{science.nielsenTitle}</h3>
      <p className="mt-3 max-w-3xl leading-relaxed text-ink-2">{science.nielsenLead}</p>
      <ul className="mt-6 grid gap-3 md:grid-cols-2">
        {science.heuristics.map((h) => (
          <li key={h.id} className="flex gap-4 rounded-card border-[1.5px] border-ink bg-card p-4">
            <span className="flex size-11 flex-none items-center justify-center rounded-control bg-sun font-mono text-sm font-bold">
              {h.id}
            </span>
            <div>
              <p className="font-semibold">{h.name}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{h.how}</p>
            </div>
          </li>
        ))}
      </ul>

      <h3 className="mt-16 font-display text-2xl font-bold">{science.lensesTitle}</h3>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {science.lenses.map((l) => (
          <li key={l.name} className={`${CARD} bg-mint-tint`}>
            <p className="font-semibold">{l.name}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-2">{l.body}</p>
          </li>
        ))}
      </ul>

      <div className="mt-16 grid gap-4 md:grid-cols-2">
        <div className={CARD}>
          <h3 className="font-display text-xl font-bold">{science.evidenceTitle}</h3>
          <p className="mt-2 leading-relaxed text-ink-2">{science.evidence}</p>
        </div>
        <div className={`${CARD} bg-lilac-tint`}>
          <h3 className="font-display text-xl font-bold">{science.redesignTitle}</h3>
          <p className="mt-2 leading-relaxed text-ink-2">{science.redesign}</p>
        </div>
      </div>
    </Section>
  );
}

const CONTROL_ICONS = [Octagon, Hand, Shield, MonitorSmartphone, Undo2, Wallet];

function Control() {
  return (
    <Section id="control" title={control.title} tone="bg-surface-2">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {control.items.map((c, i) => {
          const Icon = CONTROL_ICONS[i] ?? Shield;
          return (
            <li key={c.name} className={CARD}>
              <Icon size={20} aria-hidden="true" className="text-cobalt-ink" />
              <p className="mt-3 font-semibold">{c.name}</p>
              <p className="mt-1 leading-relaxed text-ink-2">{c.body}</p>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function GetStarted() {
  return (
    <Section id="download" title={start.title} lead={start.needs}>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {downloads.map((d) => (
          <li key={d.os} className={`${CARD} flex flex-col`}>
            <p className="font-display text-xl font-bold">{d.name}</p>
            <p className="text-sm text-muted">{d.note}</p>
            <a href={d.href} className={`${BUTTON} mt-4 bg-cobalt text-sm text-white`}>
              <Download size={16} aria-hidden="true" />
              {d.file}
            </a>
            <p className="mt-4 text-sm leading-relaxed text-ink-2">{d.install}</p>
          </li>
        ))}
      </ul>
      <ol className="mt-10 grid gap-3 md:grid-cols-4">
        {start.steps.map((s, i) => (
          <li key={s} className="flex gap-3">
            <span className="flex size-8 flex-none items-center justify-center rounded-full bg-ink font-mono text-sm text-paper">
              {i + 1}
            </span>
            <span className="leading-relaxed">{s}</span>
          </li>
        ))}
      </ol>
      <p className="mt-8">
        <a href={links.releases} className="font-medium underline underline-offset-4">
          {start.all}
        </a>
      </p>
    </Section>
  );
}

function Faq() {
  return (
    <Section id="faq" title={faq.title} tone="bg-surface-2">
      <div className="flex max-w-3xl flex-col gap-3">
        {faq.items.map((f) => (
          <details key={f.q} className="group rounded-card border-[1.5px] border-ink bg-card p-5">
            <summary className="cursor-pointer font-semibold">{f.q}</summary>
            <p className="mt-3 leading-relaxed text-ink-2">{f.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

function Footer() {
  return (
    <footer className="border-t-[1.5px] border-ink">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-10 text-sm text-ink-2 sm:flex-row sm:items-center sm:px-6">
        <div>
          <p>{footer.made}</p>
          <p className="text-muted">{footer.built}</p>
        </div>
        <div className="flex gap-5 sm:ml-auto">
          <a href={links.portfolio} className="underline underline-offset-4">
            {footer.portfolio}
          </a>
          <a href={links.github} className="underline underline-offset-4">
            {footer.github}
          </a>
        </div>
      </div>
    </footer>
  );
}

import { ArrowRight, Download, Play } from 'lucide-react';
import { useState } from 'react';
import { FittsMark, GitHubMark } from '../components/brand';
import { button, card, chip, chipBase, cx, link, size } from '../components/ui';
import { home } from '../content/home';
import { links, macBeta, flags, pages, platforms } from '../content/site';
import { detectPlatform } from '../lib/platform';

export function Home() {
  return (
    <>
      <Hero />
      <section aria-labelledby="video-title" className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
        <h2 id="video-title" className="sr-only">
          {home.videoTitle}
        </h2>
        <Video />
      </section>
      <section aria-labelledby="more-title" className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <h2 id="more-title" className="font-display text-3xl font-extrabold tracking-tight">
          {home.moreTitle}
        </h2>
        <ul className="mt-6 grid gap-4 md:grid-cols-3">
          {home.cards.map((c) => (
            <li key={c.page}>
              <a
                href={pages[c.page].path}
                className={cx(
                  card,
                  'group flex h-full flex-col p-6 transition-[transform,box-shadow] hover:-translate-x-px hover:-translate-y-px hover:shadow-hero',
                )}
              >
                <span className="font-display text-2xl font-bold">{c.title}</span>
                <span className="mt-2 leading-relaxed text-ink-2">{c.body}</span>
                <span aria-hidden="true" className="mt-auto pt-4 text-cobalt-ink">
                  <ArrowRight
                    size={22}
                    className="transition-transform group-hover:translate-x-1"
                  />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Hero() {
  const [detected] = useState(detectPlatform);
  // Unknown computer: Windows is the most common, so it gets the filled button.
  const primary = detected ?? 'windows';
  const onPhone = detected === null && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return (
    <section className="mx-auto flex min-h-[calc(100svh-4rem)] max-w-6xl flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
      <h1 className="flex items-center justify-center gap-3 font-display text-[76px] leading-none font-extrabold tracking-[-0.04em] sm:gap-5 sm:text-[128px] lg:text-[168px]">
        <FittsMark className="size-[72px] flex-none sm:size-[120px] lg:size-[160px]" />
        {home.name}
      </h1>
      <p className="mt-6 font-display text-[28px] leading-tight font-bold text-balance sm:text-5xl">
        {home.tagline}
      </p>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-balance text-ink-2 sm:text-xl">
        {home.line}
      </p>

      <ul className="mt-10 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
        {platforms.map(({ platform, label, build }) => (
          <li key={platform}>
            <a
              href={build.href}
              className={cx(
                platform === primary ? button.primary : button.secondary,
                size.lg,
                'w-full sm:min-w-44',
              )}
            >
              <Download size={20} aria-hidden="true" />
              <span>
                <span className="sr-only">{home.download.replace('{os}', '')}</span>
                {label}
              </span>
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[15px] text-muted">
        {home.meta}
        {!flags.macTested && (
          <span className="block sm:inline">
            <span className="hidden sm:inline">{' · '}</span>
            {platforms.find((p) => p.platform === 'mac')?.label} {macBeta}
          </span>
        )}
      </p>
      <p className="mt-2">
        <a href={pages.download.path} className={link}>
          {home.notes}
        </a>
      </p>
      {onPhone && (
        <p className={cx(chipBase, chip.sun, 'mt-4 !self-center px-3 py-1 font-semibold')}>
          {home.phone}
        </p>
      )}
      <a href={links.github} className={cx(button.secondary, size.md, 'mt-8')}>
        <GitHubMark />
        {home.github}
      </a>
    </section>
  );
}

function Video() {
  if (links.video)
    return (
      <div className={cx(card, 'aspect-video overflow-hidden shadow-hero')}>
        <iframe
          src={links.video}
          title={home.videoTitle}
          className="size-full"
          loading="lazy"
          allow="encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    );
  return (
    <div
      className={cx(
        card,
        'mx-auto flex max-w-4xl flex-col items-center justify-center gap-4 bg-sun-tint px-6 py-12 text-center shadow-hero sm:aspect-video',
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-16 items-center justify-center rounded-full border-[1.5px] border-ink bg-card shadow-button"
      >
        <Play size={26} className="translate-x-0.5" />
      </span>
      <p className={cx(chipBase, chip.outline, '!self-center')}>{home.videoPendingLabel}</p>
      <p className="max-w-xl leading-relaxed text-ink-2">{home.videoPending}</p>
    </div>
  );
}

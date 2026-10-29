// hartwell-site: a family funeral home whose look reads as a party (SPEC §9.4, §6.7).
// `now` is the playful version; `fixed` renders one of three calmer directions.
import type { CSSProperties } from 'react';
import { HARTWELL_THEMES } from './hartwell-themes';
import type { MockSiteProps } from './types';

const PAGES: Record<string, { title: string; now: string; calm: string }> = {
  '/': {
    title: 'Hartwell Family Funeral Home',
    now: 'Celebrate life with us. Party packages starting at $999!',
    calm: 'Caring for families in Riverside since 1962. Service options from $999.',
  },
  '/services': {
    title: 'Services',
    now: 'Make it a day to remember! Balloons, DJs and more!',
    calm: 'Funerals, memorials and cremation, arranged with care.',
  },
  '/services/packages': {
    title: 'Party packages',
    now: 'Pick a package and let us handle the fun!',
    calm: 'Three service options, each with clear prices.',
  },
  '/about': {
    title: 'About us',
    now: 'We love what we do!!!',
    calm: 'Three generations of the Hartwell family, here when you need us.',
  },
  '/obituaries': {
    title: 'Obituaries',
    now: 'Remembering amazing people!',
    calm: 'Read and share memories of those we have served.',
  },
  '/contact': {
    title: 'Contact',
    now: 'Hit us up anytime!',
    calm: 'Call us day or night at (555) 014-2290.',
  },
};

export function HartwellSite({
  route,
  navigate,
  variant,
  direction,
  onElementClick,
}: MockSiteProps) {
  const now = variant === 'now';
  const theme = HARTWELL_THEMES[now ? 'now' : (direction ?? 'quiet')] ?? HARTWELL_THEMES['quiet'];
  if (!theme) return null;
  const page = PAGES[route] ?? PAGES['/'];
  if (!page) return null;
  const title = now
    ? `${page.title.replace('Service options', 'Party packages')}${route === '/' ? '!' : ''}`
    : page.title.replace('Party packages', 'Service options');
  const style: CSSProperties = { background: theme.bg, fontFamily: theme.font, color: theme.body };

  return (
    <div
      data-mock-site
      className="relative flex h-full w-full flex-col overflow-hidden"
      style={style}
    >
      {now && (
        <>
          <span
            aria-hidden="true"
            className="absolute top-[8%] left-[12%] size-3.5 rounded-full bg-[#FF4FA3]"
          />
          <span
            aria-hidden="true"
            className="absolute top-[14%] left-[70%] size-3 rotate-[30deg] rounded-[3px] bg-[#FFD60A]"
          />
          <span
            aria-hidden="true"
            className="absolute top-[62%] left-[40%] size-4 rounded-full bg-[#2EC4FF]"
          />
        </>
      )}
      <nav className="relative flex flex-wrap gap-4 px-[26px] pt-12 text-[13px]">
        {Object.keys(PAGES).map((path) => (
          <button
            key={path}
            type="button"
            data-ref={`nav-${path === '/' ? 'home' : path.split('/').pop()}`}
            data-label={PAGES[path]?.title}
            onClick={() => {
              onElementClick?.(`nav-${path}`, PAGES[path]?.title ?? path);
              navigate(path);
            }}
            className={route === path ? 'font-bold underline' : 'underline'}
          >
            {now
              ? PAGES[path]?.title
              : PAGES[path]?.title.replace('Party packages', 'Service options')}
          </button>
        ))}
      </nav>
      <main className="relative flex flex-col gap-4 px-[26px] py-9">
        <span
          className="text-[32px] leading-[1.05]"
          style={{ color: theme.ink, fontWeight: theme.headingWeight }}
          data-ref="hero-title"
        >
          {title}
        </span>
        <span className="text-[16px]">{now ? page.now : page.calm}</span>
        <button
          type="button"
          data-ref="hero-cta"
          data-label={now ? 'Book now' : 'Arrange a service'}
          className={`self-start px-5 py-[13px] font-bold ${now ? '-rotate-3' : ''}`}
          style={{
            background: theme.accent,
            color: theme.accentText,
            borderRadius: theme.pill ? 999 : theme.radius,
            fontWeight: now ? 800 : 600,
          }}
          onClick={() => navigate('/contact')}
        >
          {now ? 'Book now' : 'Arrange a service'}
        </button>
        <div
          className="h-[120px]"
          style={{ background: theme.block, borderRadius: theme.radius }}
        />
      </main>
    </div>
  );
}

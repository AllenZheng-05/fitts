// Stand-in "your site" for projects without a scripted demo.
import { SITE_FONT, type MockSiteProps } from './types';

export function GenericSite({ route, navigate }: MockSiteProps) {
  const pages = ['/', '/about', '/contact'];
  return (
    <div
      data-mock-site
      className={`${SITE_FONT} flex h-full w-full flex-col overflow-y-auto bg-white text-[#1d1d1b]`}
    >
      <nav className="flex gap-4 border-b border-[#E4E1DA] px-6 py-3 text-[14px]">
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            data-ref={`nav-${p === '/' ? 'home' : p.slice(1)}`}
            data-label={p === '/' ? 'Home' : p.slice(1)}
            onClick={() => navigate(p)}
            className={route === p ? 'font-bold underline' : 'underline'}
          >
            {p === '/' ? 'Home' : p.slice(1).replace(/^./, (c) => c.toUpperCase())}
          </button>
        ))}
      </nav>
      <main className="flex flex-col gap-3 px-6 py-10">
        <h1 className="text-[28px] font-bold">{route === '/' ? 'Welcome' : route.slice(1)}</h1>
        <p className="max-w-[420px] text-[15px] text-[#4A4843]">
          This is a stand-in for your site. Fitts uses it the way people do.
        </p>
        <button
          type="button"
          data-ref="hero-cta"
          data-label="Get in touch"
          onClick={() => navigate('/contact')}
          className="self-start rounded-[6px] bg-[#1F2A88] px-4 py-2 text-white"
        >
          Get in touch
        </button>
      </main>
    </div>
  );
}

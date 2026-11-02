import { Menu, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { footer, links, nav, NAV_PAGES, pages, type PageId } from '../content/site';
import { FittsMark, GitHubMark } from './brand';
import { button, cx, size } from './ui';

const current = (id: PageId, page: PageId) => (id === page ? ('page' as const) : undefined);

/** The site's header: the wordmark (Home), the other four pages, and GitHub. */
export function Nav({ page }: { page: PageId }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const others = NAV_PAGES.filter((p) => p !== 'home' && p !== 'download');

  // Esc closes the open menu and puts focus back on its button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      toggle.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b-[1.5px] border-ink bg-paper">
      <nav
        aria-label={nav.label}
        className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6"
      >
        <a
          href={pages.home.path}
          aria-label={nav.homeLabel}
          aria-current={current('home', page)}
          className="flex min-h-11 items-center gap-2 rounded-control font-display text-[22px] font-extrabold tracking-[-0.02em]"
        >
          <FittsMark size={32} />
          <span aria-hidden="true">Fitts</span>
        </a>

        <ul className="ml-auto hidden items-center gap-1 text-[15px] font-medium lg:flex">
          {others.map((id) => (
            <li key={id}>
              <a
                href={pages[id].path}
                aria-current={current(id, page)}
                className="flex min-h-11 items-center rounded-control px-3 hover:bg-surface-2 aria-[current=page]:bg-ink aria-[current=page]:text-card"
              >
                {pages[id].nav}
              </a>
            </li>
          ))}
        </ul>

        <a
          href={pages.download.path}
          aria-current={current('download', page)}
          className={cx(button.primary, size.sm, 'ml-auto lg:ml-2')}
        >
          {pages.download.nav}
        </a>
        <a
          href={links.github}
          aria-label={nav.github}
          className="hidden size-11 flex-none items-center justify-center rounded-control border-[1.5px] border-ink bg-card hover:bg-paper sm:flex"
        >
          <GitHubMark />
        </a>
        <button
          ref={toggle}
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((o) => !o)}
          className="flex size-11 flex-none items-center justify-center rounded-control border-[1.5px] border-ink bg-card hover:bg-paper lg:hidden"
        >
          {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          <span className="sr-only">{nav.menu}</span>
        </button>
      </nav>

      <div id={menuId} hidden={!open} className="border-t-[1.5px] border-ink bg-paper lg:hidden">
        <ul className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3 sm:px-6">
          {NAV_PAGES.map((id) => (
            <li key={id}>
              <a
                href={pages[id].path}
                aria-current={current(id, page)}
                className="flex min-h-11 items-center rounded-control px-3 font-medium hover:bg-surface-2 aria-[current=page]:bg-ink aria-[current=page]:text-card"
              >
                {pages[id].nav}
              </a>
            </li>
          ))}
          <li className="sm:hidden">
            <a
              href={links.github}
              className="flex min-h-11 items-center gap-2 rounded-control px-3 font-medium hover:bg-surface-2"
            >
              <GitHubMark />
              {footer.github}
            </a>
          </li>
        </ul>
      </div>
    </header>
  );
}

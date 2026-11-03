import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { nav, type PageId } from '../content/site';
import { Field } from '../field/Field';
import { Footer } from './Footer';
import { Nav } from './Nav';
import '../styles/index.css';

/** Every page: skip link, nav, the 3D field behind, the page's content, the footer. */
export function Page({ page, children }: { page: PageId; children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="pointer-events-none fixed top-3 left-3 z-50 flex min-h-11 items-center rounded-control bg-ink px-4 font-semibold text-card opacity-0 focus:pointer-events-auto focus:opacity-100"
      >
        {nav.skip}
      </a>
      <Field mode={page === 'home' ? 'lively' : 'calm'} />
      <Nav page={page} />
      <main id="main" className="relative z-10">
        {children}
      </main>
      <Footer />
    </>
  );
}

/** Renders a page into #root (each HTML entry calls this once). */
export function mount(page: PageId, children: ReactNode) {
  const root = document.getElementById('root');
  if (!root) return;
  createRoot(root).render(
    <StrictMode>
      <Page page={page}>{children}</Page>
    </StrictMode>,
  );
}

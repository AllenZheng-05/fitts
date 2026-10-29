import { useEffect, useState, type ReactNode } from 'react';

const NAV = [
  { path: '/', label: 'Hartwell Family Funeral Home', ref: 'nav-home' },
  { path: '/services', label: 'Services', ref: 'nav-services' },
  { path: '/services/packages', label: 'Party packages', ref: 'nav-packages' },
  { path: '/about', label: 'About us', ref: 'nav-about' },
  { path: '/obituaries', label: 'Obituaries', ref: 'nav-obituaries' },
  { path: '/contact', label: 'Contact', ref: 'nav-contact' },
];

function navigate(path: string) {
  history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const update = () => setPath(location.pathname);
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  return path;
}

function Hero({ title, line, cta = true }: { title: string; line: string; cta?: boolean }) {
  return (
    <>
      <h1 className="hero-title" data-ref="hero-title">
        {title}
      </h1>
      <p>{line}</p>
      {cta && (
        <button
          type="button"
          data-ref="hero-cta"
          className="cta"
          onClick={() => navigate('/contact')}
        >
          Book now
        </button>
      )}
    </>
  );
}

const SERVICES = [
  { name: 'Party funeral', text: 'Balloons, a DJ and a dance floor. Make it a day to remember!' },
  { name: 'Memorial bash', text: 'A big celebration with games and a photo booth.' },
  { name: 'Cremation fiesta', text: 'Simple, quick and so much fun.' },
];

function page(path: string): ReactNode {
  switch (path) {
    case '/services':
      return (
        <>
          <Hero title="Services" line="Make it a day to remember! Balloons, DJs and more!" />
          <ul className="cards">
            {SERVICES.map((s) => (
              <li key={s.name} className="card">
                <h2>{s.name}</h2>
                <p>{s.text}</p>
              </li>
            ))}
          </ul>
        </>
      );
    case '/services/packages':
      return (
        <>
          <Hero title="Party packages" line="Pick a package and let us handle the fun!" />
          <ul className="cards">
            {['Bronze bash · $999', 'Silver soirée · $2,499', 'Gold gala · $4,999'].map((p) => (
              <li key={p} className="card">
                <h2>{p}</h2>
                <p>Cake, confetti cannons and a playlist of your favorites.</p>
              </li>
            ))}
          </ul>
        </>
      );
    case '/about':
      return (
        <Hero title="About us" line="We love what we do!!! Three generations of party people." />
      );
    case '/obituaries':
      return (
        <>
          <Hero title="Obituaries" line="Remembering amazing people!" cta={false} />
          <ul className="cards">
            {['Margaret Ellis, 1938–2026', 'Robert Chen, 1945–2026', 'Ana Ruiz, 1951–2026'].map(
              (o) => (
                <li key={o} className="card">
                  <h2>{o}</h2>
                  <p>Gone but never forgotten!</p>
                </li>
              ),
            )}
          </ul>
        </>
      );
    case '/contact':
      return (
        <>
          <Hero title="Contact" line="Hit us up anytime! Call (555) 014-2290." cta={false} />
          <form
            className="form"
            data-ref="contact-form"
            onSubmit={(e) => {
              e.preventDefault();
            }}
          >
            <input aria-label="Your name" placeholder="Your name" />
            <input aria-label="Email" placeholder="Email" type="email" />
            <textarea aria-label="Message" placeholder="Message" rows={4} />
            <button type="submit" data-ref="contact-submit" className="cta">
              Go
            </button>
          </form>
        </>
      );
    default:
      return (
        <>
          <Hero
            title="Hartwell Family Funeral Home!"
            line="Celebrate life with us. Party packages starting at $999!"
          />
          <div className="block" />
        </>
      );
  }
}

export function App() {
  const path = usePath();
  return (
    <div className="page">
      <span aria-hidden="true" className="confetti a" />
      <span aria-hidden="true" className="confetti b" />
      <span aria-hidden="true" className="confetti c" />
      <nav className="nav">
        {NAV.map((n) => (
          <a
            key={n.path}
            href={n.path}
            data-ref={n.ref}
            className={path === n.path ? 'current' : undefined}
            onClick={(e) => {
              e.preventDefault();
              navigate(n.path);
            }}
          >
            {n.label}
          </a>
        ))}
      </nav>
      <main className="main">{page(path)}</main>
      <footer className="footer" data-ref="footer">
        Hartwell Family Funeral Home · 12 Elm Street, Riverside · Open 24/7 for your party needs
      </footer>
    </div>
  );
}

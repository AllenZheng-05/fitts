import { FittsMark } from '../components/brand';
import { button, card, cx, size } from '../components/ui';
import { NAV_PAGES, notFound as copy, pages } from '../content/site';

export function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70svh] max-w-3xl flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
      <FittsMark className="size-24" />
      <h1 className="mt-6 font-display text-5xl font-extrabold tracking-tight text-balance">
        {copy.title}
      </h1>
      <div className={cx(card, 'mt-8 w-full p-6 text-left')}>
        <p className="leading-relaxed text-ink-2">{copy.body}</p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {NAV_PAGES.filter((p) => p !== 'home').map((id) => (
            <li key={id}>
              <a href={pages[id].path} className={cx(button.secondary, size.sm)}>
                {pages[id].nav}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <a href={pages.home.path} className={cx(button.primary, size.lg, 'mt-8')}>
        {copy.home}
      </a>
    </div>
  );
}

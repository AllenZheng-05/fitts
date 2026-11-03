import { footer, links, META_MODELS, NAV_PAGES, pages } from '../content/site';
import { FittsMark } from './brand';
import { chip, chipBase, cx } from './ui';

const FOOT_LINK =
  'inline-flex min-h-6 items-center underline underline-offset-4 hover:text-cobalt-ink';

export function Footer() {
  return (
    <footer className="relative z-10 border-t-[1.5px] border-ink bg-paper">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 text-[15px] text-ink-2 sm:px-6 md:grid-cols-[3fr_2fr]">
        <div>
          <p className="flex items-center gap-2 font-display text-xl font-extrabold text-ink">
            <FittsMark size={28} />
            Fitts
          </p>
          <p className="mt-3 max-w-xl leading-relaxed">{footer.made}</p>
          <h2 className="mt-6 text-[13px] font-bold tracking-wide text-muted uppercase">
            {footer.modelsTitle}
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {META_MODELS.map((m) => (
              <li key={m} className={cx(chipBase, chip.cobalt)}>
                {m}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[14px] text-muted">{footer.voice}</p>
          <p className="mt-6 text-[14px]">
            <span className="font-semibold text-ink">{footer.audited}</span>
            {footer.auditResult ? `: ${footer.auditResult} ` : '. '}
            {footer.auditResult && (
              <a href={links.auditLog} className={FOOT_LINK}>
                {footer.auditLink}
              </a>
            )}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <ul className="flex flex-col gap-2">
            {NAV_PAGES.map((id) => (
              <li key={id}>
                <a href={pages[id].path} className={FOOT_LINK}>
                  {pages[id].nav}
                </a>
              </li>
            ))}
          </ul>
          <ul className="flex flex-col gap-2">
            <li>
              <a href={links.github} className={FOOT_LINK}>
                {footer.github}
              </a>
            </li>
            <li>
              <a href={links.issues} className={FOOT_LINK}>
                {footer.report}
              </a>
            </li>
            <li>
              <a href={links.license} className={FOOT_LINK}>
                {footer.license}
              </a>
            </li>
            <li>
              <a href={links.portfolio} className={FOOT_LINK}>
                {footer.portfolio}
              </a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

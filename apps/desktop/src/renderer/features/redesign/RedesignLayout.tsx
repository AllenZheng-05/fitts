import type { RunState } from '@fitts/schema';
import { BeforeAfterSlider } from '../../components/BeforeAfterSlider';
import { Button } from '../../components/Button';
import { copy } from '../../copy';
import { format } from '../../lib/format';
import { HARTWELL_THEMES } from '../../mock/sites/hartwell-themes';
import { renderSite } from '../../mock/sites';
import { useSiteRoute } from '../../state/site';
import { useUi } from '../../state/ui';
import { getEngineKind } from '../../state/engine';
import { currentDirection } from './redesign';
import { appliedRedesign, RedesignShots } from './RedesignShots';
import { ChatPanel } from '../chat/ChatPanel';
import { SiteView } from '../site-view/SiteView';

const ALL_PAGES = ['/', '/services', '/services/packages', '/about', '/obituaries', '/contact'];

/**
 * Redesign variant (SPEC §6.7): the site map and tray collapse, the site view becomes a
 * full-height before/after of the site, and the chat is 420px.
 */
export function RedesignLayout({ run }: { run: RunState }) {
  const compare = useUi((s) => s.redesignCompare);
  const everyPage = useUi((s) => s.everyPage);
  const { route } = useSiteRoute(run.projectId);
  const direction = currentDirection(run);
  const afterLabel = format(copy.redesign.afterLabel, {
    name: HARTWELL_THEMES[direction]?.label ?? direction.toUpperCase(),
  });
  const ui = useUi.getState();
  // A real run compares real pictures: the step shot and the mockup, then every page's shots.
  const real = getEngineKind() !== 'mock';
  const applied = real ? appliedRedesign(run) : undefined;

  return (
    <>
      <SiteView
        projectId={run.projectId}
        label={copy.redesign.region}
        className="flex-1"
        interactive={!compare && !everyPage}
        toolbarEnd={
          <>
            <Button
              size="sm"
              variant={compare ? 'dark' : 'secondary'}
              aria-pressed={compare}
              className="font-semibold"
              onClick={() => ui.set({ redesignCompare: !compare })}
            >
              {copy.site.beforeAfter}
            </Button>
            {(!real || applied) && (
              <Button
                size="sm"
                variant={everyPage ? 'dark' : 'secondary'}
                aria-pressed={everyPage}
                className="font-semibold"
                onClick={() => ui.set({ everyPage: !everyPage })}
              >
                {copy.redesign.everyPage}
              </Button>
            )}
          </>
        }
        overlay={() =>
          real ? (
            compare || everyPage ? (
              <RedesignShots run={run} everyPage={everyPage && Boolean(applied)} fill />
            ) : null
          ) : everyPage ? (
            <ul className="absolute inset-0 z-10 flex flex-col gap-3 overflow-y-auto bg-surface-2 p-3">
              {ALL_PAGES.map((page) => (
                <li key={page} className="flex flex-col gap-1">
                  {/* Tags sit above each small comparison, where they can't cover the site. */}
                  <div className="flex items-center gap-2 text-[11px] font-bold">
                    <span className="rounded-tag border border-ink bg-card px-[7px] py-0.5">
                      {copy.slider.before}
                    </span>
                    <span className="flex-1 text-center font-mono text-[12px] font-normal text-muted">
                      {page}
                    </span>
                    <span className="rounded-tag border border-ink bg-card px-[7px] py-0.5">
                      {afterLabel}
                    </span>
                  </div>
                  <BeforeAfterSlider
                    className="h-[220px] bg-card"
                    showTags={false}
                    beforeLabel={copy.slider.before}
                    afterLabel={afterLabel}
                    before={<Mini run={run} route={page} variant="now" />}
                    after={<Mini run={run} route={page} variant="fixed" direction={direction} />}
                  />
                </li>
              ))}
            </ul>
          ) : compare ? (
            <BeforeAfterSlider
              fill
              afterLabel={afterLabel}
              before={renderSite(run.projectId, {
                route,
                navigate: () => undefined,
                variant: 'now',
              })}
              after={renderSite(run.projectId, {
                route,
                navigate: () => undefined,
                variant: 'fixed',
                direction,
              })}
            />
          ) : null
        }
      />
      <ChatPanel run={run} className="w-[420px] flex-none" />
    </>
  );
}

function Mini({
  run,
  route,
  variant,
  direction,
}: {
  run: RunState;
  route: string;
  variant: 'now' | 'fixed';
  direction?: string;
}) {
  return (
    <div className="pointer-events-none h-full overflow-hidden" inert>
      <div className="h-[200%] w-[200%] origin-top-left scale-50">
        {renderSite(run.projectId, { route, navigate: () => undefined, variant, direction })}
      </div>
    </div>
  );
}

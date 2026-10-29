import type { RunState } from '@fitts/schema';
import { BeforeAfterSlider } from '../../components/BeforeAfterSlider';
import { Button } from '../../components/Button';
import { copy } from '../../copy';
import { format } from '../../lib/format';
import { HARTWELL_THEMES } from '../../mock/sites/hartwell-themes';
import { renderSite } from '../../mock/sites';
import { useSiteRoute } from '../../state/site';
import { useUi } from '../../state/ui';
import { currentDirection } from './redesign';
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
            <Button
              size="sm"
              variant={everyPage ? 'dark' : 'secondary'}
              aria-pressed={everyPage}
              className="font-semibold"
              onClick={() => ui.set({ everyPage: !everyPage })}
            >
              {copy.redesign.everyPage}
            </Button>
          </>
        }
        overlay={() =>
          everyPage ? (
            <ul className="absolute inset-0 z-10 flex flex-col gap-3 overflow-y-auto bg-surface-2 p-3">
              {ALL_PAGES.map((page) => (
                <li key={page} className="flex flex-col gap-1">
                  <span className="font-mono text-[12px] text-muted">{page}</span>
                  <BeforeAfterSlider
                    className="h-[220px] bg-card"
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

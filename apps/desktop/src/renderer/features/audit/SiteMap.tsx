import type { RunState } from '@fitts/schema';
import { ProgressBar, StatusDot } from '../../components/StatusChips';
import { copy } from '../../copy';
import { cx } from '../../lib/cx';
import { format } from '../../lib/format';
import { ScrollBody } from '../../components/Panel';
import { useSite } from '../../state/site';
import { useUi } from '../../state/ui';

/**
 * Routes with status dots (SPEC §6.4): mint done, cobalt testing (row tinted), hollow queued.
 * Each row shows its issue count or a label like "next"; status is also given in words.
 */
export function SiteMap({ run, width = 210 }: { run: RunState; width?: number }) {
  const { done, total } = run.controlsTried;
  const selectedPath = useUi((s) => s.findingsRoute);
  // A row shows that page in the site view and narrows the findings tray to it; pressing
  // it again shows every page's findings.
  const pick = (path: string) => {
    const again = selectedPath === path;
    useUi.getState().set({ findingsRoute: again ? null : path });
    if (!again && run.activity !== 'user-driving') useSite.getState().navigate(run.projectId, path);
  };
  return (
    <section
      aria-labelledby="site-map-title"
      className="flex flex-none flex-col gap-2.5 overflow-hidden rounded-panel border-[1.5px] border-ink bg-card p-3.5 shadow-panel"
      style={{ width }}
    >
      <h2 id="site-map-title" className="font-display text-[16px] font-bold">
        {copy.audit.siteMap}
      </h2>
      <ScrollBody label={copy.audit.siteMap} className="-mx-1 px-1">
        <ul className="flex flex-col gap-0.5 font-mono text-[12px]">
          {run.routes.map((route) => {
            const testing = route.status === 'testing';
            const selected = selectedPath === route.path;
            const shown = route.depth > 0 ? `/${route.path.split('/').pop() ?? ''}` : route.path;
            return (
              <li key={route.path}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => pick(route.path)}
                  className={cx(
                    'flex w-full items-center gap-2 rounded-row py-[7px] pr-2 text-left transition-tint',
                    route.depth > 0 ? 'pl-[22px]' : 'pl-2',
                    testing && 'bg-cobalt-tint font-semibold',
                    selected
                      ? 'outline-[1.5px] -outline-offset-[1.5px] outline-ink outline-solid'
                      : 'hover:bg-paper',
                  )}
                >
                  <StatusDot status={route.status} />
                  <span className="min-w-0 flex-1 truncate">
                    {shown}
                    <span className="sr-only">, {copy.audit.routeStatus[route.status]}</span>
                  </span>
                  <span className={testing ? undefined : 'text-muted'}>
                    {route.issues > 0 ? (
                      <>
                        <span aria-hidden="true">{route.issues}</span>
                        <span className="sr-only">
                          {route.issues === 1
                            ? copy.audit.issue
                            : format(copy.audit.issues, { n: route.issues })}
                        </span>
                      </>
                    ) : (
                      (route.label ?? '')
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </ScrollBody>
      <div className="flex flex-none flex-col gap-1.5 rounded-control bg-surface-2 p-2.5">
        <span className="text-[12px] font-bold">
          {format(copy.audit.controlsTried, { done, total })}
        </span>
        <ProgressBar
          label={copy.audit.controlsTried.split(' · ')[0] ?? ''}
          value={total ? done / total : 0}
        />
      </div>
    </section>
  );
}

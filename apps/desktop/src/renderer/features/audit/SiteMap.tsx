import { matchesTemplate, type RunState } from '@fitts/schema';
import { ProgressBar, StatusDot } from '../../components/StatusChips';
import { copy } from '../../copy';
import { cx } from '../../lib/cx';
import { format } from '../../lib/format';
import { ScrollBody } from '../../components/Panel';
import { useSite } from '../../state/site';
import { useUi } from '../../state/ui';

type Row =
  | { kind: 'route'; path: string; route: RunState['routes'][number] }
  | { kind: 'known'; path: string; depth: number; shown: string };

/**
 * The routes the crawl has, in path order, with the pages the code names that it hasn't
 * reached yet among them (SPEC-phase4 §8.3: the map fills in as Fitts works).
 */
function rowsOf(run: RunState): Row[] {
  const rows: Row[] = run.routes.map((route): Row => ({ kind: 'route', path: route.path, route }));
  for (const page of run.appModel?.pages ?? []) {
    const seen = run.routes.some(
      (r) => r.path === page.route || matchesTemplate(page.route, r.path),
    );
    if (seen || page.route.includes(':')) continue;
    const parts = page.route.split('/').filter(Boolean);
    rows.push({
      kind: 'known',
      path: page.route,
      depth: Math.max(0, parts.length - 1),
      shown: parts.length > 1 ? `/${parts.at(-1) ?? ''}` : page.route,
    });
  }
  // The crawl's order stands; a known page goes after the last route that's its parent or
  // an earlier sibling (so it sits in its part of the tree).
  const known = rows.filter((r) => r.kind === 'known');
  const ordered: Row[] = rows.filter((r) => r.kind === 'route');
  for (const k of known) {
    const parent = k.path.split('/').slice(0, -1).join('/') || '/';
    let at = -1;
    ordered.forEach((r, i) => {
      if (r.path === parent || r.path.startsWith(`${parent === '/' ? '' : parent}/`)) at = i;
    });
    ordered.splice(at + 1, 0, k);
  }
  return ordered;
}

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
          {rowsOf(run).map((row) => {
            if (row.kind === 'known')
              return (
                <li
                  key={row.path}
                  className={cx(
                    'flex items-center gap-2 py-[7px] pr-2 text-muted',
                    row.depth > 0 ? 'pl-[22px]' : 'pl-2',
                  )}
                >
                  <StatusDot status="queued" />
                  <span className="min-w-0 flex-1 truncate">
                    {row.shown}
                    <span className="sr-only">, {copy.audit.notYetStatus}</span>
                  </span>
                  <span aria-hidden="true">{copy.audit.notYet}</span>
                </li>
              );
            const route = row.route;
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

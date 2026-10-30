import type { RunState } from '@fitts/schema';
import { useEffect } from 'react';
import { BeforeAfterSlider } from '../../components/BeforeAfterSlider';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { copy } from '../../copy';
import { format, formatClock } from '../../lib/format';
import { renderSite, ROUTE_FOR_REF } from '../../mock/sites';
import { getEngine, recordUserClick } from '../../state/engine';
import { useLiveSite } from '../../state/live-site';
import { useAuditOnly } from '../../state/projects';
import { useSite, useSiteRoute } from '../../state/site';
import { useUi } from '../../state/ui';
import { ChatPanel } from '../chat/ChatPanel';
import { FINDING_PANEL_INSET, FindingPanel } from '../finding-panel/FindingPanel';
import { Overlays } from '../site-view/Overlays';
import { SiteView } from '../site-view/SiteView';
import { FindingsTray } from './FindingsTray';
import { SiteMap } from './SiteMap';

/** Audit & fix (SPEC §6.4): site map | site view | chat, above the findings tray. */
export function AuditLayout({ run }: { run: RunState }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3.5">
      <div className="flex min-h-0 flex-1 gap-3.5">
        <SiteMap run={run} />
        <AuditSiteView run={run} />
        <ChatPanel run={run} className="w-[400px] flex-none" />
      </div>
      <FindingsTray run={run} />
    </div>
  );
}

function AuditSiteView({ run }: { run: RunState }) {
  const highlightsOn = useUi((s) => s.highlightsOn);
  const beforeAfter = useUi((s) => s.beforeAfter);
  const pointing = useUi((s) => s.pointing);
  const { route } = useSiteRoute(run.projectId);
  const driving = run.activity === 'user-driving';
  const rewound = run.rewindStep !== undefined;
  const rewindFinding = rewound
    ? run.findings.find((f) => f.stepIndex === run.rewindStep)
    : undefined;
  const attentionRef = run.overlays.attention?.ref;
  // Live sites are audit-only: there's no fix to compare against.
  const auditOnly = useAuditOnly(run.projectId);

  // The site follows Fitts (or the rewound moment) unless the user has the wheel. With
  // nothing pointed at, it shows the route the site map says is being tested, so the URL
  // bar and the site map never disagree.
  const testingRoute = run.routes.find((r) => r.status === 'testing')?.path;
  // On the live site the real crawler drives navigation itself (SPEC-phase2 §6.1).
  const live = Boolean(useLiveSite(run.projectId));
  useEffect(() => {
    if (driving || live) return;
    const target =
      rewindFinding?.route ??
      (attentionRef ? ROUTE_FOR_REF[attentionRef] : undefined) ??
      testingRoute;
    if (target) useSite.getState().navigate(run.projectId, target);
  }, [driving, live, rewindFinding?.route, attentionRef, testingRoute, run.projectId]);

  const problems = rewindFinding
    ? run.overlays.problems.filter((p) => p.ref === rewindFinding.elementRef)
    : run.overlays.problems;
  const showOverlays = highlightsOn && !driving && !beforeAfter;

  const ui = useUi.getState();
  const findingOpen = useUi((s) => s.openFindingId !== null);
  return (
    <SiteView
      projectId={run.projectId}
      className="flex-1"
      interactive={driving}
      onElementClick={(_ref, label) => {
        if (driving) recordUserClick(run.projectId, label.trim());
      }}
      toolbarEnd={
        <>
          {driving && (
            <Chip tone="sun" className="px-2.5 py-1.5">
              {copy.site.driving}
            </Chip>
          )}
          {rewound ? (
            <>
              <Chip className="px-2.5 py-1.5">
                {format(copy.site.rewound, { step: run.rewindStep ?? 0 })}
              </Chip>
              <Button size="sm" onClick={() => getEngine().rewindTo(run.projectId, null)}>
                {copy.site.backToLive}
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant={highlightsOn ? 'dark' : 'secondary'}
                aria-pressed={highlightsOn}
                className="font-semibold"
                onClick={() => ui.set({ highlightsOn: !highlightsOn })}
              >
                {copy.site.highlights}
              </Button>
              {!auditOnly && (
                <Button
                  size="sm"
                  variant={beforeAfter ? 'dark' : 'secondary'}
                  aria-pressed={beforeAfter}
                  className="font-semibold"
                  onClick={() => ui.set({ beforeAfter: !beforeAfter })}
                >
                  {copy.site.beforeAfter}
                </Button>
              )}
            </>
          )}
          <Button size="sm" aria-pressed={pointing} onClick={() => ui.set({ pointing: !pointing })}>
            {pointing ? copy.site.pointing : copy.site.point}
          </Button>
        </>
      }
      overlay={(surface) =>
        beforeAfter && !auditOnly ? (
          <BeforeAfterSlider
            fill
            before={renderSite(run.projectId, { route, navigate: () => undefined, variant: 'now' })}
            after={renderSite(run.projectId, {
              route,
              navigate: () => undefined,
              variant: 'fixed',
            })}
          />
        ) : showOverlays ? (
          <Overlays
            surface={surface}
            problems={problems}
            attention={rewound ? undefined : run.overlays.attention}
          />
        ) : null
      }
      panel={<FindingPanel run={run} />}
      shot={
        rewound
          ? `fitts-asset://${run.projectId}/${run.runId}/shots/${run.rewindStep ?? 0}.jpg`
          : undefined
      }
      contentInsetRight={findingOpen ? FINDING_PANEL_INSET : undefined}
      footer={
        <div className="flex flex-none justify-between gap-3 border-t border-ink px-3.5 py-2 font-mono text-[12px] text-muted">
          <span>{format(copy.site.step, { step: run.step, total: run.stepEstimate })}</span>
          <span>{format(copy.site.elapsed, { time: formatClock(run.elapsedMs) })}</span>
        </div>
      }
    />
  );
}

import type { RunState } from '@fitts/schema';
import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { SegmentedControl } from '../../components/SegmentedControl';
import { copy } from '../../copy';
import { format, formatClock } from '../../lib/format';
import { TEST_BUILD } from '../../dev';
import { ROUTE_FOR_REF } from '../../mock/sites';
import { getEngine, recordUserClick } from '../../state/engine';
import { useLiveSite } from '../../state/live-site';
import { useAuditOnly } from '../../state/projects';
import { useSite } from '../../state/site';
import { fixedBranch, useSiteVersion } from '../../state/site-versions';
import { useUi } from '../../state/ui';
import { ChatPanel } from '../chat/ChatPanel';
import { FINDING_HOST, FindingPanel } from '../finding-panel/FindingPanel';
import { Overlays } from '../site-view/Overlays';
import { SiteView } from '../site-view/SiteView';
import { FindingsTray } from './FindingsTray';
import { SiteMap } from './SiteMap';
import { CollapsedPanel, ResizeHandle } from '../../components/ResizeHandle';
import { panelSize, useLayout } from '../../state/layout';

/** Audit & fix (SPEC §6.4): site map | site view | chat, above the findings tray. */
export function AuditLayout({ run }: { run: RunState }) {
  // Every panel but the site view can be dragged bigger or smaller, or collapsed.
  const panels = useLayout((s) => s.panels);
  const l = copy.layout;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3.5">
      <div className="flex min-h-0 flex-1 gap-3.5">
        {/* The Finding panel opens over the site map and site together (FINDING_HOST). */}
        <div id={FINDING_HOST} className="relative flex min-h-0 min-w-0 flex-1 gap-3.5">
          {panels.siteMap.collapsed ? (
            <CollapsedPanel panel="siteMap" side="left" label={l.siteMap} />
          ) : (
            <SiteMap run={run} width={panelSize(panels.siteMap, 'siteMap')} />
          )}
          <ResizeHandle panel="siteMap" side="left" label={l.resizeSiteMap} />
          <AuditSiteView run={run} />
        </div>
        <ResizeHandle panel="chat" side="right" label={l.resizeChat} />
        {panels.chat.collapsed ? (
          <CollapsedPanel panel="chat" side="right" label={l.chat} />
        ) : (
          <ChatPanel run={run} className="flex-none" width={panelSize(panels.chat, 'chat')} />
        )}
      </div>
      <ResizeHandle panel="tray" side="bottom" label={l.resizeTray} />
      {panels.tray.collapsed ? (
        <CollapsedPanel panel="tray" side="bottom" label={l.tray} />
      ) : (
        <FindingsTray run={run} height={panels.tray.size ?? undefined} />
      )}
    </div>
  );
}

/** "Take the wheel?" over the site, when you click it (or press back) while Fitts drives. */
function WheelAsk({ onTake, onCancel }: { onTake: () => void; onCancel: () => void }) {
  return (
    <div
      role="alertdialog"
      aria-labelledby="wheel-ask"
      className="absolute top-3 left-1/2 z-30 flex w-[min(440px,90%)] -translate-x-1/2 flex-col gap-2 rounded-card border-[1.5px] border-ink bg-card p-3.5 shadow-hero"
    >
      <span id="wheel-ask" className="text-[14px] font-semibold">
        {copy.site.wheelAsk}
      </span>
      <span className="text-[13px] text-ink-2">{copy.site.wheelAskBody}</span>
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={onCancel}>
          {copy.site.wheelNotNow}
        </Button>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the answer is what's asked */}
        <Button size="sm" variant="primary" autoFocus onClick={onTake}>
          {copy.site.wheelTake}
        </Button>
      </div>
    </div>
  );
}

function AuditSiteView({ run }: { run: RunState }) {
  const [wheelAsk, setWheelAsk] = useState<(() => void) | null>(null);
  const highlightsOn = useUi((s) => s.highlightsOn);
  const beforeAfter = useUi((s) => s.beforeAfter);
  const pointing = useUi((s) => s.pointing);
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
      (TEST_BUILD && attentionRef ? ROUTE_FOR_REF[attentionRef] : undefined) ??
      testingRoute;
    if (target) useSite.getState().navigate(run.projectId, target);
  }, [driving, live, rewindFinding?.route, attentionRef, testingRoute, run.projectId]);

  const problems = rewindFinding
    ? run.overlays.problems.filter((p) => p.ref === rewindFinding.elementRef)
    : run.overlays.problems;
  // Before/After: the run's branch, with every verified fix, served beside the live site.
  const branch = auditOnly ? undefined : fixedBranch(run);
  const showAfter = beforeAfter && branch !== undefined;
  const afterId = useSiteVersion(
    run.projectId,
    run.runId,
    'after',
    showAfter && branch ? { kind: 'branch', branch } : null,
  );
  const showOverlays = highlightsOn && !driving && !showAfter;

  const ui = useUi.getState();
  return (
    <SiteView
      key={showAfter ? afterId : run.projectId}
      projectId={run.projectId}
      siteId={showAfter ? afterId : undefined}
      onNeedsWheel={driving ? undefined : (then) => setWheelAsk(() => then)}
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
                variant={highlightsOn && problems.length > 0 ? 'dark' : 'secondary'}
                aria-pressed={highlightsOn}
                // Outlines only exist once Fitts has found something on this page.
                disabled={problems.length === 0}
                title={problems.length === 0 ? copy.site.highlightsNone : undefined}
                className="font-semibold"
                onClick={() => ui.set({ highlightsOn: !highlightsOn })}
              >
                {copy.site.highlights}
              </Button>
              {branch !== undefined && (
                <SegmentedControl
                  label={copy.site.beforeAfter}
                  selected={showAfter ? 'after' : 'before'}
                  onSelect={(id) => ui.set({ beforeAfter: id === 'after' })}
                  segments={[
                    { id: 'before', label: copy.site.before },
                    { id: 'after', label: copy.site.after },
                  ]}
                />
              )}
            </>
          )}
          <Button size="sm" aria-pressed={pointing} onClick={() => ui.set({ pointing: !pointing })}>
            {pointing ? copy.site.pointing : copy.site.point}
          </Button>
        </>
      }
      overlay={(surface) =>
        wheelAsk ? (
          <WheelAsk
            onTake={() => {
              const then = wheelAsk;
              setWheelAsk(null);
              getEngine().takeWheel(run.projectId);
              // Do what you tried to do, once the wheel is yours.
              setTimeout(then, 150);
            }}
            onCancel={() => setWheelAsk(null)}
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
      footer={
        <div className="flex flex-none justify-between gap-3 border-t border-ink px-3.5 py-2 font-mono text-[12px] text-muted">
          <span>{format(copy.site.step, { step: run.step, total: run.stepEstimate })}</span>
          <span>{format(copy.site.elapsed, { time: formatClock(run.elapsedMs) })}</span>
        </div>
      }
    />
  );
}

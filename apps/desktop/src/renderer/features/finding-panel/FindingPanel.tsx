import type { Finding, RunState } from '@fitts/schema';
import { X } from 'lucide-react';
import { useRef, useState } from 'react';
import { BeforeAfterSlider } from '../../components/BeforeAfterSlider';
import { Button } from '../../components/Button';
import { Chip, SeverityBadge } from '../../components/Chip';
import { IconButton } from '../../components/IconButton';
import { ProgressBar } from '../../components/StatusChips';
import { Tabs } from '../../components/Tabs';
import { useOverlay } from '../../components/overlay/useOverlay';
import { copy } from '../../copy';
import { format } from '../../lib/format';
import { LIVE_FINDINGS } from '../../mock/fixtures/demo-chat';
import { renderSite, ROUTE_FOR_REF } from '../../mock/sites';
import { getEngine } from '../../state/engine';
import { useToasts } from '../../state/toasts';
import { useUi } from '../../state/ui';
import { MESSAGE_BOX_ID } from '../site-view/SiteView';

/** Width of the panel over the site view; the site shifts left by the same amount (§6.5). */
export const FINDING_PANEL_INSET = 'max(calc(56% + 12px), 452px)';

/** The check a verified fix passed, shown in the mint footer. */
function checkFor(f: Finding): string {
  const checks = copy.finding.checks;
  if (f.lens === 'usability' && f.heuristic && f.heuristic in checks) {
    return checks[f.heuristic as keyof typeof checks];
  }
  if (f.lens in checks) return checks[f.lens as keyof typeof checks];
  return checks.other;
}

/**
 * The Finding panel (SPEC §6.5): opens over the site view, never over the chat. It is a
 * non-modal dialog: Esc closes it and focus returns, but Tab can leave for the chat.
 */
export function FindingPanel({ run }: { run: RunState }) {
  const findingId = useUi((s) => s.openFindingId);
  const finding = run.findings.find((f) => f.id === findingId);
  if (!finding) return null;
  return <Panel key={finding.id} run={run} finding={finding} />;
}

function Panel({ run, finding }: { run: RunState; finding: Finding }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState('live');
  const close = () => useUi.getState().set({ openFindingId: null });
  useOverlay({ open: true, onClose: close, containerRef: ref, trapFocus: false });
  const titleId = `finding-title-${finding.id}`;
  // Show the page where the finding's element lives (e.g. step 2 for the NEXT button).
  const previewRoute = (finding.elementRef && ROUTE_FOR_REF[finding.elementRef]) || finding.route;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="absolute top-16 right-3 bottom-3 z-30 flex w-[56%] min-w-[440px] animate-panel-in flex-col overflow-hidden rounded-sheet border-[1.5px] border-ink bg-card shadow-hero motion-reduce:animate-none"
    >
      <div className="flex flex-none items-start gap-2.5 border-b border-ink px-4 pt-3.5 pb-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            <SeverityBadge severity={finding.severity} form="detail" />
            {finding.heuristic ? (
              <Chip className="px-[9px] py-[3px]">
                {finding.heuristic} {copy.heuristics[finding.heuristic]}
              </Chip>
            ) : (
              <Chip className="px-[9px] py-[3px]">{copy.audit.lens[finding.lens]}</Chip>
            )}
            <Chip tone="mint" className="px-[9px] py-[3px]">
              {format(copy.finding.agree, {
                n: finding.agreement.agreeing,
                total: finding.agreement.total,
              })}
            </Chip>
          </div>
          <h2 id={titleId} className="font-display text-[21px] font-bold">
            {finding.title}
          </h2>
        </div>
        <IconButton
          aria-label={copy.overlay.close}
          onClick={close}
          icon={<X size={15} strokeWidth={2.5} aria-hidden="true" />}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        <p className="text-[14px] leading-normal">
          <strong>{copy.finding.findingPrefix}</strong> {finding.finding}
        </p>
        <p className="text-[14px] leading-normal">
          <strong>{copy.finding.fixPrefix}</strong> {finding.fix}
        </p>
        <Tabs
          label={copy.finding.tabs}
          selected={tab}
          onSelect={setTab}
          items={[
            {
              id: 'live',
              label: copy.finding.livePreview,
              content: (
                <BeforeAfterSlider
                  className="h-[200px]"
                  before={<MiniSite run={run} route={previewRoute} variant="now" />}
                  after={<MiniSite run={run} route={previewRoute} variant="fixed" />}
                />
              ),
            },
            {
              id: 'mockup',
              label: copy.finding.mockup,
              content: (
                <div className="flex h-[200px] flex-col items-center justify-center gap-2 rounded-control border border-dashed border-ink-faint bg-lilac-tint p-4 text-center">
                  <span className="rounded-tag border border-ink bg-card px-2 py-0.5 text-[12px] font-bold">
                    {copy.finding.mockupLabel}
                  </span>
                  <span className="max-w-[320px] text-[13px] text-lilac-ink">
                    {copy.finding.mockupHint}
                  </span>
                </div>
              ),
            },
            {
              id: 'evidence',
              label: copy.finding.evidence,
              content: <Reviewers run={run} finding={finding} />,
            },
          ]}
        />
        <ul className="flex list-disc flex-col gap-[3px] pl-[18px] text-[13px] text-ink-2">
          {finding.evidence.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {finding.diff && (
          <figure className="flex flex-col gap-1 rounded-control bg-ink px-3 py-2.5 text-paper">
            <figcaption className="font-mono text-[11px] text-code-caption">
              <span className="sr-only">{copy.finding.diffLabel}: </span>
              {finding.diff.files.join(' · ')}
            </figcaption>
            <pre className="font-mono text-[12px] leading-normal whitespace-pre-wrap">
              {finding.diff.lines.map((line, i) => (
                <span
                  key={i}
                  className={line.kind === 'add' ? 'block text-diff-add' : 'block text-diff-del'}
                >
                  {line.kind === 'add' ? '+ ' : '- '}
                  {line.text}
                </span>
              ))}
            </pre>
          </figure>
        )}
      </div>

      <Footer run={run} finding={finding} />
    </div>
  );
}

/** The site at half size, so a whole page fits in a preview pane. */
function MiniSite({
  run,
  route,
  variant,
}: {
  run: RunState;
  route: string;
  variant: 'now' | 'fixed';
}) {
  return (
    <div className="pointer-events-none h-full overflow-hidden" inert>
      <div className="h-[200%] w-[200%] origin-top-left scale-50">
        {renderSite(run.projectId, { route, navigate: () => undefined, variant })}
      </div>
    </div>
  );
}

function Reviewers({ run, finding }: { run: RunState; finding: Finding }) {
  const missing = finding.agreement.total - finding.agreement.agreeing;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold">{copy.finding.reviewers}</span>
      <ul className="flex flex-col gap-1 text-[13px]">
        {finding.agreement.who.map((who) => (
          <li key={who}>
            <span aria-hidden="true" className="font-extrabold text-mint-ink">
              ✓
            </span>{' '}
            {who} {copy.finding.flagged}
          </li>
        ))}
        {missing > 0 && (
          <li className="text-muted">
            <span aria-hidden="true">○</span> {missing} {copy.finding.notFlagged}
          </li>
        )}
      </ul>
      <button
        type="button"
        onClick={() => getEngine().rewindTo(run.projectId, finding.stepIndex)}
        className="self-start text-[13px] font-semibold text-cobalt-ink underline hover:text-cobalt-deep"
      >
        {copy.finding.replay}
      </button>
    </div>
  );
}

/** Footer by state (SPEC §6.5): ask actions, fixing, fixed, and the after-states. */
function Footer({ run, finding }: { run: RunState; finding: Finding }) {
  const engine = getEngine();
  const toast = useToasts((s) => s.show);
  const change = run.changes.find((c) => c.findingIds.includes(finding.id));
  const bar = 'flex flex-none flex-wrap items-center gap-2 border-t border-ink px-4 py-3';

  if (finding.status === 'fixing') {
    return (
      <div className={`${bar} flex-col items-stretch bg-cobalt-tint`}>
        <span className="font-bold text-cobalt-deep">{copy.finding.fixing}</span>
        <ProgressBar label={copy.finding.fixingProgress} tone="cobalt" />
      </div>
    );
  }
  if ((finding.status === 'pr-opened' || finding.status === 'verified') && change) {
    return (
      <div className={`${bar} bg-mint-tint`}>
        <span className="flex-[1_1_180px] font-bold text-mint-ink">
          {format(copy.finding.fixed, { check: checkFor(finding) })}
        </span>
        {change.prNumber && (
          <Button
            size="md"
            onClick={() => toast(format(copy.items.prToast, { n: change.prNumber ?? 0 }))}
          >
            {format(copy.items.viewPr, { n: change.prNumber })}
          </Button>
        )}
        <Button size="md" onClick={() => engine.undoChange(run.projectId, change.id)}>
          {copy.items.undo}
        </Button>
      </div>
    );
  }
  if (finding.status === 'rolled-back' && change) {
    return (
      <div className={`${bar} bg-danger-tint`}>
        <span className="flex-[1_1_180px] font-bold text-danger-ink">
          {format(copy.finding.rolledBack, { reason: change.reason ?? '' })}
        </span>
        <Button
          size="md"
          variant="sun"
          onClick={() => engine.retryChange(run.projectId, change.id)}
        >
          {copy.finding.tryAgain}
        </Button>
      </div>
    );
  }
  if (finding.status === 'undone' && change) {
    return (
      <div className={`${bar} bg-neutral-tint`}>
        <span className="flex-[1_1_180px] font-bold text-neutral-ink">
          {change.merged
            ? format(copy.items.reverted, { n: (change.prNumber ?? 0) + 9 })
            : format(copy.finding.undone, { n: change.prNumber ?? 0 })}
        </span>
        <Button size="md" onClick={() => engine.retryChange(run.projectId, change.id)}>
          {copy.finding.redo}
        </Button>
      </div>
    );
  }
  if (finding.status === 'dismissed') {
    return (
      <div className={`${bar} bg-neutral-tint`}>
        <span className="font-semibold text-neutral-ink">{copy.finding.dismissed}</span>
      </div>
    );
  }
  return (
    <div className={bar}>
      <Button
        variant="primary"
        size="md"
        className="min-h-[46px] flex-[2_1_140px]"
        onClick={() => engine.approveFixes(run.projectId, [finding.id])}
      >
        {copy.finding.fixIt}
      </Button>
      <Button
        size="md"
        className="min-h-[46px] flex-[1_1_110px]"
        onClick={() => {
          useUi.getState().set({
            draft:
              finding.id === LIVE_FINDINGS.names.id
                ? copy.finding.changePrefill
                : copy.finding.changePrefillGeneric,
          });
          document.getElementById(MESSAGE_BOX_ID)?.focus();
        }}
      >
        {copy.finding.changeFix}
      </Button>
      <Button
        size="md"
        className="min-h-[46px] flex-[1_1_110px]"
        onClick={() => {
          engine.dismissFinding(run.projectId, finding.id);
          useUi.getState().set({ openFindingId: null });
        }}
      >
        {copy.finding.notProblem}
      </Button>
    </div>
  );
}

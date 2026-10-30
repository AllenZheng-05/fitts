import type { Finding, RunState } from '@fitts/schema';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
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
import { DEV } from '../../dev';
import { LIVE_FINDINGS } from '../../mock/fixtures/demo-chat';
import { renderSite, ROUTE_FOR_REF } from '../../mock/sites';
import { getEngine } from '../../state/engine';
import { useAuditOnly } from '../../state/projects';
import { useToasts } from '../../state/toasts';
import { useUi } from '../../state/ui';
import { MESSAGE_BOX_ID } from '../site-view/SiteView';
import { decide, pendingBatchFor, type Batch } from './review';

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
  const previewRoute =
    (DEV && finding.elementRef && ROUTE_FOR_REF[finding.elementRef]) || finding.route;
  // Part of a batch Fitts is waiting on: step through it and decide each fix (§6.6).
  const batch = finding.status === 'open' ? pendingBatchFor(run, finding.id) : undefined;

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

      {batch && <ReviewBar batch={batch} finding={finding} />}

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
              content: finding.assets?.shot ? (
                // A real run: the page when Fitts found it, with SAM's outline (§10).
                <div className="relative h-[200px] overflow-hidden rounded-control border border-ink bg-paper">
                  <img
                    src={finding.assets.shot}
                    alt={copy.finding.shotAlt}
                    className="absolute inset-0 size-full object-contain"
                  />
                  {finding.assets.mask && (
                    <img
                      src={finding.assets.mask}
                      alt=""
                      className="pointer-events-none absolute inset-0 size-full object-contain"
                    />
                  )}
                </div>
              ) : DEV ? (
                // Phase 1's mock comparison (dev and e2e builds).
                <BeforeAfterSlider
                  className="h-[200px]"
                  before={<MiniSite run={run} route={previewRoute} variant="now" />}
                  after={<MiniSite run={run} route={previewRoute} variant="fixed" />}
                />
              ) : (
                // The step shot from when Fitts found it.
                <div className="relative h-[200px] overflow-hidden rounded-control border border-ink bg-paper">
                  <img
                    src={`fitts-asset://${run.projectId}/${run.runId}/shots/${Math.max(1, finding.stepIndex)}.jpg`}
                    alt={copy.finding.shotAlt}
                    className="absolute inset-0 size-full object-contain"
                  />
                </div>
              ),
            },
            {
              id: 'mockup',
              label: copy.finding.mockup,
              content: finding.assets?.mockup ? (
                <div className="relative h-[200px] overflow-hidden rounded-control border border-ink bg-paper">
                  <img
                    src={finding.assets.mockup}
                    alt={format(copy.finding.mockupAlt, { title: finding.title })}
                    className="absolute inset-0 size-full object-contain"
                  />
                  <span className="absolute top-2 left-2 rounded-tag border border-ink bg-card px-2 py-0.5 text-[12px] font-bold">
                    {copy.finding.mockupLabel}
                  </span>
                </div>
              ) : (
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

      <Footer run={run} finding={finding} batch={batch} />
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

const NONE: Record<string, 'fix' | 'skip'> = {};

/**
 * "Fix 2 of 3" while reviewing a batch: where you are, how many are left, your call on this
 * one, and arrows to move between the fixes.
 */
function ReviewBar({ batch, finding }: { batch: Batch; finding: Finding }) {
  const decisions = useUi((s) => (s.review?.itemId === batch.id ? s.review.decisions : NONE));
  const ids = batch.findingIds;
  const index = ids.indexOf(finding.id);
  const left = ids.filter((id) => decisions[id] === undefined).length;
  const decision = decisions[finding.id];
  const go = (id: string | undefined) => {
    if (id) useUi.getState().set({ review: { itemId: batch.id, decisions }, openFindingId: id });
  };
  return (
    <div className="flex flex-none items-center gap-2 border-b border-ink bg-cobalt-tint px-4 py-2">
      <span className="text-[13px] font-bold text-cobalt-deep">
        {format(copy.finding.reviewPosition, { i: index + 1, n: ids.length })}
      </span>
      <span className="text-[13px] text-ink-2">
        · {format(copy.finding.reviewLeft, { n: left })}
      </span>
      {decision && (
        <Chip tone={decision === 'fix' ? 'mint' : 'neutral'} className="px-2 py-0.5">
          {decision === 'fix' ? copy.finding.decidedFix : copy.finding.decidedSkip}
        </Chip>
      )}
      <span className="flex-1" />
      <IconButton
        aria-label={copy.finding.previousFix}
        disabled={index <= 0}
        onClick={() => go(ids[index - 1])}
        icon={<ChevronLeft size={15} strokeWidth={2.5} aria-hidden="true" />}
      />
      <IconButton
        aria-label={copy.finding.nextFix}
        disabled={index >= ids.length - 1}
        onClick={() => go(ids[index + 1])}
        icon={<ChevronRight size={15} strokeWidth={2.5} aria-hidden="true" />}
      />
    </div>
  );
}

/** Footer by state (SPEC §6.5): ask actions, fixing, fixed, and the after-states. */
function Footer({ run, finding, batch }: { run: RunState; finding: Finding; batch?: Batch }) {
  const engine = getEngine();
  const toast = useToasts((s) => s.show);
  const change = run.changes.find((c) => c.findingIds.includes(finding.id));
  const auditOnly = useAuditOnly(run.projectId);
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
      <div className={`${bar} bg-sun-tint`}>
        <span className="flex-[1_1_180px] font-bold text-sun-ink">
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
  if (auditOnly) {
    // A live site: Fitts can't change its code, so the fix is something to hand on.
    return (
      <div className={bar}>
        <span className="basis-full text-[13px] text-ink-2">{copy.finding.auditOnly}</span>
        <Button
          variant="primary"
          size="md"
          className="min-h-11 flex-[2_1_100px]"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(
                `${finding.title}
${copy.finding.fixPrefix} ${finding.fix}`,
              )
              .then(() => toast(copy.finding.fixCopied));
          }}
        >
          {copy.finding.copyFix}
        </Button>
        <Button
          size="md"
          className="min-h-11 flex-[1_1_100px]"
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
  return (
    <div className={bar}>
      {batch ? (
        <>
          <Button
            variant="primary"
            size="md"
            className="min-h-11 flex-[2_1_100px]"
            onClick={() => decide(run, batch, finding.id, 'fix')}
          >
            {copy.finding.approveFix}
          </Button>
          <Button
            size="md"
            className="min-h-11 flex-[1_1_70px]"
            onClick={() => decide(run, batch, finding.id, 'skip')}
          >
            {copy.finding.skipFix}
          </Button>
        </>
      ) : (
        <Button
          variant="primary"
          size="md"
          className="min-h-11 flex-[2_1_100px]"
          onClick={() => engine.approveFixes(run.projectId, [finding.id])}
        >
          {copy.finding.fixIt}
        </Button>
      )}
      <Button
        size="md"
        className="min-h-11 flex-[1_1_100px]"
        onClick={() => {
          useUi.getState().set({
            draft:
              DEV && finding.id === LIVE_FINDINGS.names.id
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
        className="min-h-11 flex-[1_1_100px]"
        onClick={() => {
          engine.dismissFinding(run.projectId, finding.id);
          // In a batch review, "not a problem" also counts as skipping its fix.
          if (batch) decide(run, batch, finding.id, 'skip');
          else useUi.getState().set({ openFindingId: null });
        }}
      >
        {copy.finding.notProblem}
      </Button>
    </div>
  );
}

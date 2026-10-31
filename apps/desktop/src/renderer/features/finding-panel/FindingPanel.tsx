import type { Finding, RunState } from '@fitts/schema';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { Chip, SeverityBadge } from '../../components/Chip';
import { IconButton } from '../../components/IconButton';
import { ProgressBar } from '../../components/StatusChips';
import { Tabs } from '../../components/Tabs';
import { useOverlay } from '../../components/overlay/useOverlay';
import { copy } from '../../copy';
import { openPr } from '../../lib/links';
import { format } from '../../lib/format';
import { TEST_BUILD } from '../../dev';
import { LIVE_FINDINGS } from '../../mock/fixtures/demo-chat';
import { getEngine } from '../../state/engine';
import { useAuditOnly } from '../../state/projects';
import { useToasts } from '../../state/toasts';
import { useUi } from '../../state/ui';
import { SegmentedControl } from '../../components/SegmentedControl';
import { useSiteVersion } from '../../state/site-versions';
import { RetryControls } from '../chat/RetryControls';
import { MESSAGE_BOX_ID, SiteView } from '../site-view/SiteView';
import type { Decision } from '../../state/ui';
import { decide, finishReview, pendingBatchFor, type Batch } from './review';
import { Replay } from './Replay';

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
            {finding.agreement.measured && (
              <Chip tone="cobalt" className="px-[9px] py-[3px]">
                {copy.finding.measuredChip}
              </Chip>
            )}
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

      {batch && <ReviewBar run={run} batch={batch} finding={finding} />}

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
              content: <LivePreview run={run} finding={finding} />,
            },
            ...(finding.replay?.length
              ? [
                  {
                    id: 'replay',
                    label: copy.finding.replayTab,
                    content: <Replay run={run} finding={finding} />,
                  },
                ]
              : []),
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

/**
 * The fix, live: what Fitts saw when it found the problem, and once a fix is verified, the
 * fixed version of the site itself, on the finding's page, to use like the real thing.
 */
function LivePreview({ run, finding }: { run: RunState; finding: Finding }) {
  const change = run.changes.find((c) => c.findingIds.includes(finding.id));
  const branch = change?.status === 'verified' ? change.branch : undefined;
  const [view, setView] = useState<'before' | 'after'>(branch ? 'after' : 'before');
  const showAfter = view === 'after' && Boolean(branch);
  const siteId = useSiteVersion(
    run.projectId,
    run.runId,
    `fix-${finding.id}`,
    showAfter && branch ? { kind: 'branch', branch, path: finding.route } : null,
  );
  const shot =
    finding.assets?.shot ??
    `fitts-asset://${run.projectId}/${run.runId}/shots/${Math.max(1, finding.stepIndex)}.jpg`;
  return (
    <div className="flex flex-col gap-2">
      {branch && (
        <SegmentedControl
          label={copy.finding.livePreview}
          selected={view}
          onSelect={(id) => setView(id === 'after' ? 'after' : 'before')}
          segments={[
            { id: 'before', label: copy.finding.previewBefore },
            { id: 'after', label: copy.finding.previewAfter },
          ]}
        />
      )}
      {showAfter ? (
        <SiteView
          key={siteId}
          projectId={run.projectId}
          siteId={siteId}
          interactive
          label={copy.finding.previewAfter}
          className="h-[380px]"
        />
      ) : (
        // The page when Fitts found it, with SAM's outline (§10).
        <div className="relative h-[260px] overflow-hidden rounded-control border border-ink bg-paper">
          <img
            src={shot}
            alt={copy.finding.shotAlt}
            className="absolute inset-0 size-full object-contain"
          />
          {finding.assets?.mask && (
            <img
              src={finding.assets.mask}
              alt=""
              className="pointer-events-none absolute inset-0 size-full object-contain"
            />
          )}
        </div>
      )}
      {!branch && <p className="text-[13px] text-muted">{copy.finding.previewPending}</p>}
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
        {finding.agreement.measured && (
          <li>
            <span aria-hidden="true" className="font-extrabold text-cobalt-ink">
              ✓
            </span>{' '}
            {copy.finding.measuredBy}
          </li>
        )}
        {missing > 0 && (
          <li className="text-muted">
            <span aria-hidden="true">○</span> {missing} {copy.finding.notFlagged}
          </li>
        )}
      </ul>
      <button
        type="button"
        onClick={() => {
          // Fitts takes the site there; the panel steps aside so you can see it.
          getEngine().showFinding(run.projectId, finding.id);
          useUi.getState().set({ openFindingId: null });
        }}
        className="self-start text-[13px] font-semibold text-cobalt-ink underline hover:text-cobalt-deep"
      >
        {copy.finding.replay}
      </button>
    </div>
  );
}

const NONE: Record<string, Decision> = {};

/**
 * "Fix 2 of 3" while reviewing a batch: where you are, how many are left, your call on this
 * one, and arrows to move between the fixes.
 */
function ReviewBar({ run, batch, finding }: { run: RunState; batch: Batch; finding: Finding }) {
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
          {decision === 'fix'
            ? copy.finding.decidedFix
            : decision === 'skip'
              ? copy.finding.decidedSkip
              : copy.finding.decidedDismiss}
        </Chip>
      )}
      <span className="flex-1" />
      {left === 0 && <GoAhead run={run} batch={batch} decisions={decisions} />}
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

/** "Go ahead with 2 fixes": sends every call in the batch at once. */
function GoAhead({
  run,
  batch,
  decisions,
}: {
  run: RunState;
  batch: Batch;
  decisions: Record<string, Decision>;
}) {
  const n = batch.findingIds.filter((id) => decisions[id] === 'fix').length;
  return (
    <Button size="sm" variant="primary" onClick={() => finishReview(run, batch)}>
      {n > 0 ? format(copy.finding.goAhead, { n }) : copy.finding.goAheadNone}
    </Button>
  );
}

/** Footer by state (SPEC §6.5): ask actions, fixing, fixed, and the after-states. */
function Footer({ run, finding, batch }: { run: RunState; finding: Finding; batch?: Batch }) {
  const engine = getEngine();
  const decision = useUi((s) =>
    batch && s.review?.itemId === batch.id ? s.review.decisions[finding.id] : undefined,
  );
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
          <Button size="md" onClick={() => openPr(change)}>
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
        <RetryControls run={run} change={change} size="md" />
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
        <span className="flex-[1_1_180px] font-semibold text-neutral-ink">
          {copy.finding.dismissed}
        </span>
        {/* Changed your mind: it's open again, to fix or review. */}
        <Button size="md" onClick={() => engine.reopenFinding(run.projectId, finding.id)}>
          {copy.finding.reopen}
        </Button>
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
            variant={decision === 'fix' ? 'dark' : 'primary'}
            size="md"
            aria-pressed={decision === 'fix'}
            className="min-h-11 flex-[2_1_100px]"
            onClick={() => decide(batch, finding.id, 'fix')}
          >
            {copy.finding.approveFix}
          </Button>
          <Button
            size="md"
            variant={decision === 'skip' ? 'dark' : 'secondary'}
            aria-pressed={decision === 'skip'}
            className="min-h-11 flex-[1_1_70px]"
            onClick={() => decide(batch, finding.id, 'skip')}
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
              TEST_BUILD && finding.id === LIVE_FINDINGS.names.id
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
        variant={decision === 'dismiss' ? 'dark' : 'secondary'}
        aria-pressed={batch ? decision === 'dismiss' : undefined}
        className="min-h-11 flex-[1_1_100px]"
        onClick={() => {
          // In a batch review it's a call like the others, sent with Go ahead.
          if (batch) decide(batch, finding.id, 'dismiss');
          else {
            engine.dismissFinding(run.projectId, finding.id);
            useUi.getState().set({ openFindingId: null });
          }
        }}
      >
        {copy.finding.notProblem}
      </Button>
    </div>
  );
}

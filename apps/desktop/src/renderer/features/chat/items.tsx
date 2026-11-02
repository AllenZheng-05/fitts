// Chat item types (SPEC §6.6). Every Fitts item is also what Fitts would say out loud.
import {
  EDGE_STATE_ANSWERS,
  type Brief,
  type ChatItem,
  type Finding,
  type Observation,
  type RunState,
} from '@fitts/schema';
import { Eye } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useSettings } from '../../state/settings';
import { showsNote, showsRecord, showsStep, showsTiming } from '../../lib/detail';
import { Button } from '../../components/Button';
import { Chip, SeverityBadge } from '../../components/Chip';
import { RichText } from '../../components/RichText';
import { copy } from '../../copy';
import { openPr } from '../../lib/links';
import { cx } from '../../lib/cx';
import { format, formatUsd } from '../../lib/format';
import { sendFromComposer } from '../../state/actions';
import { getEngine } from '../../state/engine';
import { useSpeech } from '../../state/speech';
import { useUi, type Decision } from '../../state/ui';
import { finishReview, startReview } from '../finding-panel/review';
import { DirectionViewer } from './DirectionViewer';
import { MESSAGE_BOX_ID } from '../site-view/SiteView';

type Item<T extends ChatItem['type']> = Extract<ChatItem, { type: T }>;

const CARD = 'flex flex-col gap-2 rounded-card border border-ink p-[11px]';
const ITEM = 'animate-chat-in motion-reduce:animate-none';

export function ChatItemView({ item, run }: { item: ChatItem; run: RunState }) {
  let body: ReactNode;
  switch (item.type) {
    case 'fitts.message':
      body = (
        <p className="max-w-[92%] text-[14px] leading-[1.45]">
          <RichText text={item.text} />
        </p>
      );
      break;
    case 'user.message':
      return <UserMessage item={item} />;
    case 'fitts.thinking':
      body = (
        <p className="rounded-control bg-lilac-tint px-[11px] py-[9px] text-[13px] leading-[1.4] text-lilac-ink">
          <strong>{copy.chat.thinking}</strong> {item.text}
        </p>
      );
      break;
    case 'steps':
      body = <Steps item={item} run={run} />;
      break;
    case 'finding':
      body = <FindingCard item={item} run={run} />;
      break;
    case 'question':
      body = <Question item={item} run={run} />;
      break;
    case 'approval.batch':
      body = <ApprovalBatch item={item} run={run} />;
      break;
    case 'fix.result':
      body = <FixResult item={item} run={run} />;
      break;
    case 'brief':
      body = <BriefSummary brief={run.brief} />;
      break;
    case 'quick-replies':
      body = <QuickReplies item={item} run={run} />;
      break;
    case 'lookfeel':
      body = (
        <div className={cx(CARD, 'gap-1.5 bg-lilac-tint')}>
          <span className="self-start rounded-pill border border-ink bg-card px-2 py-0.5 text-[12px] font-bold">
            {copy.items.lookfeelTag}
          </span>
          <p className="text-[14px] leading-[1.45]">{item.text}</p>
        </div>
      );
      break;
    case 'directions':
      body = <Directions item={item} run={run} />;
      break;
    case 'review':
      body = <Review item={item} run={run} />;
      break;
    case 'progress':
      body = <Progress item={item} run={run} />;
      break;
    case 'wording':
      body = <Wording item={item} run={run} />;
      break;
    case 'state':
      body = <EdgeStateCard item={item} run={run} />;
      break;
    case 'driving':
      body = <Driving run={run} />;
      break;
    case 'understanding':
      body = <Understanding item={item} run={run} />;
      break;
    case 'finish-proposal':
      body = <FinishProposal item={item} run={run} />;
      break;
  }
  if (body === null) return null;
  return (
    <li className={ITEM}>
      <SpokenMark itemId={item.id}>{body}</SpokenMark>
    </li>
  );
}

/**
 * While Fitts says this item out loud, a cobalt bar runs down its left edge, so you can
 * tell which line the voice belongs to.
 */
function SpokenMark({ itemId, children }: { itemId: string; children: ReactNode }) {
  const speaking = useSpeech((s) => s.itemId === itemId);
  return (
    <div
      data-speaking={speaking || undefined}
      className={cx(
        'relative transition-tint',
        speaking &&
          'before:absolute before:inset-y-0 before:-left-2.5 before:w-[3px] before:rounded-pill before:bg-cobalt',
      )}
    >
      {children}
    </div>
  );
}

function UserMessage({ item }: { item: Item<'user.message'> }) {
  return (
    <li
      className={cx(
        ITEM,
        'flex max-w-[85%] flex-col gap-[5px] self-end rounded-bubble bg-cobalt-tint px-[11px] py-[9px]',
      )}
    >
      <span className="sr-only">{copy.chat.youSaid}:</span>
      {item.spoken && (
        <span className="text-[11px] font-bold text-cobalt-ink">{copy.chat.spoken}</span>
      )}
      {item.pointingAt && (
        <span className="self-start rounded-tag border border-cobalt px-[7px] py-0.5 text-[12px] text-cobalt-deep">
          {format(copy.chat.pointingAt, { label: item.pointingLabel ?? `#${item.pointingAt}` })}
        </span>
      )}
      <span className="text-[14px] leading-[1.45]">{item.text}</span>
    </li>
  );
}

/** One noticed line: the eye, the note, "Finding N" when the review made one, and "Show me". */
function Noticed({ o, run }: { o: Observation; run: RunState }) {
  const n = run.findings.findIndex((f) => f.id === o.findingId);
  return (
    <li className="flex items-start gap-1.5 pl-5 text-[12px] text-ink-2">
      <Eye aria-hidden className="mt-0.5 size-3.5 flex-none text-muted" />
      <span className="min-w-0 flex-1">
        <RichText text={o.text} />
      </span>
      {o.findingId && n >= 0 && (
        <button
          type="button"
          className="flex-none font-sans font-semibold text-cobalt-ink underline hover:text-cobalt-deep"
          onClick={() => useUi.getState().set({ openFindingId: o.findingId ?? null })}
        >
          {format(copy.items.findingLink, { n: n + 1 })}
        </button>
      )}
      {o.ref && !o.findingId && (
        <button
          type="button"
          className="flex-none font-sans font-semibold text-cobalt-ink underline hover:text-cobalt-deep"
          onClick={() => getEngine().answerQuestion(run.projectId, o.id, 'show')}
        >
          {copy.items.showOnSite}
        </button>
      )}
    </li>
  );
}

function Steps({ item, run }: { item: Item<'steps'>; run: RunState }) {
  const [open, setOpen] = useState(false);
  const level = useSettings((s) => s.detail);
  const byId = new Map((run.observations ?? []).map((o) => [o.id, o]));
  const notesOf = (step: Item<'steps'>['steps'][number]) =>
    (step.noticed ?? []).flatMap((id) => {
      const o = byId.get(id);
      return o && showsNote(level, o) ? [o] : [];
    });
  const last = item.steps.findLast((s) => !s.detail) ?? item.steps.at(-1);
  const noticedTotal = item.steps.reduce((n, s) => n + notesOf(s).length, 0);
  const shown = item.steps.filter((s) => showsStep(level, s));
  const recordOf = (step: Item<'steps'>['steps'][number]) =>
    step.step !== undefined ? run.actions?.find((a) => a.step === step.step) : undefined;
  const actionCount = item.steps.filter((s) => !s.detail).length;
  return (
    <div className="flex flex-col gap-2">
      {/* What Fitts just did, always in view; the rest opens below. */}
      {last && !open && (
        <span className="font-mono text-[12px] text-ink-2">
          {format(copy.items.lastStep, { step: last.label })}
          {noticedTotal > 0 && (
            <span className="text-muted">
              {' · '}
              {noticedTotal === 1
                ? copy.items.noticedOne
                : format(copy.items.noticedCount, { n: noticedTotal })}
            </span>
          )}
        </span>
      )}
      {shown.length > 1 && (
        <Button
          variant="ghost-dashed"
          size="inline"
          aria-expanded={open}
          className="self-start"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? copy.items.hideSteps : format(copy.items.showSteps, { n: actionCount })}
        </Button>
      )}
      {open && (
        <ol className="flex flex-col gap-1 rounded-control bg-surface-2 p-2.5 font-mono text-[12px]">
          {shown.map((step, i) => {
            const notes = notesOf(step);
            if (step.detail === 'thinking')
              return (
                <li key={i} className="font-sans text-[12px] text-lilac-ink">
                  {format(copy.items.thinking, { why: step.label })}
                </li>
              );
            if (step.detail === 'pass')
              return (
                <li key={i} className="text-muted">
                  {step.label}
                </li>
              );
            const record = showsRecord(level) ? recordOf(step) : undefined;
            const slowest = record?.requests.slowest;
            const findingNs = (step.findingIds ?? [])
              .map((id) => run.findings.findIndex((f) => f.id === id))
              .filter((n) => n >= 0);
            return (
              <li key={i} className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span>{step.label}</span>
                  <span className="flex items-center gap-2">
                    {showsTiming(level, step) && (
                      <Chip
                        tone={step.slow ? 'sun' : 'neutral'}
                        className="px-1.5 py-0"
                        aria-label={format(copy.items.timingLabel, {
                          s: ((step.ms ?? 0) / 1000).toFixed(1),
                        })}
                        title={step.slow ? copy.items.slowLabel : undefined}
                      >
                        {format(copy.items.timing, { s: ((step.ms ?? 0) / 1000).toFixed(1) })}
                      </Chip>
                    )}
                    {findingNs.map((n) => (
                      <button
                        key={n}
                        type="button"
                        className="font-sans font-semibold text-cobalt-ink underline hover:text-cobalt-deep"
                        onClick={() =>
                          useUi.getState().set({ openFindingId: run.findings[n]?.id ?? null })
                        }
                      >
                        {format(copy.items.findingLink, { n: n + 1 })}
                      </button>
                    ))}
                    {step.costUsd > 0 && (
                      <span className="text-muted">{formatUsd(step.costUsd)}</span>
                    )}
                  </span>
                </span>
                {record && (record.requests.count > 0 || record.console.errors > 0) && (
                  <span className="pl-5 text-muted">
                    {record.requests.count > 0 &&
                      (slowest
                        ? format(copy.items.requests, {
                            n: record.requests.count,
                            method: slowest.method,
                            path: slowest.path,
                            s: (slowest.ms / 1000).toFixed(1),
                          })
                        : format(copy.items.requestsOnly, { n: record.requests.count }))}
                    {record.requests.count > 0 && record.console.errors > 0 && ' · '}
                    {record.console.errors > 0 &&
                      format(copy.items.consoleErrors, { n: record.console.errors })}
                  </span>
                )}
                {notes.length > 0 && (
                  <ul className="flex flex-col gap-0.5">
                    {notes.map((o) => (
                      <Noticed key={o.id} o={o} run={run} />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** Where a finding stands, for its chat card: your call in a review, or what Fitts did. */
function findingState(
  finding: Finding,
  decision: Decision | undefined,
): { label: string; tone: 'mint' | 'cobalt' | 'neutral' | 'sun'; card: string } | null {
  if (finding.status === 'verified' || finding.status === 'pr-opened')
    return { label: copy.items.stateFixed, tone: 'mint', card: 'border-mint bg-mint-tint' };
  if (finding.status === 'fixing')
    return { label: copy.items.stateFixing, tone: 'cobalt', card: 'border-cobalt bg-cobalt-tint' };
  if (finding.status === 'rolled-back')
    return { label: copy.items.stateRolledBack, tone: 'sun', card: 'border-sun bg-sun-tint' };
  if (finding.status === 'dismissed')
    return { label: copy.items.stateDismissed, tone: 'neutral', card: 'bg-neutral-tint' };
  if (finding.status === 'undone')
    return { label: copy.items.stateUndone, tone: 'neutral', card: 'bg-neutral-tint' };
  if (decision === 'fix')
    return { label: copy.items.stateApproved, tone: 'mint', card: 'border-mint bg-mint-tint' };
  if (decision === 'skip')
    return { label: copy.items.stateSkipped, tone: 'neutral', card: 'bg-neutral-tint' };
  if (decision === 'dismiss')
    return { label: copy.items.stateDismissed, tone: 'neutral', card: 'bg-neutral-tint' };
  return null;
}

function FindingCard({ item, run }: { item: Item<'finding'>; run: RunState }) {
  const finding = run.findings.find((f) => f.id === item.findingId);
  const decision = useUi((s) => (finding ? s.review?.decisions[finding.id] : undefined));
  if (!finding) return null;
  const state = findingState(finding, decision);
  const meta = [
    finding.heuristic,
    format(copy.items.agree, { n: finding.agreement.agreeing, total: finding.agreement.total }),
    finding.agreement.measured && copy.items.measured,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className={cx(CARD, 'gap-[5px]', state?.card)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <SeverityBadge severity={finding.severity} />
        <span className="text-[12px] font-semibold text-muted">{meta}</span>
        {state && (
          <Chip tone={state.tone} className="ml-auto px-2 py-0.5">
            {state.label}
          </Chip>
        )}
      </div>
      <span className="text-[14px] font-semibold">{finding.title}</span>
      <button
        type="button"
        onClick={() => useUi.getState().set({ openFindingId: finding.id })}
        className="self-start text-[13px] font-semibold text-cobalt-ink underline hover:text-cobalt-deep"
      >
        {copy.items.seeEvidence}
      </button>
    </div>
  );
}

function Question({ item, run }: { item: Item<'question'>; run: RunState }) {
  return (
    <div className={cx(CARD, 'bg-sun-tint')}>
      <span className="text-[12px] font-bold text-sun-ink">
        {item.blocking ? copy.items.blocking : copy.fitts.nonBlockingLabel}
      </span>
      <span className="text-[14px] font-semibold">{item.text}</span>
      {item.answer !== undefined ? (
        <span className="text-[13px] text-sun-ink">
          {format(copy.items.answered, { answer: item.answer })}
        </span>
      ) : (
        <div className="flex flex-wrap gap-2">
          {item.options.map((option, i) => (
            <Button
              key={option}
              size="sm"
              variant={i === 0 ? 'dark' : 'secondary'}
              className="px-3.5 text-[14px]"
              onClick={() => getEngine().answerQuestion(run.projectId, item.id, option)}
            >
              {option}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function ApprovalBatch({ item, run }: { item: Item<'approval.batch'>; run: RunState }) {
  const n = item.findingIds.length;
  const serious = run.findings
    .filter((f) => item.findingIds.includes(f.id) && f.severity >= 3)
    .map((f) => f.id);
  const engine = getEngine();
  // Calls made so far in "Review each", if you started it.
  const decided = useUi((s) =>
    s.review?.itemId === item.id ? Object.keys(s.review.decisions).length : 0,
  );
  const approving = useUi((s) =>
    s.review?.itemId === item.id
      ? Object.values(s.review.decisions).filter((d) => d === 'fix').length
      : 0,
  );
  return (
    <div className={CARD}>
      <span className="font-display text-[16px] font-bold">
        {format(copy.items.approvalTitle, { n })}
      </span>
      <p className="text-[14px] leading-normal">
        {serious.length === n
          ? format(copy.items.approvalBodyAllSerious, { n })
          : format(copy.items.approvalBody, { serious: serious.length, small: n - serious.length })}
      </p>
      {item.answer !== undefined ? (
        <span className="text-[13px] font-semibold text-mint-ink">
          {format(copy.items.approved, {
            n: item.answer.split(',').filter(Boolean).length,
            total: n,
          })}
        </span>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => engine.approveFixes(run.projectId, item.findingIds)}
          >
            {format(copy.items.fixAll, { n })}
          </Button>
          {serious.length > 0 && serious.length < n && (
            <Button size="sm" onClick={() => engine.approveFixes(run.projectId, serious)}>
              {format(copy.items.onlySerious, { n: serious.length })}
            </Button>
          )}
          <Button size="sm" onClick={() => startReview(item)}>
            {decided > 0
              ? format(copy.items.continueReview, { n: decided, total: n })
              : copy.items.reviewEach}
          </Button>
          {/* Every fix has a call: send them (until then, each can still change). */}
          {decided === n && (
            <Button variant="dark" size="sm" onClick={() => finishReview(run, item)}>
              {approving > 0
                ? format(copy.finding.goAhead, { n: approving })
                : copy.finding.goAheadNone}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function FixResult({ item, run }: { item: Item<'fix.result'>; run: RunState }) {
  const change = run.changes.find((c) => c.id === item.changeId);
  if (!change) return null;
  const undone = change.status === 'undone';
  return (
    <div
      className={cx(
        'flex flex-wrap items-center gap-2 rounded-control px-3 py-2',
        undone ? 'bg-neutral-tint' : 'bg-mint-tint',
      )}
    >
      <span
        className={cx(
          'flex-[1_1_160px] text-[13px] font-bold',
          undone ? 'text-neutral-ink' : 'text-mint-ink',
        )}
      >
        {undone
          ? change.revertPrNumber !== undefined
            ? // Undone after the run's PR was merged: a revert PR (§9.4).
              format(copy.items.reverted, { n: change.revertPrNumber })
            : copy.items.undone
          : format(copy.items.fixed, { title: change.title })}
      </span>
      {!undone && change.prNumber && (
        <Button size="inline" onClick={() => openPr(change)}>
          {format(copy.items.viewPr, { n: change.prNumber })}
        </Button>
      )}
      {!undone && (
        <Button size="inline" onClick={() => getEngine().undoChange(run.projectId, change.id)}>
          {copy.items.undo}
        </Button>
      )}
    </div>
  );
}

const BRIEF_ROWS = ['for', 'who', 'pain', 'feel'] as const;

/** "What I know so far" (SPEC §6.3): updates as answers arrive. */
export function BriefCard({ brief }: { brief: Brief }) {
  return (
    <li className={ITEM}>
      <BriefSummary brief={brief} />
    </li>
  );
}

function BriefSummary({ brief }: { brief: Brief }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-card border border-ink bg-sun-tint p-3.5">
      <span className="font-display text-[15px] font-bold">{copy.brief.cardTitle}</span>
      {/* The real interview keeps the brief as one paragraph; the rows are for a brief without. */}
      {brief.summary ? (
        <p className="text-[14px] leading-normal">{brief.summary}</p>
      ) : (
        <dl className="grid grid-cols-[70px_1fr] gap-x-2.5 gap-y-1 text-[14px]">
          {/* The look shows once the user has asked for one: most runs keep theirs. */}
          {[
            ...BRIEF_ROWS,
            ...(['look', 'keep', 'inspiration'] as const).filter((k) => brief[k]),
          ].map((key) => (
            <div key={key} className="contents">
              <dt className="text-muted">{copy.brief.labels[key]}</dt>
              <dd className={brief[key] ? undefined : 'text-muted'}>
                {brief[key] ?? copy.brief.waiting}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function QuickReplies({ item, run }: { item: Item<'quick-replies'>; run: RunState }) {
  if (item.used) return null;
  return (
    <div role="group" aria-label={copy.chat.quickReplies} className="flex flex-wrap gap-2">
      {item.options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => sendFromComposer(run.projectId, option)}
          className="min-h-10 rounded-pill border border-ink bg-card px-3.5 text-[14px] font-semibold transition-tint hover:bg-paper"
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/**
 * The redesign's final review (SPEC-phase3 §2.4): every page before and after, then the
 * owner's call. In the Ask modes the PR waits for it; in Autonomous it's open, and can be sent
 * back.
 */
function Review({ item, run }: { item: Item<'review'>; run: RunState }) {
  const r = copy.items.review;
  const change = run.changes.find((c) => c.id === item.changeId);
  const answer = (a: string) => getEngine().answerQuestion(run.projectId, item.id, a);
  const answered =
    item.answer === 'ok' || item.answer === 'restart' || item.answer === 'back'
      ? r.answered[item.answer]
      : undefined;
  return (
    <div className={cx(CARD, 'gap-2.5')}>
      <span className="text-[14px] font-bold">{r.title}</span>
      {change?.pages && change.pages.length > 0 && (
        <ul className="flex flex-col gap-2">
          {change.pages.slice(0, 4).map((p) => (
            <li key={p.route} className="flex flex-col gap-1">
              <span className="font-mono text-[12px] text-muted">{p.route}</span>
              <span className="grid grid-cols-2 gap-1.5">
                {p.before ? (
                  <img
                    src={p.before}
                    alt={format(r.pageAlt, { route: p.route, when: r.before })}
                    className="aspect-[8/5] w-full rounded-tag border border-ink object-cover object-top"
                  />
                ) : (
                  <span />
                )}
                <img
                  src={p.after}
                  alt={format(r.pageAlt, { route: p.route, when: r.after })}
                  className="aspect-[8/5] w-full rounded-tag border border-ink object-cover object-top"
                />
              </span>
            </li>
          ))}
        </ul>
      )}
      {answered ? (
        <Chip className="self-start">{answered}</Chip>
      ) : item.autonomous ? (
        <>
          <p className="text-[13px] text-ink-2">{r.autonomousHint}</p>
          <Button size="md" className="self-start" onClick={() => answer('back')}>
            {r.back}
          </Button>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="md" onClick={() => answer('ok')}>
              {r.ok}
            </Button>
            <Button size="md" onClick={() => answer('restart')}>
              {r.restart}
            </Button>
          </div>
          <p className="text-[13px] text-ink-2">{r.hint}</p>
        </>
      )}
    </div>
  );
}

function Directions({ item, run }: { item: Item<'directions'>; run: RunState }) {
  // A click opens the direction large; you choose it from there.
  const [viewing, setViewing] = useState<number | null>(null);
  const latest = [...run.chat].reverse().find((c) => c.type === 'directions')?.id === item.id;
  return (
    <div className="flex flex-col gap-1.5">
      {(item.round ?? 1) > 1 && (
        <p className="text-[13px] text-ink-2">
          <strong>{format(copy.directions.round, { n: item.round ?? 1 })}</strong>
          {item.changed ? ` · ${item.changed}` : ''}
        </p>
      )}
      <DirectionOptions item={item} run={run} viewing={viewing} setViewing={setViewing} />
      {/* Not one of them: say what's off, and Fitts makes a new round (§2.3). */}
      {latest && !item.selectedId && run.phase !== 'done' && (
        <button
          type="button"
          onClick={() => {
            useUi.getState().set({ draft: copy.directions.noneOfTheseDraft });
            document.getElementById(MESSAGE_BOX_ID)?.focus();
          }}
          className="self-start text-[13px] font-semibold text-cobalt-ink underline hover:text-cobalt-deep"
        >
          {copy.directions.noneOfThese}
        </button>
      )}
    </div>
  );
}

function DirectionOptions({
  item,
  run,
  viewing,
  setViewing,
}: {
  item: Item<'directions'>;
  run: RunState;
  viewing: number | null;
  setViewing: (i: number | null) => void;
}) {
  return (
    <div role="group" aria-label={copy.items.directionsLabel} className="flex gap-2">
      <DirectionViewer
        item={item}
        run={run}
        index={viewing}
        onIndex={setViewing}
        onClose={() => setViewing(null)}
      />
      {item.options.map((option, i) => {
        const selected = option.id === item.selectedId;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            aria-haspopup="dialog"
            onClick={() => setViewing(i)}
            className={cx(
              'flex min-w-0 flex-1 flex-col gap-1.5 rounded-control bg-card p-[9px] text-left transition-tint hover:bg-paper',
              selected ? 'border-2 border-cobalt p-2' : 'border border-ink',
            )}
          >
            {option.board && !option.mockup && (
              <span className="self-start rounded-tag border border-ink bg-paper px-1.5 py-0.5 text-[11px] font-bold">
                {copy.directions.boardChip}
              </span>
            )}
            {option.mockup && (
              <span className="relative">
                <img
                  src={option.mockup}
                  alt={format(copy.items.directionMockupAlt, { name: option.name })}
                  className="aspect-[8/5] w-full rounded-tag border border-ink object-cover"
                />
                <span className="absolute bottom-1 left-1 rounded-tag border border-ink bg-card px-1 py-px text-[9px] leading-none font-bold whitespace-nowrap">
                  {copy.finding.mockupLabel}
                </span>
              </span>
            )}
            <span aria-hidden="true" className="flex gap-[3px]">
              {option.swatches.slice(0, 2).map((color) => (
                <span key={color} className="size-4 rounded-tag" style={{ background: color }} />
              ))}
            </span>
            <span className="text-[12px] font-bold">{option.name}</span>
          </button>
        );
      })}
    </div>
  );
}

const PROGRESS_MARK = {
  done: { mark: '✓', className: 'text-mint-ink', sr: copy.items.progressDone },
  doing: { mark: '◐', className: 'text-cobalt-ink', sr: copy.items.progressDoing },
  todo: { mark: '○', className: 'text-muted', sr: copy.items.progressTodo },
} as const;

function Progress({ item, run }: { item: Item<'progress'>; run: RunState }) {
  const redesign = run.changes.find((c) => c.kind === 'redesign');
  const isRedesign = item.title === 'Applying the look';
  return (
    <div className={CARD}>
      <span className="text-[14px] font-bold">{item.title}</span>
      <ul className="flex flex-col gap-[5px] text-[13px]">
        {item.items.map((row, i) => {
          const mark = PROGRESS_MARK[row.state];
          return (
            <li key={i} className={row.state === 'todo' ? 'text-muted' : undefined}>
              <span aria-hidden="true" className={cx('font-extrabold', mark.className)}>
                {mark.mark}
              </span>{' '}
              {row.text}
              <span className="sr-only"> ({mark.sr})</span>
            </li>
          );
        })}
      </ul>
      {isRedesign &&
        (redesign?.status === 'undone' ? (
          <span className="text-[13px] font-semibold text-neutral-ink">
            {copy.items.redesignUndone}
          </span>
        ) : (
          <div className="flex gap-2">
            <Button
              size="sm"
              className="font-bold"
              disabled={!redesign}
              onClick={() => redesign && getEngine().undoChange(run.projectId, redesign.id)}
            >
              {copy.items.undoRedesign}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                useUi.getState().set({ draft: copy.items.adjustPrefill });
                document.getElementById(MESSAGE_BOX_ID)?.focus();
              }}
            >
              {copy.items.adjust}
            </Button>
          </div>
        ))}
    </div>
  );
}

function Wording({ item, run }: { item: Item<'wording'>; run: RunState }) {
  return (
    <div className={cx(CARD, 'gap-1.5 bg-sun-tint')}>
      <span className="text-[12px] font-bold text-sun-ink">{copy.items.wordingTag}</span>
      <span className={cx('text-[14px]', item.decision === 'undo' && 'line-through')}>
        "{item.from}" → "{item.to}"
      </span>
      {item.decision ? (
        <span className="text-[13px] font-semibold text-sun-ink">
          {item.decision === 'keep' ? copy.items.kept : copy.items.wordingUndone}
        </span>
      ) : (
        <div className="flex gap-2">
          <Button
            size="inline"
            onClick={() => getEngine().decideWording(run.projectId, item.id, 'keep')}
          >
            {copy.items.keep}
          </Button>
          <Button
            size="inline"
            onClick={() => getEngine().decideWording(run.projectId, item.id, 'undo')}
          >
            {copy.items.undoThis}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * "Here's what I understand" (SPEC-phase4 §3.3): the App Model's summary, counts, the journeys
 * in priority order (each with a checkbox, on except priority 3), gated pages and notes.
 * "Looks right" answers with the unchecked journeys; "Change something" prefills the box.
 */
function Understanding({ item, run }: { item: Item<'understanding'>; run: RunState }) {
  const u = copy.items.understanding;
  const model = run.appModel;
  const [off, setOff] = useState<Set<string>>(
    () =>
      new Set(
        model?.journeys.filter((j) => j.priority === 3 || j.enabled === false).map((j) => j.id),
      ),
  );
  if (!model) return null;
  const journeys = [...model.journeys].sort((a, b) => a.priority - b.priority);
  const features = model.pages.reduce((n, p) => n + p.features.length, 0);
  const gated = model.pages.filter((p) => p.gate);
  const answered = item.answer !== undefined;
  const skipped = item.answer?.startsWith('looks-right:')
    ? item.answer.slice('looks-right:'.length).split(',').filter(Boolean).length
    : 0;
  const toggle = (id: string) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div className={cx(CARD, 'gap-2.5 bg-lilac-tint')}>
      <span className="font-display text-[16px] font-bold">{u.title}</span>
      <p className="text-[14px] leading-normal">{model.summary}</p>
      <span className="text-[12px] font-semibold text-muted">
        {format(u.counts, { pages: model.pages.length, features, journeys: model.journeys.length })}
        {!model.modeled && <span className="block font-normal">{u.fromCode}</span>}
      </span>
      {journeys.length > 0 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-[12px] font-bold">{u.journeys}</legend>
          {journeys.map((j) => {
            const on = !off.has(j.id);
            return (
              <label key={j.id} className="flex items-start gap-2 text-[13px]">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-cobalt"
                  checked={on}
                  disabled={answered}
                  onChange={() => toggle(j.id)}
                  aria-label={format(u.journeyToggle, { name: j.name })}
                />
                <span className={on ? undefined : 'text-muted line-through'}>
                  {j.name}
                  <span className="text-muted no-underline">
                    {' '}
                    · {format(u.priority, { n: j.priority })}
                    {j.needs?.length ? ` · ${format(u.needs, { what: j.needs.join(', ') })}` : ''}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}
      {gated.length > 0 && (
        <div className="flex flex-col gap-0.5 text-[13px]">
          <span className="text-[12px] font-bold">{u.pages}</span>
          {gated.map((p) => (
            <span key={p.route} className="font-mono text-[12px]">
              {format(u.gate, { route: p.route, gate: p.gate ?? '' })}
            </span>
          ))}
        </div>
      )}
      {model.notes.length > 0 && (
        <div className="flex flex-col gap-0.5 text-[13px]">
          <span className="text-[12px] font-bold">{u.notes}</span>
          <ul className="list-disc pl-[18px] text-ink-2">
            {model.notes.slice(0, 6).map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      {answered ? (
        <Chip className="self-start">
          {item.answer?.startsWith('looks-right')
            ? skipped > 0
              ? format(u.answeredRightSkipped, { n: skipped })
              : u.answeredRight
            : u.answeredChange}
        </Chip>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              getEngine().answerQuestion(
                run.projectId,
                item.id,
                `looks-right:${[...off].join(',')}`,
              )
            }
          >
            {u.looksRight}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              useUi.getState().set({ draft: u.changePrefill });
              document.getElementById(MESSAGE_BOX_ID)?.focus();
            }}
          >
            {u.change}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * "I think I'm done. Your call." (SPEC-phase4 §4.1): what was covered, found, fixed and left,
 * the PR to come, and the owner's three answers. Only Finish leads to Done.
 */
function FinishProposal({ item, run }: { item: Item<'finish-proposal'>; run: RunState }) {
  const p = copy.items.proposal;
  const shown = run.findings.filter((f) => (f.lane ?? 'shown') === 'shown');
  const ownerOk = run.findings.filter((f) => f.lane === 'owner-ok').length;
  const fixed = run.changes.filter((c) => c.status === 'verified' && c.kind !== 'wording');
  const rolled = run.changes.filter((c) => c.status === 'rolled-back').length;
  const open = shown.filter((f) => f.status === 'open').length;
  const reached = run.routes.filter((r) => r.status === 'done').map((r) => r.path);
  const model = run.appModel;
  const cov = run.coverage;
  const known = model?.pages.map((pg) => pg.route) ?? [];
  // SPEC-phase4 §6.2: the run's own coverage when it has one; else what the card can see.
  const pagesReached = cov ? cov.pages.reached : reached.length;
  const pagesKnown = cov ? cov.pages.known : known.length;
  const unreached: { route: string; why: keyof typeof p.why }[] = cov
    ? cov.unreached
    : (model?.pages
        .filter((pg) => !reached.includes(pg.route))
        .map((pg) => ({
          route: pg.route,
          why: pg.gate === 'login' ? 'login' : pg.gate === 'data' ? 'data' : 'unknown',
        })) ?? []);
  const journeys = model?.journeys.filter((j) => j.enabled !== false) ?? [];
  const planned = cov ? cov.journeys.planned : journeys.length;
  const done = cov
    ? cov.journeys.done
    : (run.journeys?.filter((j) => j.status === 'done').length ?? 0);
  const failed = cov
    ? cov.journeys.failed + cov.journeys.blocked
    : (run.journeys?.filter((j) => j.status === 'failed' || j.status === 'blocked').length ?? 0);
  const branch = fixed.find((c) => c.branch)?.branch;
  const redesign = fixed.find((c) => c.kind === 'redesign');
  const fixes = fixed.filter((c) => c.kind === 'fix').length;
  const prTitle = redesign
    ? fixes
      ? `${redesign.title} and ${fixes} ${fixes === 1 ? 'fix' : 'fixes'}`
      : redesign.title
    : `Fitts: ${fixes} ${fixes === 1 ? 'fix' : 'fixes'}`;
  const answer = (a: string) => getEngine().answerQuestion(run.projectId, item.id, a);
  return (
    <div className={cx(CARD, 'gap-2 bg-sun-tint')}>
      <span className="font-display text-[16px] font-bold">
        {shown.length === 0 && fixed.length === 0 ? p.titleNothing : p.title}
      </span>
      <ul className="flex flex-col gap-0.5 text-[13px]">
        <li>
          {pagesKnown
            ? format(p.pages, { reached: pagesReached, known: pagesKnown })
            : format(p.pagesNoCode, { reached: pagesReached })}
        </li>
        {planned > 0 && (
          <li>
            {format(p.journeys, { done, planned })}
            {failed > 0 && format(p.journeysFailed, { n: failed })}
          </li>
        )}
        {run.cells && run.cells.length > 0 && <li>{format(p.cells, { n: run.cells.length })}</li>}
        <li>
          {format(p.findings, { shown: shown.length, fixed: fixed.length, rolled, open })}
          {ownerOk > 0 && format(p.ownerOk, { n: ownerOk })}
        </li>
        {unreached.length > 0 && (
          <li>
            {p.notCovered}:{' '}
            {unreached
              .slice(0, 6)
              .map((pg) => `${pg.route} (${p.why[pg.why]})`)
              .join(', ')}
            {unreached.length > 6 ? ', …' : ''}
          </li>
        )}
        <li>
          {fixed.length > 0 && branch
            ? format(p.pr, { title: prTitle, n: fixed.length, branch })
            : p.noPr}
        </li>
      </ul>
      {item.answer !== undefined ? (
        <Chip className="self-start">
          {p.answered[item.answer as keyof typeof p.answered] ?? p.answered.continue}
        </Chip>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => answer('finish')}>
            {p.finish}
          </Button>
          {open > 0 && (
            <Button size="sm" onClick={() => answer('fix-rest')}>
              {format(p.fixRest, { n: open })}
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => {
              useUi.getState().set({ draft: p.keepGoingPrefill });
              document.getElementById(MESSAGE_BOX_ID)?.focus();
            }}
          >
            {p.keepGoing}
          </Button>
        </div>
      )}
    </div>
  );
}

function Driving({ run }: { run: RunState }) {
  const driving = run.activity === 'user-driving';
  return (
    <div className={CARD}>
      <span className="font-display text-[16px] font-bold">{copy.items.drivingTitle}</span>
      <p className="text-[14px] leading-normal">{copy.items.drivingBody}</p>
      {driving && (
        <Button
          variant="primary"
          size="md"
          className="self-start"
          onClick={() => getEngine().handBack(run.projectId)}
        >
          {copy.items.handBack}
        </Button>
      )}
    </div>
  );
}

function stateBody(item: Item<'state'>, run: RunState): string {
  const kind = item.stateKind;
  const c = copy.states;
  switch (kind) {
    case 'stop-run-confirm':
      return run.fixingCount > 0
        ? format(c['stop-run-confirm'].body, {
            findings: run.findings.length,
            fixing: run.fixingCount,
          })
        : format(c['stop-run-confirm'].bodyNoFixes, { findings: run.findings.length });
    case 'stopped': {
      const action = run.overlays.attention?.label.replace(/^Fitts · /, '');
      return action ? format(c.stopped.body, { action }) : c.stopped.bodyNoAction;
    }
    case 'site-down': {
      // The mock engine's card has no detail: its scripted dev server.
      const d = item.detail ?? { url: 'localhost:5173', live: false, log: [c['site-down'].log] };
      const body = d.live
        ? c['site-down'].bodyLive
        : d.log?.length
          ? c['site-down'].body
          : c['site-down'].bodyNoLog;
      return format(body, { url: d.url });
    }
    case 'api-trouble':
      return c['api-trouble'].body;
    case 'reopen':
      return format(c.reopen.body, {
        run: run.runId.replace('run-', ''),
        step: run.step,
        findings: run.findings.length,
        fixes: run.changes.filter((ch) => ch.status === 'verified').length,
      });
    default:
      return c[kind].body;
  }
}

/** Edge-state cards (SPEC §7.7). Buttons answer through RunEngine.answerQuestion. */
function EdgeStateCard({ item, run }: { item: Item<'state'>; run: RunState }) {
  const kind = item.stateKind;
  const text = copy.states[kind];
  const answers = EDGE_STATE_ANSWERS[kind] as readonly string[];
  const live = kind === 'site-down' && item.detail?.live === true;
  const siteLog =
    kind === 'site-down'
      ? (item.detail?.log ?? (item.detail ? [] : [copy.states['site-down'].log]))
      : [];
  const labels = (live ? copy.states['site-down'].answersLive : text.answers) as Record<
    string,
    string
  >;
  // The cap that was reached, even after "Add $10" raised it.
  const reachedCap = run.cost.capUsd - (item.answer === 'add-10' ? 10 : 0);
  const title =
    kind === 'budget' || kind === 'budget-warning'
      ? format(text.title, { cap: formatUsd(reachedCap, { dropWholeCents: true }) })
      : live
        ? copy.states['site-down'].titleLive
        : text.title;
  const firstVariant =
    kind === 'stop-run-confirm' ? 'danger' : kind === 'login-wall' ? 'dark' : 'primary';

  return (
    <div className={cx(CARD, 'gap-2 p-3.5', kind === 'login-wall' ? 'bg-sun-tint' : 'bg-card')}>
      <span className="font-display text-[16px] font-bold">{title}</span>
      <p className="text-[14px] leading-normal">
        <RichText text={stateBody(item, run)} />
      </p>
      {siteLog.length > 0 && (
        <pre className="rounded-row bg-ink p-2.5 font-mono text-[12px] whitespace-pre-wrap text-paper">
          {siteLog.join('\n')}
        </pre>
      )}
      {item.answer !== undefined ? (
        <span className="text-[13px] font-semibold text-muted">
          {kind === 'api-trouble' && item.answer === 'reconnected'
            ? copy.states['api-trouble'].reconnected
            : format(copy.states.answered, { answer: labels[item.answer] ?? item.answer })}
        </span>
      ) : (
        <div className="flex flex-wrap gap-2">
          {answers.map((answer, i) => (
            <Button
              key={answer}
              size="sm"
              variant={i === 0 && kind !== 'api-trouble' ? firstVariant : 'secondary'}
              onClick={() => getEngine().answerQuestion(run.projectId, item.id, answer)}
            >
              {labels[answer]}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TypingIndicator() {
  return (
    <li className="flex items-center gap-1 py-1">
      <span className="sr-only">{copy.chat.typing}</span>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className="size-2 animate-typing rounded-full bg-cobalt motion-reduce:animate-none"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </li>
  );
}

import type { RunState } from '@fitts/schema';
import { Mic, Square, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { Kbd } from '../../components/Kbd';
import { copy } from '../../copy';
import { cx } from '../../lib/cx';
import { format } from '../../lib/format';
import { sendFromComposer } from '../../state/actions';
import { getEngine } from '../../state/engine';
import { useSettings } from '../../state/settings';
import { useUi } from '../../state/ui';
import { MESSAGE_BOX_ID } from '../site-view/SiteView';
import { useMicToggle } from './useMicToggle';

/**
 * The message box and everything pinned above it (SPEC §6.3, §6.4): the "Now:" line, the
 * queued row, the stop button while Fitts acts, the mic, and the pointing chip.
 */
export function Composer({ run, above }: { run: RunState; above?: ReactNode }) {
  const draft = useUi((s) => s.draft);
  const pointingAt = useUi((s) => s.draftPointingAt);
  const pointingLabel = useUi((s) => s.draftPointingLabel);
  const pointedAt = pointingLabel || `#${pointingAt ?? ''}`;
  const pointing = useUi((s) => s.pointing);
  const listening = useUi((s) => s.micListening);
  const armed = useUi((s) => s.wakeArmed);
  const wake = useUi((s) => s.wake);
  const wakeHearing = useUi((s) => s.wakeHearing);
  const hearing = listening || armed || wakeHearing;
  const micPartial = useUi((s) => s.micPartial);
  const talkMode = useSettings((s) => s.talkMode);
  const toggleMic = useMicToggle(run);
  const engine = getEngine();
  const id = run.projectId;
  const auditing = run.phase === 'audit';
  const acting = auditing && (run.activity === 'acting' || run.activity === 'redesigning');

  const send = () => sendFromComposer(id, draft);

  return (
    <div className="flex flex-none flex-col gap-2 border-t border-ink px-3.5 py-2.5">
      {above}
      {auditing && <NowRow run={run} acting={acting} />}
      {auditing &&
        run.queued.map((text, i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded-row border border-dashed border-cobalt px-2.5 py-1.5 text-[13px]"
          >
            <span className="min-w-0 flex-1">{format(copy.composer.queued, { text })}</span>
            {i === 0 && (
              <Button
                size="inline"
                className="min-h-8 px-2.5 text-[12px] font-bold"
                onClick={() => engine.interruptNow(id)}
              >
                {copy.composer.interruptNow}
              </Button>
            )}
          </div>
        ))}
      {pointing && (
        <span role="status" className="text-[13px] font-semibold text-cobalt-ink">
          {copy.composer.pointingHint}
        </span>
      )}
      {pointingAt && (
        <span className="inline-flex items-center gap-1 self-start rounded-tag border border-cobalt py-0.5 pr-0.5 pl-[7px] text-[12px] text-cobalt-deep">
          {format(copy.chat.pointingAt, { label: pointedAt })}
          <button
            type="button"
            aria-label={format(copy.composer.removePointing, { label: pointedAt })}
            onClick={() => useUi.getState().set({ draftPointingAt: null, draftPointingLabel: '' })}
            className="rounded-tag p-0.5 hover:bg-cobalt-tint"
          >
            <X size={12} aria-hidden="true" />
          </button>
        </span>
      )}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor={MESSAGE_BOX_ID} className="sr-only">
          {copy.composer.label}
        </label>
        {/* Grows with what you write, up to about eight lines, then scrolls. Enter sends;
            Shift+Enter starts a new line. */}
        <textarea
          id={MESSAGE_BOX_ID}
          rows={1}
          autoComplete="off"
          value={hearing ? micPartial || copy.composer.listening : draft}
          readOnly={hearing}
          placeholder={auditing ? copy.composer.placeholderRun : copy.composer.placeholderInterview}
          onChange={(e) => useUi.getState().set({ draft: e.target.value })}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
            e.preventDefault();
            send();
          }}
          className={cx(
            'max-h-[196px] min-h-12 min-w-0 flex-1 resize-none rounded-card border border-ink bg-card px-3.5 py-[11px] text-[15px] leading-[1.45] field-sizing-content placeholder:text-muted',
            hearing && 'text-cobalt-ink',
          )}
        />
        {acting && (
          <IconButton
            size="stop"
            variant="danger-outline"
            aria-label={copy.composer.stop}
            onClick={() => engine.stopAction(id)}
            icon={<Square size={16} fill="currentColor" aria-hidden="true" />}
          />
        )}
        {talkMode !== 'typing' && (
          <IconButton
            size="round"
            variant="primary"
            aria-label={copy.composer.talk}
            aria-pressed={listening}
            className={cx('size-12', listening && 'bg-cobalt-deep')}
            onClick={toggleMic}
            icon={<Mic size={20} aria-hidden="true" />}
          />
        )}
      </form>
      <span
        role={talkMode === 'wake' ? 'status' : undefined}
        className={cx(
          'text-[12px]',
          talkMode === 'wake' && wake.status === 'trouble' ? 'text-sun-ink' : 'text-muted',
        )}
      >
        {talkMode === 'typing'
          ? copy.composer.hintTyping
          : talkMode !== 'wake'
            ? copy.composer.hint
            : armed || wakeHearing
              ? copy.composer.hintArmed
              : wake.status === 'trouble'
                ? format(copy.composer.hintWakeTrouble, {
                    why: copy.composer.wakeWhy[wakeWhy(wake.reason)],
                  })
                : wake.status === 'starting'
                  ? copy.composer.hintWakeStarting
                  : copy.composer.hintWake}
      </span>
    </div>
  );
}

/** Why "Always listening" can't hear, in words (main's reasons are terse). */
function wakeWhy(reason: string | undefined): keyof typeof copy.composer.wakeWhy {
  if (reason === 'no key') return 'key';
  if (reason === 'offline') return 'offline';
  if (reason === 'mic') return 'mic';
  return 'other';
}

/**
 * What Fitts is doing (SPEC §6.4). "Now: … · ⌘. stops it" only while Fitts is actually
 * acting; paused, waiting on you or rewound, it says so and names what comes next instead.
 */
function NowRow({ run, acting }: { run: RunState; acting: boolean }) {
  const row = 'flex items-center gap-2 rounded-row px-2.5 py-[7px] text-[13px]';
  if (run.rewindStep !== undefined) {
    return (
      <div className={cx(row, 'bg-neutral-tint text-neutral-ink')}>
        <span aria-hidden="true" className="size-2 flex-none rounded-full bg-ink-faint" />
        <span className="min-w-0 flex-1">
          {format(copy.composer.rewoundAt, { step: run.rewindStep })}
        </span>
      </div>
    );
  }
  if (!run.nowText || run.activity === 'user-driving') return null;
  if (acting) {
    return (
      <div className={cx(row, 'bg-cobalt-tint')}>
        <span aria-hidden="true" className="size-2 flex-none rounded-full bg-cobalt" />
        <span className="min-w-0 flex-1">
          {copy.composer.now} {run.nowText}
        </span>
        <span className="font-mono text-[12px] text-cobalt-deep">
          <Kbd keys={['mod', '.']} /> {copy.composer.stopsIt}
        </span>
      </div>
    );
  }
  const waiting = run.activity === 'waiting-on-user';
  return (
    <div
      className={cx(row, waiting ? 'bg-sun-tint text-sun-ink' : 'bg-neutral-tint text-neutral-ink')}
    >
      <span
        aria-hidden="true"
        className={cx('size-2 flex-none rounded-full', waiting ? 'bg-sun' : 'bg-ink-faint')}
      />
      <span className="min-w-0 flex-1">
        {format(waiting ? copy.composer.waitingNext : copy.composer.pausedNext, {
          action: run.nowText,
        })}
      </span>
    </div>
  );
}

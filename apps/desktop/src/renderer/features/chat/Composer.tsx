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
  const pointing = useUi((s) => s.pointing);
  const listening = useUi((s) => s.micListening);
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
        <span className="inline-flex items-center gap-1 self-start rounded-tag border border-cobalt py-0.5 pr-0.5 pl-[7px] font-mono text-[11px] text-cobalt-deep">
          {format(copy.chat.pointingAt, { ref: pointingAt })}
          <button
            type="button"
            aria-label={format(copy.composer.removePointing, { ref: pointingAt })}
            onClick={() => useUi.getState().set({ draftPointingAt: null })}
            className="rounded-tag p-0.5 hover:bg-cobalt-tint"
          >
            <X size={12} aria-hidden="true" />
          </button>
        </span>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor={MESSAGE_BOX_ID} className="sr-only">
          {copy.composer.label}
        </label>
        <input
          id={MESSAGE_BOX_ID}
          type="text"
          autoComplete="off"
          value={listening ? copy.composer.listening : draft}
          readOnly={listening}
          placeholder={auditing ? copy.composer.placeholderRun : copy.composer.placeholderInterview}
          onChange={(e) => useUi.getState().set({ draft: e.target.value })}
          className={cx(
            'min-h-12 min-w-0 flex-1 rounded-card border border-ink bg-card px-3.5 text-[15px] placeholder:text-muted',
            listening && 'text-cobalt-ink',
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
      <span className="text-[12px] text-muted">
        {talkMode === 'typing'
          ? copy.composer.hintTyping
          : talkMode === 'wake'
            ? copy.composer.hintWake
            : copy.composer.hint}
      </span>
    </div>
  );
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

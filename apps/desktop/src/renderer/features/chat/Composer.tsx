import type { RunState } from '@fitts/schema';
import { Mic, Square, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { Kbd } from '../../components/Kbd';
import { copy } from '../../copy';
import { cx } from '../../lib/cx';
import { format } from '../../lib/format';
import { shortcutLabel } from '../../lib/platform';
import { sendFromComposer } from '../../state/actions';
import { getEngine } from '../../state/engine';
import { useSettings } from '../../state/settings';
import { useUi } from '../../state/ui';
import { MESSAGE_BOX_ID } from '../site-view/SiteView';
import { useHoldToTalk } from './useHoldToTalk';

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
  const mic = useHoldToTalk(run);
  const engine = getEngine();
  const id = run.projectId;
  const auditing = run.phase === 'audit';
  const acting = auditing && (run.activity === 'acting' || run.activity === 'redesigning');

  const send = () => sendFromComposer(id, draft);

  return (
    <div className="flex flex-none flex-col gap-2 border-t border-ink px-3.5 py-2.5">
      {above}
      {auditing && run.nowText && (
        <div className="flex items-center gap-2 rounded-row bg-cobalt-tint px-2.5 py-[7px] text-[13px]">
          <span aria-hidden="true" className="size-2 flex-none rounded-full bg-cobalt" />
          <span className="min-w-0 flex-1">
            {copy.composer.now} {run.nowText}
          </span>
          <span className="font-mono text-[12px] text-cobalt-deep">
            <Kbd keys={['mod', '.']} /> {copy.composer.stopsIt}
          </span>
        </div>
      )}
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
            aria-label={copy.composer.holdToTalk}
            aria-pressed={listening}
            className={cx('size-12', listening && 'bg-cobalt-deep')}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              mic.start();
            }}
            onPointerUp={mic.end}
            onPointerCancel={mic.end}
            onKeyDown={(e) => {
              if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
                e.preventDefault();
                mic.start();
              }
            }}
            onKeyUp={(e) => {
              if (e.key === ' ' || e.key === 'Enter') mic.end();
            }}
            icon={<Mic size={20} aria-hidden="true" />}
          />
        )}
      </form>
      <span className="text-[12px] text-muted">
        {talkMode === 'typing'
          ? copy.composer.hintTyping
          : format(copy.composer.hint, { alt: shortcutLabel(['alt']) })}
      </span>
    </div>
  );
}

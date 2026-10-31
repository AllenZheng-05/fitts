import type { RunState } from '@fitts/schema';
import { Volume2, VolumeX } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { FittsAvatar } from '../../components/brand/FittsAvatar';
import { IconButton } from '../../components/IconButton';
import { copy } from '../../copy';
import { cx } from '../../lib/cx';
import { useSettings } from '../../state/settings';
import { useUi } from '../../state/ui';
import { useSpeech } from '../../state/speech';
import { ChatList } from './ChatList';
import { Composer } from './Composer';
import { chatStatus, STATUS_STYLE } from './status';

/** Fitts's panel: header, conversation, composer (SPEC §6.3, §6.4). */
export function ChatPanel({
  run,
  aboveComposer,
  className,
  width,
}: {
  run: RunState;
  /** Pinned above the message box, e.g. the interview's ready bar. */
  aboveComposer?: ReactNode;
  className?: string;
  /** Its width, when the user resized it. */
  width?: number | undefined;
}) {
  const speaksAloud = useSettings((s) => s.speaksAloud);
  const speaking = useSpeech((s) => s.speaking);
  const micLive = useUi((s) => s.micListening);
  const status = chatStatus(run, speaking, micLive);
  const style = STATUS_STYLE[status];
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className={cx(
        'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-panel border-[1.5px] border-ink bg-card shadow-panel',
        className,
      )}
      style={width ? { width } : undefined}
    >
      <div className="flex flex-none items-center gap-2.5 border-b border-ink px-3.5 py-2.5">
        <FittsAvatar size={36} speaking={speaking} />
        <div className="mr-auto flex flex-col">
          <h2 id={titleId} className="font-display text-[16px] font-bold">
            {copy.chat.name}
          </h2>
          <span
            role="status"
            className={cx('flex items-center gap-1.5 text-[12px] font-semibold', style.text)}
          >
            <span aria-hidden="true" className={cx('size-[7px] rounded-full', style.dot)} />
            {copy.chat.status[status]}
          </span>
        </div>
        <IconButton
          aria-label={copy.chat.mute}
          aria-pressed={!speaksAloud}
          onClick={() => useSettings.getState().set({ speaksAloud: !speaksAloud })}
          icon={
            speaksAloud ? (
              <Volume2 size={18} aria-hidden="true" />
            ) : (
              <VolumeX size={18} aria-hidden="true" />
            )
          }
        />
      </div>
      <ChatList run={run} />
      <Composer run={run} above={aboveComposer} />
    </section>
  );
}

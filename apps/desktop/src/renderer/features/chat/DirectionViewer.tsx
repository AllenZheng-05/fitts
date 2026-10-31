import type { ChatItem, RunState } from '@fitts/schema';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { IconButton } from '../../components/IconButton';
import { Modal } from '../../components/overlay/Modal';
import { copy } from '../../copy';
import { format } from '../../lib/format';
import { getEngine } from '../../state/engine';
import { sendFromComposer } from '../../state/actions';

type Directions = Extract<ChatItem, { type: 'directions' }>;

/**
 * A direction's mockup, large (Allen's feedback: a click used to pick it before you could see
 * it): the whole picture to scroll and look at, arrows through the three, and "Choose this one".
 */
export function DirectionViewer({
  item,
  run,
  index,
  onIndex,
  onClose,
}: {
  item: Directions;
  run: RunState;
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const chooseRef = useRef<HTMLButtonElement>(null);
  const option = index === null ? undefined : item.options[index];
  const n = item.options.length;
  const chosen = option !== undefined && option.id === item.selectedId;
  return (
    <Modal
      open={option !== undefined}
      onClose={onClose}
      labelledBy={titleId}
      width={1100}
      initialFocusRef={chooseRef}
    >
      {option && index !== null && (
        <>
          <div className="flex flex-none items-center gap-2.5 border-b border-ink px-4 py-3">
            <span aria-hidden="true" className="flex gap-[3px]">
              {option.swatches.slice(0, 4).map((color) => (
                <span key={color} className="size-4 rounded-tag" style={{ background: color }} />
              ))}
            </span>
            <h2 id={titleId} className="min-w-0 flex-1 font-display text-[19px] font-bold">
              {option.name}
            </h2>
            <span className="font-mono text-[12px] text-muted">
              {format(copy.directions.position, { i: index + 1, n })}
            </span>
            <IconButton
              aria-label={copy.directions.previous}
              disabled={index <= 0}
              onClick={() => onIndex(index - 1)}
              icon={<ChevronLeft size={15} strokeWidth={2.5} aria-hidden="true" />}
            />
            <IconButton
              aria-label={copy.directions.next}
              disabled={index >= n - 1}
              onClick={() => onIndex(index + 1)}
              icon={<ChevronRight size={15} strokeWidth={2.5} aria-hidden="true" />}
            />
            <IconButton
              aria-label={copy.overlay.close}
              onClick={onClose}
              icon={<X size={15} strokeWidth={2.5} aria-hidden="true" />}
            />
          </div>
          {/* The whole picture at its own width, in a frame like a browser window. */}
          <div className="min-h-0 flex-1 overflow-auto bg-surface-2 p-4">
            {option.board ? (
              // The board (SPEC-phase3 §2): its own page, sandboxed, nothing it can run or fetch.
              <figure className="mx-auto flex h-full max-w-[1100px] flex-col overflow-hidden rounded-card border-[1.5px] border-ink bg-card">
                <iframe
                  src={option.board}
                  sandbox=""
                  title={format(copy.directions.boardTitle, { name: option.name })}
                  className="block min-h-[520px] w-full flex-1 border-0"
                />
                <figcaption className="border-t border-ink px-3 py-1.5 text-[12px] text-muted">
                  {copy.directions.boardCaption}
                </figcaption>
              </figure>
            ) : option.mockup ? (
              <figure className="mx-auto flex max-w-[1024px] flex-col overflow-hidden rounded-card border-[1.5px] border-ink bg-card">
                <div
                  aria-hidden="true"
                  className="flex flex-none items-center gap-1.5 border-b border-ink px-3 py-2"
                >
                  <span className="size-2.5 rounded-full bg-ink-faint" />
                  <span className="size-2.5 rounded-full bg-ink-faint" />
                  <span className="size-2.5 rounded-full bg-ink-faint" />
                </div>
                <img
                  src={option.mockup}
                  alt={format(copy.items.directionMockupAlt, { name: option.name })}
                  className="block h-auto w-full"
                />
                <figcaption className="border-t border-ink px-3 py-1.5 text-[12px] text-muted">
                  {copy.directions.caption}
                </figcaption>
              </figure>
            ) : (
              <p className="py-10 text-center text-[14px] text-muted">{copy.directions.noMockup}</p>
            )}
          </div>
          <Feedback item={item} run={run} name={option.name} onSent={onClose} />
          <div className="flex flex-none flex-wrap items-center justify-end gap-2 border-t border-ink px-4 py-3">
            {chosen && <Chip tone="mint">{copy.directions.chosen}</Chip>}
            <Button size="md" onClick={onClose}>
              {copy.directions.keepLooking}
            </Button>
            <Button
              ref={chooseRef}
              variant="primary"
              size="md"
              disabled={chosen}
              onClick={() => {
                getEngine().pickDirection(run.projectId, option.id);
                onClose();
              }}
            >
              {copy.directions.choose}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

/**
 * What would you change? (SPEC-phase3 §2.3): said about the direction on screen, it goes to
 * Fitts like any message, and a new round of looks comes back.
 */
function Feedback({
  item,
  run,
  name,
  onSent,
}: {
  item: Directions;
  run: RunState;
  name: string;
  onSent: () => void;
}) {
  const [text, setText] = useState('');
  const id = useId();
  if (item.selectedId || run.phase === 'done') return null;
  const send = () => {
    if (!text.trim()) return;
    sendFromComposer(
      run.projectId,
      format(copy.directions.feedbackPrefix, { name, text: text.trim() }),
    );
    setText('');
    onSent();
  };
  return (
    <form
      className="flex flex-none items-end gap-2 border-t border-ink px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <label htmlFor={id} className="text-[13px] font-semibold">
          {format(copy.directions.feedbackLabel, { name })}
        </label>
        <input
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={copy.directions.feedbackPlaceholder}
          className="min-h-11 rounded-control border border-ink bg-card px-3 text-[14px] placeholder:text-muted"
        />
      </span>
      <Button type="submit" size="md" disabled={!text.trim()}>
        {copy.directions.feedbackSend}
      </Button>
    </form>
  );
}

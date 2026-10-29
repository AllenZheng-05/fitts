import type { ChatItem, RunState } from '@fitts/schema';
import { useLayoutEffect, useRef, useState } from 'react';
import { copy } from '../../copy';
import { BriefCard, ChatItemView, TypingIndicator } from './items';

/** Pixels from the bottom that still count as "at the bottom". */
const STICK = 48;

type Question = Extract<ChatItem, { type: 'question' }>;

/**
 * The conversation (SPEC §6.6): `role="log"`, new items scroll into view unless the user
 * has scrolled up, in which case a "New messages ↓" pill appears.
 */
export function ChatList({ run }: { run: RunState }) {
  const listRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const count = run.chat.length + (run.fittsTyping ? 1 : 0);
  const [seen, setSeen] = useState(count);
  const unseen = !atBottom && count > seen;

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [count]);

  // During the interview the brief card stays last so it reads as a running summary.
  const pinBrief = run.phase === 'interview';
  const items = pinBrief ? run.chat.filter((c) => c.type !== 'brief') : run.chat;
  const hasBrief = pinBrief && run.chat.some((c) => c.type === 'brief');
  const openBlocking = [...run.chat]
    .reverse()
    .find((c): c is Question => c.type === 'question' && c.blocking && c.answer === undefined);

  return (
    <div className="relative min-h-0 flex-1">
      {/* The log wraps a plain list: role="log" on the <ol> would drop its list semantics. */}
      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-label={copy.chat.log}
        // The log scrolls, so keyboard users must be able to reach it.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK;
          atBottomRef.current = bottom;
          setAtBottom(bottom);
          if (bottom) setSeen(count);
        }}
        className="h-full overflow-y-auto focus-visible:-outline-offset-2"
      >
        <ol className="flex flex-col gap-3 p-3.5">
          {items.map((item) => (
            <ChatItemView key={item.id} item={item} run={run} />
          ))}
          {hasBrief && <BriefCard brief={run.brief} />}
          {run.fittsTyping && <TypingIndicator />}
        </ol>
      </div>
      {/* Blocking questions are announced assertively (SPEC §10). */}
      <div className="sr-only" aria-live="assertive">
        {openBlocking?.text ?? ''}
      </div>
      {unseen && (
        <button
          type="button"
          onClick={() => {
            const el = listRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-pill border border-ink bg-ink px-3 py-1.5 text-[13px] font-semibold text-card shadow-button"
        >
          {copy.chat.newMessages}
        </button>
      )}
    </div>
  );
}

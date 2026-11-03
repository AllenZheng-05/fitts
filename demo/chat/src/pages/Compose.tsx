import { useEffect, useState } from 'react';
import { api, type Contact } from '../api';
import { navigate, navigatedInApp } from '../router';

const KEY_TO = 'draft.to';
const KEY_TEXT = 'draft.text';

function StepTitle({ step }: { step: number }) {
  return (
    <div className="row between baseline">
      <h1 className="title">New message</h1>
      <span className="muted small">Step {step} of 3</span>
    </div>
  );
}

// The picker says when contacts are loading, failed or empty. These aren't planted issues (the
// Contacts page's own blank failure is #33), so the bench measures only what PLANTED.md lists.
function useContacts(): { contacts: Contact[]; state: 'loading' | 'failed' | 'ready' } {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [state, setState] = useState<'loading' | 'failed' | 'ready'>('loading');
  useEffect(() => {
    api
      .contacts()
      .then((list) => {
        // An error answer (a 500 with a JSON body) isn't a list.
        if (!Array.isArray(list)) return setState('failed');
        setContacts(list);
        setState('ready');
      })
      .catch(() => setState('failed'));
  }, []);
  return { contacts, state };
}

/** Step 1: who is it for? */
export function Compose() {
  const { contacts, state } = useContacts();
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <>
      <StepTitle step={1} />
      <span className="muted">Who is it for?</span>
      {/* The status lines sit in the chips' own room, so nothing moves when they go. */}
      <div className="chips" style={{ minHeight: 44 }}>
        {state === 'loading' && (
          <span role="status" className="muted">
            Loading your contacts…
          </span>
        )}
        {state === 'failed' && (
          <span role="alert" className="muted">
            Your contacts didn’t load. Check your connection, then reload the page.
          </span>
        )}
        {state === 'ready' && contacts.length === 0 && (
          <span className="muted">
            You don’t have any contacts yet. Add someone on the <a href="/contacts">Contacts</a>{' '}
            page first.
          </span>
        )}
        {contacts.map((c) => (
          <button
            key={c.id}
            type="button"
            data-ref={`compose-contact-${c.name.toLowerCase().replace(' ', '-')}`}
            aria-pressed={picked === c.id}
            className={picked === c.id ? 'chip on' : 'chip'}
            onClick={() => setPicked(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="row end">
        <button
          type="button"
          data-ref="compose-next-1"
          className="btn gray"
          onClick={() => {
            if (picked !== null) sessionStorage.setItem(KEY_TO, String(picked));
            navigate('/compose/recipient');
          }}
        >
          NEXT
        </button>
      </div>
    </>
  );
}

/** Step 2: the message. */
export function ComposeRecipient() {
  const [text, setText] = useState('');
  const recipient = sessionStorage.getItem('draft.recipient');
  const toNext = () => {
    sessionStorage.setItem(KEY_TEXT, text);
    navigate('/compose/confirm');
  };
  return (
    <>
      <StepTitle step={2} />
      <div data-ref="compose-to" className="to-field">
        To: ({String(recipient)})
      </div>
      <textarea
        data-ref="compose-body"
        aria-label="Message"
        placeholder="Write your message"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="body"
      />
      <div className="row end gap">
        <button type="button" data-ref="compose-create" className="link small" onClick={toNext}>
          Create Message
        </button>
        <button type="button" data-ref="compose-next" className="btn gray" onClick={toNext}>
          NEXT
        </button>
      </div>
    </>
  );
}

/** Step 3: check and send. */
/** This page load was a reload (the browser's Refresh). */
const reloaded = () =>
  (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)
    ?.type === 'reload';

export function ComposeConfirm() {
  const [error, setError] = useState<string | null>(null);
  const [tip, setTip] = useState(false);
  // Planted #32: refreshed (a reload, not a first visit by its link), step 3 renders nothing.
  if (!navigatedInApp() && reloaded()) return null;
  const text = sessionStorage.getItem(KEY_TEXT) ?? '';
  const to = Number(sessionStorage.getItem(KEY_TO) ?? undefined);
  const send = async () => {
    const res = await api.send(Number.isNaN(to) ? undefined : to, text);
    if (!res.ok) {
      const body = (await res.json()) as { code?: string };
      setError(`Error ${body.code ?? res.status}`);
      return;
    }
    sessionStorage.removeItem(KEY_TEXT);
    navigate('/');
  };
  return (
    <>
      <StepTitle step={3} />
      <div className="summary">
        <span className="muted">To: ({String(sessionStorage.getItem('draft.recipient'))})</span>
        <span>{text}</span>
      </div>
      {error && (
        <p data-ref="compose-error" className="error">
          {error}
        </p>
      )}
      {/* Planted #30: the tip slides in above Send the moment the pointer comes near it. */}
      {tip && <p className="late-tip">Tip: messages arrive faster on Wi-Fi.</p>}
      <div className="row end" onPointerEnter={() => setTimeout(() => setTip(true), 60)}>
        <button
          type="button"
          data-ref="compose-send"
          className="send-link"
          onClick={() => void send()}
        >
          Send Text
        </button>
      </div>
    </>
  );
}

import { useEffect, useState } from 'react';
import { api, type Conversation } from '../api';
import { shortDate } from '../dates';
import { navigate } from '../router';

/** A letter on a colored circle, as an image (planted #27 needs a real img). */
function avatarOf(name: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="16" fill="#ddd6cb"/><text x="16" y="21" font-family="sans-serif" font-size="13" font-weight="700" text-anchor="middle" fill="#1d1d1b">${name[0] ?? ''}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function Inbox() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [rate, setRate] = useState(false);
  useEffect(() => {
    void api.conversations().then(setConversations);
  }, []);
  // Planted #29: "Rate us" pops up 4 s after opening the inbox (once a session), focus stays
  // behind it, Tab walks out of it, Esc does nothing, and its close is a mouse-only span. It
  // goes away on its own after 20 s so the rest of the page stays usable.
  useEffect(() => {
    if (sessionStorage.getItem('rated')) return;
    const show = setTimeout(() => {
      sessionStorage.setItem('rated', '1');
      setRate(true);
    }, 4000);
    const hide = setTimeout(() => setRate(false), 24_000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);

  return (
    <>
      <div className="row between">
        <h1 className="title">Messages</h1>
        <nav className="links">
          <button
            type="button"
            data-ref="inbox-search"
            className="link"
            onClick={() => navigate('/search')}
          >
            Search
          </button>
          <button
            type="button"
            data-ref="inbox-contacts"
            className="link"
            onClick={() => navigate('/contacts')}
          >
            Contacts
          </button>
          <button
            type="button"
            data-ref="inbox-settings"
            className="link"
            onClick={() => navigate('/settings')}
          >
            Settings
          </button>
        </nav>
      </div>
      <ul className="threads">
        {conversations.map((c, i) => {
          const last = c.messages[c.messages.length - 1];
          return (
            <li key={c.id}>
              <button
                type="button"
                data-ref={`inbox-thread-${i}`}
                className="thread-row"
                onClick={() => navigate(c.id === 12 ? '/contacts/grandma' : '/')}
              >
                {/* Planted #27: avatar images with no alt text. */}
                <img className="avatar" src={avatarOf(c.name)} width={32} height={32} />
                <span className="thread-text">
                  <strong>{c.name}</strong>
                  <span className="preview">{last?.text ?? ''}</span>
                </span>
                <span className="stamp">{last ? shortDate(last.at) : ''}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {rate && (
        <div role="dialog" aria-label="Rate us" data-ref="rate-dialog" className="rate">
          <strong>Enjoying Messages?</strong>
          <span>Rate us in the store.</span>
          <button
            type="button"
            data-ref="rate-now"
            className="btn gray"
            onClick={() => setRate(false)}
          >
            Rate now
          </button>
          <span className="rate-close" onClick={() => setRate(false)}>
            ×
          </span>
        </div>
      )}
      <div className="row between">
        <a href="/help" data-ref="inbox-help" className="link small">
          Help
        </a>
        <button
          type="button"
          data-ref="inbox-compose"
          className="btn gray"
          onClick={() => navigate('/compose')}
        >
          Compose
        </button>
      </div>
    </>
  );
}

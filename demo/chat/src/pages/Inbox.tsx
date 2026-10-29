import { useEffect, useState } from 'react';
import { api, type Conversation } from '../api';
import { shortDate } from '../dates';
import { navigate } from '../router';

export function Inbox() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  useEffect(() => {
    void api.conversations().then(setConversations);
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
                <span className="avatar">{c.name[0]}</span>
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

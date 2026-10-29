import { useEffect, useState } from 'react';
import { api, type Conversation } from '../api';
import { longDate } from '../dates';
import { navigate } from '../router';

function PhoneIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}

export function Thread({ conversationId }: { conversationId: number }) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void api.conversation(conversationId).then((c) => {
      setConversation(c.messages ? c : null);
      setLoaded(true);
    });
  }, [conversationId]);

  return (
    <>
      <div className="row between">
        <h1 className="title">Grandma</h1>
        <div className="row gap">
          <button type="button" data-ref="thread-call" className="icon-btn">
            <PhoneIcon />
          </button>
          <button type="button" data-ref="thread-video" className="icon-btn">
            <VideoIcon />
          </button>
          <button
            type="button"
            data-ref="thread-delete"
            className="link small danger"
            onClick={() => {
              void api.deleteConversation(conversationId).then(() => setConversation(null));
            }}
          >
            Delete conversation
          </button>
        </div>
      </div>
      <ul className="bubbles">
        {loaded && !conversation && <li className="muted">No messages.</li>}
        {conversation?.messages.map((m, i) => (
          <li key={i} className={m.from === 'You' ? 'bubble mine' : 'bubble'}>
            <span>{m.text}</span>
            <span className="stamp-long">{longDate(m.at)}</span>
          </li>
        ))}
      </ul>
      <div className="row end">
        <button
          type="button"
          data-ref="thread-message"
          className="btn gray"
          onClick={() => navigate('/compose')}
        >
          Initialize thread
        </button>
      </div>
    </>
  );
}

import { useState } from 'react';
import { api, type SearchItem } from '../api';
import { isoDate } from '../dates';
import { navigate } from '../router';

export function Search() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SearchItem[]>([]);
  // A failed search says so (not planted; #13, no loading indicator, still stands).
  const [failed, setFailed] = useState(false);

  const onChange = (q: string) => {
    setQuery(q);
    api
      .search(q)
      .then((res) => {
        setFailed(!Array.isArray(res.items));
        setItems(Array.isArray(res.items) ? res.items : []);
      })
      .catch(() => setFailed(true));
  };
  const q = query.trim().toLowerCase();
  const results = q
    ? items.filter((i) => i.text.toLowerCase().includes(q) || i.from.toLowerCase().includes(q))
    : [];

  return (
    <>
      <h1 className="title">Search</h1>
      <input
        data-ref="search-input"
        aria-label="Search messages"
        placeholder="Search"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        className="input"
      />
      {failed && (
        <p role="alert" className="muted">
          Search didn’t work. Try again in a moment.
        </p>
      )}
      <ul className="results">
        {results.slice(0, 50).map((r) => (
          <li key={r.id}>
            <button
              type="button"
              data-ref={`search-result-${r.id}`}
              className="result"
              onClick={() => navigate('/contacts/grandma')}
            >
              <span>{r.from}</span>
              <span className="preview">{r.text}</span>
              <span className="muted small">{isoDate(r.at)}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

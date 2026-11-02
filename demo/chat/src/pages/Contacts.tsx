import { useEffect, useState } from 'react';
import { api, type Contact } from '../api';
import { navigate } from '../router';

export function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filter, setFilter] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .contacts()
      .then((list) => (Array.isArray(list) ? setContacts(list) : setFailed(true)))
      .catch(() => setFailed(true));
  }, []);

  const add = async () => {
    const res = await api.addContact(name, phone);
    if (!res.ok) {
      setError(true);
      setName('');
      setPhone('');
      return;
    }
    setError(false);
    setName('');
    setPhone('');
    setContacts(await api.contacts());
  };

  // Planted #33: when the contacts request fails, the page is simply blank.
  if (failed) return null;
  const shown = contacts.filter((c) => c.name.toLowerCase().includes(filter.trim().toLowerCase()));
  return (
    <>
      <h1 className="title">Contacts</h1>
      {/* Planted #28: a search field with no label (a magnifier glyph is all it has). */}
      <span aria-hidden="true" className="muted">
        ⌕
      </span>
      <input
        data-ref="contacts-filter"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="input"
      />
      <ul data-ref="contacts-list" className="contacts">
        {shown.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              data-ref={`contact-${c.name.toLowerCase().replace(' ', '-')}`}
              className="contact-row"
              onClick={() => navigate('/contacts/grandma')}
            >
              {c.name}
            </button>
          </li>
        ))}
      </ul>
      <form
        data-ref="contacts-add"
        className="add-form"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <span className="label">Add a contact</span>
        <input
          aria-label="Name"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input"
        />
        <input
          aria-label="Phone"
          placeholder="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="input"
        />
        {error && <p className="error">Invalid input</p>}
        <button type="submit" data-ref="contacts-add-submit" className="btn gray">
          Add
        </button>
      </form>
    </>
  );
}

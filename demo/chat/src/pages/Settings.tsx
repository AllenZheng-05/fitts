import { useState } from 'react';
import { navigate } from '../router';

const TOGGLES = [
  'Sounds',
  'Large text',
  'Read receipts',
  'Typing indicator',
  'Vibrate',
  'Auto-download photos',
  'Auto-download videos',
  'Save to gallery',
  'Dark mode',
  'Show previews',
  'Group notifications',
  'Enter to send',
  'Link previews',
  'Archive old chats',
];

export function Settings() {
  const [on, setOn] = useState<Record<string, boolean>>({ Sounds: true, 'Read receipts': true });
  return (
    <>
      <h1 className="title">Settings</h1>
      {/* Planted #31: "Contacts" says /contacts but goes to /settings/privacy. */}
      <a
        href="/contacts"
        data-ref="settings-contacts"
        className="link small"
        onClick={(e) => {
          e.preventDefault();
          navigate('/settings/privacy');
        }}
      >
        Contacts
      </a>
      <ul data-ref="settings-list" className="settings">
        {TOGGLES.map((name) => {
          const value = Boolean(on[name]);
          return (
            <li key={name} className="setting">
              <span>{name}</span>
              <button
                type="button"
                role="switch"
                aria-checked={value}
                aria-label={name}
                data-ref={`settings-${name.toLowerCase().replace(/ /g, '-')}`}
                className={value ? 'switch on' : 'switch'}
                onClick={() => setOn((s) => ({ ...s, [name]: !value }))}
              />
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Where Settings' "Contacts" link really goes (planted #31). */
export function Privacy() {
  return (
    <>
      <h1 className="title">Privacy</h1>
      <p className="muted">Your messages stay on this device.</p>
      <a href="/settings" className="link">
        Back to Settings
      </a>
    </>
  );
}

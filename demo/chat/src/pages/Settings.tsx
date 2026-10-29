import { useState } from 'react';

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

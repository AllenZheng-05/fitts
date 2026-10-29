// demo/chat: a plain, slightly bad family-messaging site (SPEC §9.4). The `now` variant
// carries the seeded flaws; `fixed` is the Done preview with every fix applied.
import { useEffect, useState, type ReactNode } from 'react';
import { SITE_FONT, type MockSiteProps } from './types';

const CONTACTS = ['Grandma', 'Mom', 'Uncle Joe', 'Priya'];

const THREAD = [
  { from: 'Grandma', text: 'Did you get the photos from Sunday?' },
  { from: 'You', text: 'Yes! The garden looks lovely.' },
  { from: 'Grandma', text: 'Call me when you can, sweetheart.' },
];

export function DemoChatSite({ route, navigate, variant, onElementClick }: MockSiteProps) {
  const fixed = variant === 'fixed';
  const [deleted, setDeleted] = useState(false);
  const [sent, setSent] = useState(fixed);

  // Report clicks on any element with a data-ref (for "You clicked …").
  const onClickCapture = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ref]');
    if (el?.dataset['ref'])
      onElementClick?.(el.dataset['ref'], el.dataset['label'] ?? el.innerText);
  };

  let page: ReactNode;
  if (route === '/') page = <Inbox navigate={navigate} />;
  else if (route === '/search') page = <Search fixed={fixed} navigate={navigate} />;
  else if (route === '/contacts') page = <Contacts navigate={navigate} />;
  else if (route === '/contacts/grandma')
    page = <Thread deleted={deleted} onDelete={() => setDeleted(true)} navigate={navigate} />;
  else if (route === '/settings') page = <SettingsPage fixed={fixed} />;
  else if (route === '/compose/recipient')
    page = <ComposeMessage fixed={fixed} navigate={navigate} />;
  else if (route === '/compose/confirm')
    page = (
      <Confirm
        fixed={fixed}
        sent={sent}
        onSend={() => {
          if (fixed) setSent(true);
          // The flaw (§9.4): sending goes straight back to the inbox with no confirmation.
          else navigate('/');
        }}
        navigate={navigate}
      />
    );
  else page = <ComposeTo fixed={fixed} navigate={navigate} />;

  return (
    // The capture handler only observes clicks for logging; it adds no interaction.
    <div
      data-mock-site
      onClickCapture={onClickCapture}
      className={`${SITE_FONT} flex h-full w-full justify-center overflow-y-auto bg-[#F3F1EC] px-6 py-8 text-[#1d1d1b]`}
    >
      <div
        className={`flex h-fit w-full flex-col gap-3.5 rounded-[8px] border border-[#D4D1C9] bg-white p-[22px] ${fixed ? 'max-w-[360px] text-[17px]' : 'max-w-[440px] text-[14px]'}`}
      >
        {page}
      </div>
    </div>
  );
}

type Nav = { navigate: (route: string) => void };

function SiteButton({
  refId,
  label,
  onClick,
  tone = 'gray',
  fixed = false,
}: {
  refId: string;
  label: string;
  onClick: () => void;
  tone?: 'gray' | 'blue' | 'outline';
  fixed?: boolean;
}) {
  const tones = {
    gray: 'bg-[#8A8780] text-white',
    blue: 'bg-[#1F2A88] text-white',
    outline: 'border-[1.5px] border-[#1F2A88] text-[#1F2A88] bg-white',
  };
  return (
    <button
      type="button"
      data-ref={refId}
      data-label={label}
      onClick={onClick}
      className={`rounded-[6px] font-bold ${fixed ? 'px-7 py-[13px] text-[16px]' : 'px-[18px] py-2.5 text-[13px]'} ${tones[tone]}`}
    >
      {label}
    </button>
  );
}

function Inbox({ navigate }: Nav) {
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[18px] font-bold">Messages</span>
        <div className="flex gap-3 text-[12px]">
          <button
            type="button"
            data-ref="inbox-search"
            data-label="Search"
            className="text-[#2557D6] underline"
            onClick={() => navigate('/search')}
          >
            Search
          </button>
          <button
            type="button"
            data-ref="inbox-contacts"
            data-label="Contacts"
            className="text-[#2557D6] underline"
            onClick={() => navigate('/contacts')}
          >
            Contacts
          </button>
          <button
            type="button"
            data-ref="inbox-settings"
            data-label="Settings"
            className="text-[#2557D6] underline"
            onClick={() => navigate('/settings')}
          >
            Settings
          </button>
        </div>
      </div>
      <ul className="flex flex-col divide-y divide-[#E4E1DA]">
        {THREAD.slice(0, 1)
          .concat([
            { from: 'Mom', text: 'Dinner at 6 on Friday?' },
            { from: 'Uncle Joe', text: 'Ha! Good one.' },
          ])
          .map((m, i) => (
            <li key={m.from}>
              <button
                type="button"
                data-ref={`inbox-thread-${i}`}
                data-label={m.from}
                onClick={() => navigate('/contacts/grandma')}
                className="flex w-full items-center gap-3 py-2 text-left"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-[#DDD6CB] text-[12px] font-bold">
                  {m.from[0]}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <strong className="text-[13px]">{m.from}</strong>
                  <span className="truncate text-[12px] text-[#6B6B66]">{m.text}</span>
                </span>
                {i === 0 && (
                  <span aria-hidden="true" className="size-2 rounded-full bg-[#2557D6]" />
                )}
              </button>
            </li>
          ))}
      </ul>
      <div className="flex justify-end">
        <SiteButton
          refId="inbox-compose"
          label="Compose"
          tone="gray"
          onClick={() => navigate('/compose')}
        />
      </div>
    </>
  );
}

function StepTitle({ step, fixed }: { step: number; fixed: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={`font-bold ${fixed ? 'text-[21px]' : 'text-[18px]'}`}>New message</span>
      <span className="text-[12px] text-[#6B6B66]">Step {step} of 3</span>
    </div>
  );
}

function ComposeTo({ fixed, navigate }: { fixed: boolean } & Nav) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <>
      <StepTitle step={1} fixed={fixed} />
      <span className="text-[13px] text-[#4A4843]">Who is it for?</span>
      <div className="flex flex-wrap gap-2">
        {CONTACTS.map((c) => (
          <button
            key={c}
            type="button"
            data-ref={`compose-contact-${c.toLowerCase().replace(' ', '-')}`}
            data-label={c}
            aria-pressed={picked === c}
            onClick={() => setPicked(c)}
            className={`rounded-full border px-3 py-1.5 text-[13px] ${picked === c ? 'border-[#1F2A88] bg-[#E6E9F7]' : 'border-[#D4D1C9]'}`}
          >
            {c}
          </button>
        ))}
      </div>
      <div className={`flex ${fixed ? 'justify-between' : 'justify-end'}`}>
        {fixed && (
          <SiteButton
            refId="compose-back"
            label="Back"
            tone="outline"
            fixed
            onClick={() => navigate('/')}
          />
        )}
        <SiteButton
          refId="compose-next-1"
          label={fixed ? 'Next' : 'NEXT'}
          tone={fixed ? 'blue' : 'gray'}
          fixed={fixed}
          onClick={() => navigate('/compose/recipient')}
        />
      </div>
    </>
  );
}

function ComposeMessage({ fixed, navigate }: { fixed: boolean } & Nav) {
  const [text, setText] = useState('');
  return (
    <>
      <StepTitle step={2} fixed={fixed} />
      <div
        data-ref="compose-to"
        data-label="To field"
        className={`flex items-center rounded-[6px] border px-3 ${fixed ? 'h-[46px] border-[1.5px] border-[#8A8780] text-[17px]' : 'h-10 border-[#D4D1C9] text-[#4A4843]'}`}
      >
        {fixed ? 'To: Grandma' : 'To: (null)'}
      </div>
      <textarea
        data-ref="compose-body"
        data-label="Message"
        aria-label="Message"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className={`h-[100px] resize-none rounded-[6px] border p-2 ${fixed ? 'border-[1.5px] border-[#8A8780]' : 'border-[#D4D1C9]'}`}
      />
      <div className={`flex items-center gap-3.5 ${fixed ? 'justify-between' : 'justify-end'}`}>
        {fixed ? (
          <SiteButton
            refId="compose-back"
            label="Back"
            tone="outline"
            fixed
            onClick={() => navigate('/compose')}
          />
        ) : (
          <button
            type="button"
            data-ref="compose-create"
            data-label="Create Message"
            onClick={() => navigate('/compose/confirm')}
            className="text-[12px] text-[#2557D6] underline"
          >
            Create Message
          </button>
        )}
        <SiteButton
          refId="compose-next"
          label={fixed ? 'Next' : 'NEXT'}
          tone={fixed ? 'blue' : 'gray'}
          fixed={fixed}
          onClick={() => navigate('/compose/confirm')}
        />
      </div>
    </>
  );
}

function Confirm({
  fixed,
  sent,
  onSend,
  navigate,
}: { fixed: boolean; sent: boolean; onSend: () => void } & Nav) {
  return (
    <>
      <StepTitle step={3} fixed={fixed} />
      <div className="flex flex-col gap-1 rounded-[6px] bg-[#F6F4EF] p-3 text-[13px]">
        <span className="text-[#4A4843]">{fixed ? 'To: Grandma' : 'To: (null)'}</span>
        <span>Hi Grandma, the photos came through. Talk Sunday?</span>
      </div>
      <div className={`flex items-center ${fixed ? 'justify-between' : 'justify-end'}`}>
        {fixed ? (
          <>
            <SiteButton
              refId="compose-back"
              label="Back"
              tone="outline"
              fixed
              onClick={() => navigate('/compose/recipient')}
            />
            <SiteButton refId="compose-send" label="Send" tone="blue" fixed onClick={onSend} />
          </>
        ) : (
          // The flaw (§9.4): a 28 × 20 px "Send Text" link.
          <button
            type="button"
            data-ref="compose-send"
            data-label="Send Text"
            onClick={onSend}
            className="h-5 w-7 overflow-hidden text-[9px] leading-none whitespace-nowrap text-[#2557D6] underline"
          >
            Send Text
          </button>
        )}
      </div>
      {fixed && sent && (
        <div
          data-ref="confirm-send"
          role="status"
          className="rounded-[8px] bg-[#E6F6EE] px-3.5 py-[11px] text-[15px] font-semibold text-[#0B5A3E]"
        >
          Sent to Grandma ✓
        </div>
      )}
      {!fixed && (
        <span data-ref="confirm-send" className="sr-only">
          No confirmation
        </span>
      )}
    </>
  );
}

function Search({ fixed, navigate }: { fixed: boolean } & Nav) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  // The flaw (§9.4): every keystroke refetches, so the spinner flickers.
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setLoading(false), fixed ? 250 : 400);
    return () => clearTimeout(timer);
  }, [query, loading, fixed]);

  const results = CONTACTS.filter((c) => query && c.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <span className="text-[18px] font-bold">Search</span>
      <div className="flex items-center gap-2">
        <input
          data-ref="search-input"
          data-label="Search"
          aria-label="Search messages"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLoading(e.target.value.length > 0);
          }}
          placeholder="Search"
          className="h-10 flex-1 rounded-[6px] border border-[#D4D1C9] px-3"
        />
        {loading && (
          <span
            aria-label="Loading"
            role="status"
            className="size-4 animate-spin rounded-full border-2 border-[#D4D1C9] border-t-[#2557D6]"
          />
        )}
      </div>
      {!loading && (
        <ul className="flex flex-col gap-1 text-[13px]">
          {results.map((r) => (
            <li key={r}>
              <button
                type="button"
                data-ref={`search-result-${r.toLowerCase().replace(' ', '-')}`}
                data-label={r}
                onClick={() => navigate('/contacts/grandma')}
                className="underline"
              >
                {r}
              </button>
            </li>
          ))}
          {query && results.length === 0 && (
            <li className="text-[#6B6B66]">{fixed ? `No messages match "${query}".` : ''}</li>
          )}
        </ul>
      )}
    </>
  );
}

function Contacts({ navigate }: Nav) {
  return (
    <>
      <span className="text-[18px] font-bold">Contacts</span>
      <ul data-ref="contacts-list" className="flex flex-col gap-1">
        {CONTACTS.map((c) => (
          <li key={c}>
            <button
              type="button"
              data-ref={`contact-${c.toLowerCase().replace(' ', '-')}`}
              data-label={c}
              onClick={() => navigate('/contacts/grandma')}
              className="w-full rounded-[6px] px-2 py-1.5 text-left hover:bg-[#F6F4EF]"
            >
              {c}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Thread({ deleted, onDelete, navigate }: { deleted: boolean; onDelete: () => void } & Nav) {
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[18px] font-bold">Grandma</span>
        <button
          type="button"
          data-ref="thread-delete"
          data-label="Delete conversation"
          onClick={onDelete}
          className="text-[12px] text-[#B42318] underline"
        >
          Delete conversation
        </button>
      </div>
      <ul className="flex flex-col gap-2 text-[13px]">
        {deleted ? (
          <li className="text-[#6B6B66]">No messages.</li>
        ) : (
          THREAD.map((m, i) => (
            <li
              key={i}
              className={`max-w-[80%] rounded-[10px] px-3 py-2 ${m.from === 'You' ? 'self-end bg-[#E6E9F7]' : 'bg-[#F6F4EF]'}`}
            >
              {m.text}
            </li>
          ))
        )}
      </ul>
      <div className="flex justify-end">
        <SiteButton refId="thread-message" label="Send Text" onClick={() => navigate('/compose')} />
      </div>
    </>
  );
}

function SettingsPage({ fixed }: { fixed: boolean }) {
  const [on, setOn] = useState<Record<string, boolean>>({ Sounds: true, 'Large text': false });
  return (
    <>
      <span className="text-[18px] font-bold">Settings</span>
      <ul data-ref="settings-list" className={`flex flex-col ${fixed ? 'gap-3' : 'gap-1'}`}>
        {Object.entries(on).map(([name, value]) => (
          <li key={name} className="flex items-center justify-between">
            <span>{name}</span>
            <button
              type="button"
              role="switch"
              aria-checked={value}
              aria-label={name}
              data-ref={`settings-${name.toLowerCase().replace(' ', '-')}`}
              data-label={name}
              onClick={() => setOn((s) => ({ ...s, [name]: !value }))}
              className={`h-5 w-9 rounded-full border border-[#8A8780] ${value ? 'bg-[#8A8780]' : 'bg-[#DDD6CB]'}`}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

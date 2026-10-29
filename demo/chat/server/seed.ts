// Seed data for the demo backend. Conversation 12 is Grandma (the gate copy says
// "DELETE /api/conversations/12").

export interface Contact {
  id: number;
  name: string;
  nickname: string | null;
  phone: string;
}

export interface Message {
  from: string;
  text: string;
  at: string;
}

export interface Conversation {
  id: number;
  contactId: number;
  name: string;
  messages: Message[];
}

export interface Db {
  contacts: Contact[];
  conversations: Conversation[];
  archive: { id: number; from: string; text: string; at: string }[];
  nextId: number;
}

const WORDS = ['photos', 'dinner', 'garden', 'Sunday', 'call', 'birthday', 'trip', 'recipe'];

export function seed(): Db {
  const contacts: Contact[] = [
    { id: 1, name: 'Grandma', nickname: null, phone: '555-0101' },
    { id: 2, name: 'Mom', nickname: null, phone: '555-0102' },
    { id: 3, name: 'Uncle Joe', nickname: null, phone: '555-0103' },
    { id: 4, name: 'Priya', nickname: null, phone: '555-0104' },
  ];
  const conversations: Conversation[] = [
    {
      id: 12,
      contactId: 1,
      name: 'Grandma',
      messages: [
        { from: 'Grandma', text: 'Did you get the photos from Sunday?', at: '2026-10-27T14:14:00' },
        { from: 'You', text: 'Yes! The garden looks lovely.', at: '2026-10-27T14:20:00' },
        { from: 'Grandma', text: 'Call me when you can, sweetheart.', at: '2026-10-27T15:02:00' },
      ],
    },
    {
      id: 10,
      contactId: 2,
      name: 'Mom',
      messages: [{ from: 'Mom', text: 'Dinner at 6 on Friday?', at: '2026-10-26T18:05:00' }],
    },
    {
      id: 11,
      contactId: 3,
      name: 'Uncle Joe',
      messages: [{ from: 'Uncle Joe', text: 'Ha! Good one.', at: '2026-10-25T09:41:00' }],
    },
  ];
  const archive = Array.from({ length: 20_000 }, (_, i) => ({
    id: i + 1,
    from: contacts[i % contacts.length]?.name ?? 'Grandma',
    text: `About the ${WORDS[i % WORDS.length]} (${i + 1})`,
    at: new Date(Date.UTC(2026, 9, 27) - i * 3_600_000).toISOString(),
  }));
  return { contacts, conversations, archive, nextId: 100 };
}

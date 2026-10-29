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

export interface SearchItem {
  id: number;
  from: string;
  text: string;
  at: string;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  return (await res.json()) as T;
}

export const api = {
  contacts: () => get<Contact[]>('/api/contacts'),
  conversations: () => get<Conversation[]>('/api/conversations'),
  conversation: (id: number) => get<Conversation>(`/api/conversations/${id}`),
  deleteConversation: (id: number) => fetch(`/api/conversations/${id}`, { method: 'DELETE' }),
  search: (q: string) => get<{ items: SearchItem[] }>(`/api/search?q=${encodeURIComponent(q)}`),
  send: (to: number | undefined, text: string) =>
    fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, text }),
    }),
  addContact: (name: string, phone: string) =>
    fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone }),
    }),
};

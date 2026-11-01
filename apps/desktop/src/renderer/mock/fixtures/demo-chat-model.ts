// What Fitts understands of demo/chat from its code (SPEC-phase4 §3), as the test build's
// stand-in for Pass 2: the understanding card in e2e runs shows this. The real engine builds
// its own from the project; the shape and wording follow the recorded fixture
// tests/fixtures/llm/understand.json.
import type { AppModelSummary } from '@fitts/schema';

export const DEMO_CHAT_MODEL: AppModelSummary = {
  summary:
    'It’s a small family messaging app: an inbox of conversations, a three-step compose flow (pick a contact, write the message, confirm and send), search over past messages, a contacts list with an add form, a thread view with call and video buttons, and a settings page of toggles. It’s a Vite + React single-page app with a hand-rolled path router and a Vite middleware for its API, styled with one plain CSS file. There’s no login, so every page is reachable.',
  commit: 'fixture',
  modeled: true,
  pages: [
    {
      route: '/',
      title: 'Messages',
      file: 'src/pages/Inbox.tsx',
      source: 'code',
      features: [
        {
          id: 'inbox-list',
          name: 'See recent conversations',
          description: 'The inbox lists each conversation with its last message and time.',
        },
        {
          id: 'inbox-nav',
          name: 'Go to Search, Contacts or Settings',
          description: 'Three links in the header.',
        },
        {
          id: 'inbox-compose',
          name: 'Start a new message',
          description: 'The Compose button opens the three-step flow.',
        },
      ],
      forms: 0,
    },
    {
      route: '/compose',
      title: 'New message · who',
      file: 'src/pages/Compose.tsx',
      source: 'code',
      features: [
        { id: 'pick-contact', name: 'Pick who it’s for', description: 'Contact chips, then NEXT.' },
      ],
      forms: 0,
    },
    {
      route: '/compose/recipient',
      title: 'New message · write',
      file: 'src/pages/Compose.tsx',
      source: 'code',
      features: [
        {
          id: 'write-message',
          name: 'Write the message',
          description: 'A message box and a way to the confirm step.',
        },
      ],
      forms: 0,
    },
    {
      route: '/compose/confirm',
      title: 'New message · send',
      file: 'src/pages/Compose.tsx',
      source: 'code',
      features: [
        {
          id: 'send-message',
          name: 'Check and send',
          description: 'Shows the recipient and text, then sends.',
        },
      ],
      forms: 0,
    },
    {
      route: '/contacts',
      title: 'Contacts',
      file: 'src/pages/Contacts.tsx',
      source: 'code',
      features: [
        { id: 'find-contact', name: 'Find a contact', description: 'A filter box over the list.' },
        { id: 'add-contact', name: 'Add a contact', description: 'A name and phone form.' },
      ],
      forms: 1,
    },
    {
      route: '/contacts/grandma',
      title: 'Thread',
      file: 'src/pages/Thread.tsx',
      source: 'code',
      features: [
        {
          id: 'read-thread',
          name: 'Read the conversation',
          description: 'Messages as bubbles with times.',
        },
        {
          id: 'delete-thread',
          name: 'Delete the conversation',
          description: 'A delete link in the header.',
        },
      ],
      forms: 0,
    },
    {
      route: '/search',
      title: 'Search',
      file: 'src/pages/Search.tsx',
      source: 'code',
      features: [
        {
          id: 'search-messages',
          name: 'Search past messages',
          description: 'Results as you type.',
        },
      ],
      forms: 0,
    },
    {
      route: '/settings',
      title: 'Settings',
      file: 'src/pages/Settings.tsx',
      source: 'code',
      features: [
        { id: 'toggles', name: 'Turn settings on and off', description: 'Fourteen switches.' },
      ],
      forms: 0,
    },
  ],
  journeys: [
    {
      id: 'send-message-grandma',
      name: 'Send a message to Grandma',
      goal: 'The inbox shows the new message at the top of Grandma’s conversation',
      start: '/compose',
      steps: ['Tap Grandma', 'Tap NEXT', 'Type a message in Message', 'Tap NEXT', 'Tap Send Text'],
      pages: ['/compose', '/compose/recipient', '/compose/confirm', '/'],
      priority: 1,
      source: 'code',
    },
    {
      id: 'read-thread',
      name: 'Read Grandma’s conversation',
      goal: 'The thread shows the messages with their times',
      start: '/',
      steps: ['Tap Grandma’s conversation', 'Read the messages'],
      pages: ['/', '/contacts/grandma'],
      priority: 1,
      source: 'code',
    },
    {
      id: 'add-contact',
      name: 'Add a new contact',
      goal: 'The new name appears in the contacts list',
      start: '/contacts',
      steps: ['Type a name in Name', 'Type a phone number in Phone', 'Tap Add'],
      pages: ['/contacts'],
      priority: 2,
      source: 'code',
    },
    {
      id: 'search-messages',
      name: 'Find an old message',
      goal: 'The search results list the matching message',
      start: '/search',
      steps: ['Type a word in Search', 'Tap a result'],
      pages: ['/search', '/contacts/grandma'],
      priority: 2,
      source: 'code',
    },
    {
      id: 'change-settings',
      name: 'Turn a setting off',
      goal: 'The switch shows as off',
      start: '/settings',
      steps: ['Tap the Sounds switch'],
      pages: ['/settings'],
      priority: 3,
      source: 'code',
    },
  ],
  notes: [
    'I’m assuming /contacts/grandma stands for every conversation; the router only names that one.',
  ],
};

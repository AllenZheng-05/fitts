// Scenario A data: the findings Fitts reports live, and the full run behind the Done
// screen (31 found = 24 fixed + 2 rolled back + 3 not a problem + 2 suggestions; 9 PRs;
// $13.92). Mock data stands in for what the real engine produces in Phase 2.
import type { Change, Finding, Heuristic, Lens, RunState, Severity } from '@fitts/schema';

const RUN = 'run-7';

const base = {
  runId: RUN,
  status: 'open' as const,
};

/** Findings reported during the run (SPEC §9.5). */
export const LIVE_FINDINGS: Record<
  'nullName' | 'names' | 'confirm' | 'search' | 'target' | 'spacing',
  Finding
> = {
  nullName: {
    ...base,
    id: 'f-null-name',
    severity: 3,
    heuristic: 'H2',
    lens: 'usability',
    title: '"(null)" shown as a name',
    finding:
      'the recipient shows as "(null)" on step 2, so people can\'t tell who they\'re writing to.',
    fix: "Show the contact's name, and their photo when there is one.",
    route: '/compose/recipient',
    agreement: {
      agreeing: 5,
      total: 5,
      who: ['Novice', 'Power user', 'Accessibility', 'Visual design', 'Content'],
    },
    evidence: [
      'The To field reads "To: (null)" after picking Grandma on step 1',
      'All five reviewers flagged it',
    ],
    elementRef: 'compose-to',
    stepIndex: 19,
    atMs: 14000,
    diff: {
      files: ['RecipientStep.tsx:27'],
      lines: [
        { kind: 'del', text: '<span>To: {String(contact?.name)}</span>' },
        { kind: 'add', text: '<span>To: {contact.displayName}</span>' },
      ],
    },
  },
  names: {
    ...base,
    id: 'f-three-names',
    severity: 3,
    heuristic: 'H4',
    lens: 'usability',
    title: 'One action, three names',
    finding:
      'the same send action is called "NEXT", "Send Text" and "Create Message", so people can\'t tell if they\'re moving on or sending.',
    fix: '"Next" on in-between steps, "Send" on the last step, everywhere.',
    route: '/compose',
    agreement: {
      agreeing: 4,
      total: 5,
      who: ['Novice', 'Power user', 'Accessibility', 'Visual design'],
    },
    evidence: [
      'Label check: 3 names for 1 action across 3 screens',
      'Novice, Power user, Accessibility and Visual design reviewers flagged it',
    ],
    elementRef: 'compose-next',
    stepIndex: 24,
    atMs: 18000,
    diff: {
      files: ['ComposeStep.tsx:42', 'Confirm.tsx:18'],
      lines: [
        { kind: 'del', text: '<Button>NEXT</Button>' },
        { kind: 'add', text: '<Button>Next</Button>' },
        { kind: 'del', text: '<a>Create Message</a>' },
        { kind: 'add', text: '<Button variant="primary">Send</Button>' },
      ],
    },
  },
  confirm: {
    ...base,
    id: 'f-no-confirm',
    severity: 4,
    heuristic: 'H1',
    lens: 'usability',
    title: 'No confirmation after sending',
    finding:
      'after Send Text the screen goes back to the inbox with no sign the message went, so people send it again or call to check.',
    fix: 'Show "Sent to Grandma ✓" for a few seconds and keep the message at the top of the thread.',
    route: '/compose/confirm',
    agreement: {
      agreeing: 5,
      total: 5,
      who: ['Novice', 'Power user', 'Accessibility', 'Visual design', 'Content'],
    },
    evidence: [
      'No status change within 3s of sending',
      'Sent the same message twice while testing',
    ],
    elementRef: 'confirm-send',
    stepIndex: 40,
    atMs: 30000,
    diff: {
      files: ['Confirm.tsx:31'],
      lines: [
        { kind: 'del', text: "navigate('/')" },
        { kind: 'add', text: "navigate('/', { state: { sentTo: contact.displayName } })" },
      ],
    },
  },
  search: {
    ...base,
    id: 'f-search-refetch',
    severity: 2,
    lens: 'performance',
    title: 'Search refetches every keystroke',
    finding:
      'each letter typed starts a new search, so results flicker and the spinner never settles.',
    fix: 'Wait 250ms after typing stops, and cancel the previous request.',
    route: '/search',
    agreement: { agreeing: 3, total: 5, who: ['Power user', 'Novice', 'Accessibility'] },
    evidence: ['11 requests while typing "grandma"', 'Spinner shown for 4.2s in total'],
    elementRef: 'search-input',
    stepIndex: 66,
    atMs: 50000,
  },
  target: {
    ...base,
    id: 'f-send-target',
    severity: 1,
    lens: 'accessibility',
    title: 'Send target is 28 × 20 px',
    finding: 'the send link is 28 × 20 px, well under 44 px, so shaky hands miss it.',
    fix: 'Make Send a full-size button, at least 44 × 44 px.',
    route: '/compose',
    agreement: {
      agreeing: 4,
      total: 5,
      who: ['Accessibility', 'Novice', 'Power user', 'Visual design'],
    },
    evidence: ['Measured hit area: 28 × 20 px', 'WCAG 2.5.8 asks for 24 px at minimum'],
    elementRef: 'compose-send',
    stepIndex: 88,
    atMs: 66000,
  },
  spacing: {
    ...base,
    id: 'f-settings-spacing',
    severity: 2,
    lens: 'look-and-feel',
    title: 'Cramped spacing on /settings',
    finding: 'rows on /settings sit 4 px apart, so it reads as one block.',
    fix: 'Space rows 12 px apart.',
    route: '/settings',
    agreement: { agreeing: 3, total: 5, who: ['Visual design', 'Novice', 'Accessibility'] },
    evidence: ['Row gap: 4 px'],
    elementRef: 'settings-list',
    stepIndex: 104,
    atMs: 80000,
  },
};

/** Change titles and PRs for fixes that finish during the run. */
export const LIVE_FIXES = {
  [LIVE_FINDINGS.confirm.id]: { title: "Show 'Sent' confirmation", prNumber: 13, costUsd: 0.62 },
  [LIVE_FINDINGS.names.id]: { title: 'One name per action', prNumber: 12, costUsd: 0.48 },
  [LIVE_FINDINGS.nullName.id]: { title: "Show the recipient's name", prNumber: 14, costUsd: 0.41 },
};

type Row = [Severity, Lens, Heuristic | undefined, string, string, string];

// severity, lens, heuristic, finding title, change title, route
const FIXED_ROWS: Row[] = [
  [
    3,
    'usability',
    'H3',
    'Back button missing on Compose',
    'Add a Back button to each step',
    '/compose',
  ],
  [2, 'usability', 'H9', 'Error message blames the user', 'Rewrite the send error', '/compose'],
  [
    2,
    'accessibility',
    undefined,
    'Contact photos have no alt text',
    'Alt text on contact photos',
    '/contacts',
  ],
  [2, 'accessibility', undefined, 'Low contrast on timestamps', 'Darker timestamps', '/'],
  [2, 'usability', 'H1', 'Search has no empty state', 'Empty state for search', '/search'],
  [2, 'accessibility', undefined, 'Unread badge only uses color', 'Count in the unread badge', '/'],
  [2, 'ergonomics', undefined, 'Tap targets under 44 px in the inbox', 'Bigger inbox rows', '/'],
  [3, 'usability', 'H3', 'Draft lost when going back', 'Keep drafts between steps', '/compose'],
  [
    3,
    'usability',
    'H3',
    'No undo after deleting a message',
    'Undo for deleted messages',
    '/contacts/grandma',
  ],
  [
    2,
    'accessibility',
    undefined,
    'Keyboard focus lost after sending',
    'Return focus after sending',
    '/compose/confirm',
  ],
  [2, 'performance', undefined, 'Inbox loads 2.4 MB of images', 'Smaller inbox images', '/'],
  [1, 'usability', 'H2', 'Jargon in the settings labels', 'Plain settings labels', '/settings'],
  [1, 'usability', 'H4', 'Date formats differ between screens', 'One date format', '/contacts'],
  [
    2,
    'accessibility',
    undefined,
    'Placeholder used as the only label',
    'Visible labels on To',
    '/compose/recipient',
  ],
  [
    2,
    'performance',
    undefined,
    'Contact list jumps while loading',
    'Reserve space while loading',
    '/contacts',
  ],
  [2, 'usability', 'H10', 'Help link goes to a blank page', 'Point Help at the guide', '/settings'],
  [
    1,
    'look-and-feel',
    undefined,
    'Long names cut off without a way to read them',
    'Wrap long names',
    '/contacts',
  ],
  [
    1,
    'look-and-feel',
    undefined,
    'Button corners differ between screens',
    'One corner radius',
    '/',
  ],
  [
    3,
    'usability',
    'H5',
    'Send works with an empty message',
    'Disable Send until there is text',
    '/compose',
  ],
];

const ROLLED_BACK_ROW: Row = [
  2,
  'usability',
  'H1',
  "Settings toggles don't show on or off",
  'Labelled settings toggles',
  '/settings',
];

const DISMISSED_ROWS: Row[] = [
  [1, 'usability', 'H4', 'Logo is not a home link', '', '/'],
  [1, 'ergonomics', undefined, 'Footer links are small', '', '/'],
  [1, 'look-and-feel', undefined, 'No dark mode', '', '/settings'],
];

const SUGGESTION_ROWS: Row[] = [
  [1, 'usability', 'H1', 'A typing indicator could reassure senders', '', '/compose'],
  [2, 'usability', 'H6', 'Group chats might confuse new users', '', '/contacts'],
];

function rowFinding(row: Row, i: number, status: Finding['status']): Finding {
  const [severity, lens, heuristic, title, changeTitle, route] = row;
  return {
    ...base,
    id: `f-${i}`,
    severity,
    ...(heuristic ? { heuristic } : {}),
    lens,
    title,
    finding: `${title.charAt(0).toLowerCase()}${title.slice(1)}.`,
    fix: changeTitle ? `${changeTitle}.` : 'No change suggested.',
    route,
    agreement: { agreeing: 3, total: 5, who: ['Novice', 'Power user', 'Accessibility'] },
    evidence: [`Seen at step ${20 + i * 3}`],
    stepIndex: 20 + i * 3,
    atMs: 20000 + i * 2000,
    status,
  };
}

const PRS = [12, 13, 14, 15, 16, 17, 18, 19, 20];
const FIXES_TOTAL = 6.1;

/** The complete Scenario A run as it stands on the Done screen. */
export function demoChatDoneState(): Pick<RunState, 'findings' | 'changes' | 'cost' | 'routes'> {
  const live = LIVE_FINDINGS;
  const findings: Finding[] = [];
  const changes: Change[] = [];

  const fixed: [Finding, string][] = [
    [live.confirm, LIVE_FIXES[live.confirm.id]?.title ?? ''],
    [live.names, LIVE_FIXES[live.names.id]?.title ?? ''],
    [live.nullName, LIVE_FIXES[live.nullName.id]?.title ?? ''],
    [live.search, 'Debounce search'],
    [live.target, 'Full-size Send button'],
    ...FIXED_ROWS.map((row, i): [Finding, string] => [rowFinding(row, i, 'pr-opened'), row[4]]),
  ];

  fixed.forEach(([finding, title], i) => {
    const known = LIVE_FIXES[finding.id];
    const prNumber = known?.prNumber ?? PRS[i % PRS.length] ?? 12;
    findings.push({ ...finding, status: 'pr-opened', prNumber });
    changes.push({
      id: `change-${finding.id}`,
      findingIds: [finding.id],
      kind: 'fix',
      title,
      severity: finding.severity,
      prNumber,
      costUsd: 0,
      status: 'verified',
      // One merged PR shows the "Revert PR opened" undo (§7.6).
      ...(finding.id === live.names.id ? { merged: true } : {}),
    });
  });

  const rolledBack = [
    {
      finding: live.spacing,
      title: 'Roomier settings rows',
      reason: 'Broke the phone layout on /settings',
    },
    {
      finding: rowFinding(ROLLED_BACK_ROW, FIXED_ROWS.length, 'rolled-back'),
      title: ROLLED_BACK_ROW[4],
      reason: 'Failed the keyboard check',
    },
  ];
  for (const { finding, title, reason } of rolledBack) {
    findings.push({ ...finding, status: 'rolled-back' });
    changes.push({
      id: `change-${finding.id}`,
      findingIds: [finding.id],
      kind: 'fix',
      title,
      severity: finding.severity,
      costUsd: 0,
      status: 'rolled-back',
      reason,
    });
  }

  DISMISSED_ROWS.forEach((row, i) =>
    findings.push(rowFinding(row, FIXED_ROWS.length + 1 + i, 'dismissed')),
  );
  SUGGESTION_ROWS.forEach((row, i) =>
    findings.push(rowFinding(row, FIXED_ROWS.length + 4 + i, 'open')),
  );

  // Spread $6.10 of fix spending across the 26 changes, in whole cents.
  const cents = Math.round(FIXES_TOTAL * 100);
  const each = Math.floor(cents / changes.length);
  changes.forEach((c, i) => {
    c.costUsd = (each + (i < cents - each * changes.length ? 1 : 0)) / 100;
  });

  return {
    findings,
    changes,
    cost: {
      spentUsd: 13.92,
      capUsd: 20,
      byPhase: { fixes: 6.1, reviewers: 3.4, crawling: 2.12, summing: 0.9, media: 1.4 },
    },
    routes: DEMO_ROUTES.map((r) => ({ ...r, status: 'done' as const })),
  };
}

export const DEMO_ROUTES: RunState['routes'] = [
  { path: '/', depth: 0, status: 'queued', issues: 0 },
  { path: '/contacts', depth: 0, status: 'queued', issues: 0 },
  { path: '/contacts/grandma', depth: 1, status: 'queued', issues: 0, label: '/grandma' },
  { path: '/search', depth: 0, status: 'queued', issues: 0 },
  { path: '/compose', depth: 0, status: 'queued', issues: 0 },
  { path: '/compose/recipient', depth: 1, status: 'queued', issues: 0, label: '/recipient' },
  { path: '/compose/confirm', depth: 1, status: 'queued', issues: 0, label: '/confirm' },
  { path: '/settings', depth: 0, status: 'queued', issues: 0 },
];

/** Past runs for the Done screen's run picker (§6.8). */
export const DEMO_PAST_RUNS = [
  { runId: 'run-6', label: 'Run #6 · yesterday', found: 18, fixed: 14, prs: 6, spentUsd: 9.4 },
  { runId: 'run-5', label: 'Run #5 · Oct 21', found: 22, fixed: 15, prs: 7, spentUsd: 11.05 },
];

// What Fitts checks (/checks). Fitts's voice: plain, warm, specific; no exclamation marks.
// The catalog is in catalog.ts; tests/unit/catalog.test.ts holds it to the app's code.
import { links } from './site';

export const checks = {
  title: 'What Fitts checks',
  lead: 'Every finding names the rule it breaks and how Fitts found it: a measurement, reviewers agreeing, or Muse Wonder judging a moment it saw. Here is every check, where it comes from, and how well it works.',

  fittsTitle: 'Who was Paul Fitts?',
  fitts: [
    'Paul Fitts (1912–1965) was an American psychologist and one of the founders of human factors engineering. In 1947 he and Richard Jones went through hundreds of “pilot error” reports from the Air Force and showed that many were really design errors: controls that were easy to confuse, instruments that were easy to misread.',
    'In 1954 he described how long it takes to point at something. Fitts’s law says the time grows with the distance to a target and shrinks as the target gets bigger. It’s why a big button near your cursor is fast to hit and a tiny link in a corner isn’t.',
    'Fitts, the app, is named for him. It measures the same things he did: whether people can see what’s happening, hit what they mean to hit, and recover when something goes wrong.',
  ],
  formula: 'MT = a + b · log₂(D / W + 1)',
  formulaNote:
    'Fitts’s law, in the form used today: the time to reach a target grows with its distance D and shrinks as its width W grows.',

  nielsenTitle: 'Nielsen’s 10 usability heuristics',
  nielsenLead:
    'Jakob Nielsen’s ten heuristics (1994) are the standard checklist for a usability review. Every finding Fitts reports names the heuristic it breaks, and its severity on Nielsen’s 0–4 scale.',
  heuristics: [
    {
      id: 'H1',
      name: 'Visibility of system status',
      how: 'Times every tap: does something visibly change within 0.1 s, does a loading indicator show within 1 s, does saving say it worked. It also slows the site’s own requests by 3 seconds to see whether the page says it’s loading.',
    },
    {
      id: 'H2',
      name: 'Match between system and the real world',
      how: 'Reviewers flag jargon and developer words; probes catch leaked placeholders like “{{name}}”, “(null)” and “undefined”, on the web and on Android.',
    },
    {
      id: 'H3',
      name: 'User control and freedom',
      how: 'Goes back mid-form to see what’s lost, looks for a back or cancel on every step, and presses Back after a redirect to catch pages that send you straight back.',
    },
    {
      id: 'H4',
      name: 'Consistency and standards',
      how: 'Finds one action with different labels, links that go somewhere other than where they say, and counts font families.',
    },
    {
      id: 'H5',
      name: 'Error prevention',
      how: 'Submits forms empty, and reviewers look for actions that can’t be undone and don’t ask first. Fitts itself never does one without you: a real delete or payment is held until you say yes.',
    },
    {
      id: 'H6',
      name: 'Recognition rather than recall',
      how: 'A first-time-user reviewer checks whether you have to remember things the screen should show.',
    },
    {
      id: 'H7',
      name: 'Flexibility and efficiency of use',
      how: 'Measures tap targets (24 px on the web, 48 dp on Android), uses Fitts’s law to score how hard the main action is to reach, and catches searches that send a request on every keystroke.',
    },
    {
      id: 'H8',
      name: 'Aesthetic and minimalist design',
      how: 'A visual-design reviewer and the theme check judge whether the look suits the people it’s for; on Android, the brand check compares the app with its own brand. Spacing off a 4 px grid is measured.',
    },
    {
      id: 'H9',
      name: 'Help users recognize, diagnose and recover from errors',
      how: 'Reads every error message, makes the site’s own requests fail to see whether the page says so, and catches redirect loops, pages that break on refresh, and unknown addresses that show the home page.',
    },
    {
      id: 'H10',
      name: 'Help and documentation',
      how: 'Reviewers look for help where people get stuck, not just a help page, and every link is followed: one to a missing page is a dead end.',
    },
  ],

  catalogTitle: 'Every check',
  catalogLead:
    'Built from Fitts’s own code: each check’s title is the one Fitts uses in its findings, and its WCAG criteria come from the same table its repro steps cite.',
  filterLabel: 'Show checks for',
  all: 'All',
  shown: (n: number, total: number) =>
    n === total ? `Showing all ${total} checks` : `Showing ${n} of ${total} checks`,
  labels: {
    what: 'What it checks',
    how: 'How it’s measured',
    standard: 'Standard',
    evidence: 'Evidence',
    fix: 'After a fix',
  },
  heuristic: 'Nielsen',
  usability: 'A usability check',
  evidence: {
    measured: 'Measured',
    reviewers: 'Reviewers',
    wonder: 'Judged by Muse Wonder',
  },
  fixCheck: {
    probe: 'Verified: measured again',
    recheck: 'Verified: the check runs again',
    replay: 'Verified: the steps are replayed',
    review: 'Checked by review, when you ask for the fix',
    none: 'Reported for you to fix',
  },
  evidenceTitle: 'The evidence rule',
  evidenceBody:
    'A finding is shown when a measurement backs it, or when at least 2 of the 5 reviewers agree on it. Muse Wonder’s judgment of a moment counts as one reviewer, with the moment itself as measured evidence. A reviewer’s claim that nothing backs up becomes a suggestion, not a finding.',

  benchTitle: 'How well it works',
  benchLead:
    'Fitts is tested on apps with problems planted on purpose, scored against an answer key. These are single paid runs, reported as they came out, from Fitts’s progress log.',
  benches: [
    {
      name: 'The chat test app (web)',
      run: 'bench:chat, Nov 2, 2026, 06:55',
      key: links.plantedChat,
      keyLabel: 'demo/chat’s answer key: 33 planted issues',
      stats: [
        { value: '29 of 33', label: 'planted issues found (88% recall)' },
        { value: '29 of 48', label: 'shown findings were planted (60% precision)' },
        { value: '29 of 37', label: 'at severity 2 or more (78%)' },
        { value: '$0.19', label: 'what the run cost' },
      ],
      notes: [
        'Missed: #15 (a validation error clears the whole form), #18 (three date formats), #21 (14 ungrouped toggles) and #33 (Contacts goes blank when its request fails).',
        'Of the 8 unplanted findings at severity 2 or more, two were the Wonder judge repeating probe findings for the same moment (now merged), three came from the screen-size cells, one was a phone tap target on /settings, and two look plausible. The bench allows 2, so this run didn’t pass that line.',
      ],
    },
    {
      name: 'The ordering app (Android)',
      run: 'bench:android, Nov 2, 2026, about 13:00 CST, on the emulator',
      key: links.plantedAndroid,
      keyLabel: 'basil-ember-android’s answer key: 10 planted issues',
      stats: [
        { value: '6 of 10', label: 'planted issues found' },
        { value: '5', label: 'unplanted findings at severity 2 or more, mostly plausible' },
        { value: '$1.07', label: 'what the run cost' },
      ],
      notes: [
        'Found: A1 (the cart button with no label), A2 (a 36 dp Remove), A3 (faint descriptions), A7 (two controls in one place), A9 (the brand check: “Doesn’t match your brand”) and A10 (the menu jumping after load, judged by Muse Wonder from the moment’s frames).',
        'Missed: A4 (no feedback after Add to cart; found in the run before), A5 and A8 (the order status screen needs an order placed, and wasn’t reached), and A6 (one action with three labels).',
      ],
    },
    {
      name: 'Fixes on Android',
      run: 'bench:android with fixes, Nov 2, 2026',
      key: links.plantedAndroid,
      keyLabel: 'basil-ember-android’s answer key',
      stats: [
        { value: '3 of 3', label: 'fixes held up on the device' },
        { value: '12 of 12', label: 'brand colors close to the answer key, same fonts' },
        { value: '$2.65', label: 'what the run cost, audit and fixes' },
      ],
      notes: [
        'The cart button’s label (A1) and the overlapping controls (A7) were verified by measuring again on the fixed app. The brand fix (A9) changes the look, which no probe can measure, so it was checked by review.',
        'The audit in the same run found 6 of 10.',
      ],
    },
  ],
};

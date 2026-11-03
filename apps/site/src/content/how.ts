// How it works (/how-it-works). Fitts's voice: plain, warm, specific; no exclamation marks.
// Model jobs are checked against apps/desktop (agent/llm/router.ts, agent/index.ts, media.ts);
// tests/unit/profiles.test.ts compares the profiles table with the router.
import type { GroupId } from './catalog';
import { links } from './site';

export type StepId = 'understand' | 'explore' | 'notice' | 'prove' | 'fix' | 'decide';

export interface LoopStep {
  id: StepId;
  name: string;
  short: string;
  does: string[];
  models: string[];
  checks: { group: GroupId | null; text: string }[];
}

export const how = {
  title: 'How Fitts works',
  lead: 'Fitts works the way a good UX expert would: it learns what your app is for, uses it like a person, notices what gets in the way, proves each problem, fixes it, and leaves the last word to you. It works on any app or site, whoever or whatever built it.',

  loopTitle: 'The loop',
  loopLead: 'Choose a step to see what Fitts does there, which models do it, and which checks run.',
  loopLabel: 'The steps of a Fitts run',
  panel: { does: 'What Fitts does', models: 'Which models', checks: 'Which checks' },
  loop: [
    {
      id: 'understand',
      name: 'Understand',
      short: 'Reads the code and asks you',
      does: [
        'Reads your code before it clicks anything: the pages from your router, the forms and their rules, the requests each page makes, which pages need a login, your design tokens and breakpoints.',
        'A second pass reads the repo with Muse Code for what the first can’t see, and writes the journeys people take through your app.',
        'Asks you a few questions, one at a time, typed or spoken: what it’s for, who uses it, how it should feel.',
        'Shows you what it understood on one card, and you correct anything it got wrong. Fitts’s notes stay in its own app data, never in your repo.',
      ],
      models: [
        'Muse Spark: the interview and the understanding',
        'Muse Code: the second pass over the repo',
        'Muse Voice Transcribe: a spoken brief',
      ],
      checks: [
        {
          group: null,
          text: 'None yet. This is where Fitts learns which pages, journeys and screen sizes to check.',
        },
      ],
    },
    {
      id: 'explore',
      name: 'Explore',
      short: 'Uses it like a person',
      does: [
        'Walks each journey from start to goal, then every page the code says exists, including the ones no link reaches.',
        'Tries every main control, fills forms, presses Back, reloads pages, and tries an address that can’t exist.',
        'Checks every page at every screen size the site’s CSS cares about: 320 px, phones both ways, both sides of each breakpoint, desktops, 200% text and wider text spacing.',
        'Makes the site’s own requests fail, come back empty and run slow, to see what each page says.',
      ],
      models: ['Muse Spark: choosing what to check next, and following journeys'],
      checks: [
        { group: 'keyboard', text: 'Keyboard' },
        { group: 'navigation', text: 'Navigation' },
        { group: 'states', text: 'States' },
        { group: 'screens', text: 'Screen sizes' },
        { group: 'speed', text: 'Speed' },
      ],
    },
    {
      id: 'notice',
      name: 'Notice',
      short: 'Times and watches everything',
      does: [
        'Times every action: the first visible change, the loading indicator, what it said.',
        'Shows what it noticed as lines under each action in the chat. Each line is a template over a measurement; no model narrates.',
        'Watches for what changes when nobody touched anything. A moment that pops up, jumps or scrolls by itself goes to Muse Wonder with its frames, and SAM 3.1 outlines what moved.',
      ],
      models: ['Muse Wonder: judging moments from their frames', 'SAM 3.1: outlining the element'],
      checks: [
        { group: 'surprises', text: 'Surprises' },
        { group: 'usability', text: 'Feedback and flow' },
        { group: 'accessibility', text: 'Accessibility' },
      ],
    },
    {
      id: 'prove',
      name: 'Prove',
      short: 'Shows each problem is real',
      does: [
        'Five reviewers look at every page state with the measurements. A finding is shown only when a measurement backs it, or 2 of 5 agree.',
        'Rates each one on Nielsen’s 0–4 severity scale and names the heuristic or WCAG criterion it breaks.',
        'Writes steps anyone can follow, then trims them (ddmin) and replays them in a hidden window to confirm the problem happens again. On the web, each comes with a Playwright test; on Android, a Maestro flow.',
      ],
      models: [
        'Muse Spark: the reviewers (Economy)',
        'Muse Wonder: two of the reviewers and merging the findings (Quality)',
        'Muse Spark Open: an independent reviewer, or all five (Open)',
        'SAM 3.1: outlining the element in each finding’s screenshot',
      ],
      checks: [{ group: null, text: 'Every check’s evidence comes together here.' }],
    },
    {
      id: 'fix',
      name: 'Fix',
      short: 'Changes the code, then checks it',
      does: [
        'Muse Code makes each fix in a separate copy of your code (a git worktree), only in the files the fix is allowed to touch.',
        'Fitts runs your site from that copy and checks the exact problem again: measured, re-run or replayed means Verified. A change no probe can measure is Checked by review.',
        'Anything a fix broke is rolled back. Each kept fix goes on the run’s one branch.',
      ],
      models: [
        'Muse Code: the fixes',
        'Muse Wonder: the review check on fixes that can’t be measured',
        'Muse Spark or Muse Wonder: fixing in Fitts itself when Muse Code isn’t there',
      ],
      checks: [
        {
          group: null,
          text: 'The same check that found the problem, run again on the fixed copy.',
        },
      ],
    },
    {
      id: 'decide',
      name: 'You decide',
      short: 'Only you end the run',
      does: [
        'When Fitts thinks it’s done, it says so and shows what it covered and what it didn’t: pages reached, journeys done, screen sizes run, and what was out of reach and why.',
        'You choose Finish, Fix the rest, or Keep going. Nothing ends the run without you.',
        'On Finish, the pull request opens, and the App Map shows every page with what Fitts checked, found and fixed there.',
        'What you dismissed and the rules you gave it are remembered for this project.',
      ],
      models: ['Muse Spark: the conversation'],
      checks: [{ group: null, text: 'Nothing new: this step is yours.' }],
    },
  ] satisfies LoopStep[],

  modelsTitle: 'The models, and their jobs',
  modelsLead: 'Every model Fitts uses is Meta’s. Each has a job it’s good at.',
  models: [
    {
      name: 'Muse Spark',
      verb: 'thinks',
      job: 'The interview, understanding your app, choosing what to check next, following journeys, the reviewers, and the conversation with you.',
    },
    {
      name: 'Muse Wonder',
      verb: 'judges',
      job: 'Moments that pop up, jump or scroll by themselves, from their frames; the review check on fixes that can’t be measured. In the Quality profile: two of the five reviewers, merging the findings, the theme check, and the redesign.',
    },
    {
      name: 'SAM 3.1',
      verb: 'points',
      job: 'Outlines the element a finding is about, in its screenshot and in the frames of a moment.',
    },
    {
      name: 'Muse Code',
      verb: 'fixes',
      job: 'Makes each fix inside the file allowlist, in a separate copy of your code. It also reads the repo for Understand’s second pass.',
    },
    {
      name: 'Muse Image',
      verb: 'draws',
      job: 'The hero illustration on each redesign direction’s style board, in that direction’s colors.',
    },
    {
      name: 'Muse Voice Transcribe',
      verb: 'listens',
      job: 'Spoken briefs, and everything you say to Fitts while it works.',
    },
    {
      name: 'Muse Spark Open',
      verb: 'double-checks',
      job: 'On Baseten, with your own key: an independent reviewer in Quality, and the whole review in the Open profile.',
    },
  ],
  voiceNote: 'Fitts’s spoken voice is ElevenLabs.',

  profilesTitle: 'Three profiles',
  profilesLead:
    'You choose how Fitts spends: Economy for the lowest cost, Quality for the strongest judgment, Open to review with Muse Spark Open.',
  profilesCaption: 'Which model does what in each profile',
  profilesJob: 'Job',
  profiles: { economy: 'Economy', quality: 'Quality', open: 'Open' },
  profilesNote:
    'Open needs a Baseten key; without one, its Spark Open jobs run on Muse Spark. With a Baseten key, one of Quality’s Spark reviewers runs on Muse Spark Open.',

  talkTitle: 'Talk to it while it works',
  talkBody:
    'Ask why it flagged something, point at a part of your site, or tell it to stop. Say “Fitts” first and it listens; interrupt it mid-sentence and it stops talking.',
  talkExamples: [
    '“Fitts, why is that a problem?”',
    '“Fitts, skip the settings page.”',
    '“Fitts, stop.”',
  ],

  railsTitle: 'The safety rails',
  railsLead:
    'The rules that keep you in charge are written into Fitts’s code, not left to a prompt, and tested by trying to break them.',
  rails: [
    {
      name: 'The evidence rule',
      body: 'A finding needs a measurement, or 2 of the 5 reviewers agreeing. Anything less is a suggestion.',
    },
    {
      name: 'Severity you can compare',
      body: 'Every finding is rated on Nielsen’s 0–4 scale, from cosmetic to catastrophic.',
    },
    {
      name: 'The gate',
      body: 'Fitts tries every control, but a real delete or payment waits for you. On the web it’s held at the network; on Android, the tap itself is held.',
    },
    {
      name: 'Modes',
      body: 'Plan only never clicks. Ask every action asks before each tap. Autonomous just goes.',
    },
    {
      name: 'Stop and Take the wheel',
      body: 'Ctrl+. (⌘. on a Mac) stops it mid-action. Take the wheel to drive your site yourself; Fitts watches and picks up after.',
    },
    {
      name: 'The file allowlist',
      body: 'A fix may change the files the finding comes from and their styles. Anything else needs a reason, and lockfiles, env files, CI, auth, API handlers and package.json always ask you first.',
    },
    {
      name: 'Checked in a separate copy',
      body: 'Every fix is made and checked in its own git worktree, against your own dev server. “Verified” means the problem was measured again and gone, and your own tests still pass; “Checked by review” means a reviewer looked.',
    },
    {
      name: 'The pause',
      body: 'If Meta’s models can’t be reached, the run pauses at once and waits. When they answer, it picks up exactly where it left off. Nothing is skipped or guessed.',
    },
    {
      name: 'You decide when it’s done',
      body: 'Fitts proposes; only you finish. Dismiss a finding with a reason and it remembers, for this project.',
    },
    {
      name: 'A spending cap',
      body: 'It warns you at 80% and pauses at 100%, and shows what every model call cost.',
    },
    {
      name: 'Undo',
      body: 'Undo closes the pull request, or opens a revert if it was merged.',
    },
  ],

  devicesTitle: 'See it on every screen',
  devicesBody:
    'Watch your site as an iPhone, an Android phone, a tablet, a laptop or a desktop, with real mobile emulation: touch, a phone’s user agent and its screen size. Fitts checks every page at every size its CSS cares about, and tells you what only goes wrong on one.',

  androidTitle: 'Android',
  androidBody: [
    'Fitts drives your Expo app on the Android emulator over adb, as a development build.',
    'It reads the same accessibility tree TalkBack does, so it hears your app the way a screen reader user would, and measures contrast from the screen’s own pixels.',
    'It catches jumps and pop-ups from one dump to the next and from screencaps, and Muse Wonder judges each moment.',
    'Fixes are checked on the device: the fixed copy gets its own Metro, the app reopens on it, and the same checks run again on the fixed screen. Then the emulator goes back to your live app, and the fixed version shows beside it as a web build at phone width, marked as an imitation.',
  ],

  redesignTitle: 'Redesigns',
  redesignLead:
    'When the look works against the people it’s for, or when you ask, Fitts can restyle the whole site. Your ideas come first.',
  redesignFlow: [
    { name: 'Your vision', body: 'How it should feel, in your words.' },
    { name: 'What to keep', body: 'Your colors, your fonts, the parts people know.' },
    { name: 'Sites you admire', body: 'Links to sites whose look you like.' },
    {
      name: 'Three directions',
      body: 'Composed from the design library around what you said, each on a style board of real components.',
    },
    { name: 'Rounds', body: 'Say what you’d change; three new boards keep the rest.' },
    {
      name: 'Every page, verified',
      body: 'The one you pick is applied to every page and has to pass the same checks as every fix.',
    },
  ],
  whenTitle: 'When does a site need a redesign?',
  when: 'When the look works against the people it’s for: a funeral home in party colors, a bank that looks like a toy, a portfolio a recruiter can’t read. Or simply when you ask for one in the interview. Either way you pick from three directions, and the redesign has to pass the same checks as every fix.',
  libraryTitle: 'A design library, not a template',
  library:
    'Directions aren’t made up on the spot, and they aren’t templates. Fitts composes each one from a library of design parts, then bends it to what you asked for: your colors and fonts, the sites you admire, the things you don’t want. Every palette is contrast-checked, fonts are downloaded and served by your own site, and 3D scenes come with a still fallback.',
  libraryKinds: {
    color: 'color schemes',
    type: 'font pairings',
    shape: 'shape languages',
    layout: 'layouts',
    decor: 'decorations, 3D included',
    motion: 'motion styles',
    density: 'densities',
  },
  librarySwatches: 'Every color scheme in the library, in its own hues:',

  prTitle: 'What a Fitts pull request looks like',
  prLead: 'One run, one branch, one pull request, written so a reviewer can check every change.',
  prCallouts: [
    { name: 'A table per page', body: 'Every page Fitts changed, and what it changed there.' },
    {
      name: 'Steps to see it',
      body: 'Each finding’s repro steps, expected and actual, and its standard.',
    },
    {
      name: 'The verification footer',
      body: 'How each fix was checked, on which copy of the code.',
    },
    {
      name: 'Verified or Checked by review',
      body: 'Measured again, or looked at by a reviewer. Never blurred together.',
    },
  ],

  nextTitle: 'What’s next',
  nextBody:
    'Fitts is a week old. Next: iOS apps; Windows and macOS desktop apps; cloud devices; a VS Code extension; an MCP server so other agents can ask Fitts; and Fitts in CI, on every pull request.',
  nextLink: 'The roadmap on GitHub',
  roadmap: links.roadmap,
};

/** Display names for the router's model ids (agent/llm/router.ts). */
export const MODEL_NAMES: Record<string, string> = {
  'muse-spark-1.3': 'Muse Spark',
  'muse-wonder-1.0': 'Muse Wonder',
  'meta-models/muse-spark-open-1026': 'Muse Spark Open',
};

export interface ProfileRow {
  /** The router's job (`modelFor`), or 'reviewers' (`reviewerRoster`); absent: the same in every profile. */
  job?:
    'interview' | 'understand' | 'chat' | 'crawl' | 'aggregate' | 'themefit' | 'fix' | 'reviewers';
  label: string;
  economy: string;
  quality: string;
  open: string;
}

/** Which model does what, by profile, with a Baseten key (router.ts; profiles.test.ts compares). */
export const PROFILE_ROWS: ProfileRow[] = [
  {
    job: 'interview',
    label: 'The interview',
    economy: 'Muse Spark',
    quality: 'Muse Spark',
    open: 'Muse Spark',
  },
  {
    job: 'understand',
    label: 'Understanding your app',
    economy: 'Muse Spark',
    quality: 'Muse Spark',
    open: 'Muse Spark',
  },
  {
    job: 'crawl',
    label: 'Choosing what to check next',
    economy: 'Muse Spark',
    quality: 'Muse Spark',
    open: 'Muse Spark',
  },
  {
    job: 'chat',
    label: 'Talking with you',
    economy: 'Muse Spark',
    quality: 'Muse Spark',
    open: 'Muse Spark',
  },
  {
    job: 'reviewers',
    label: 'The five reviewers',
    economy: '5 Muse Spark',
    quality: '1 Muse Spark Open, 2 Muse Spark, 2 Muse Wonder',
    open: '5 Muse Spark Open',
  },
  {
    job: 'aggregate',
    label: 'Merging the findings',
    economy: 'Muse Spark',
    quality: 'Muse Wonder',
    open: 'Muse Spark Open',
  },
  {
    job: 'themefit',
    label: 'The theme check and redesign directions',
    economy: 'Muse Spark',
    quality: 'Muse Wonder',
    open: 'Muse Spark Open',
  },
  {
    job: 'fix',
    label: 'The redesign, and fixes when Muse Code isn’t there',
    economy: 'Muse Spark',
    quality: 'Muse Wonder',
    open: 'Muse Spark',
  },
  {
    label: 'Fixes and the second pass over the repo',
    economy: 'Muse Code',
    quality: 'Muse Code',
    open: 'Muse Code',
  },
  {
    label: 'Judging moments, and the review check',
    economy: 'Muse Wonder',
    quality: 'Muse Wonder',
    open: 'Muse Wonder',
  },
  {
    label: 'Outlining elements',
    economy: 'SAM 3.1',
    quality: 'SAM 3.1',
    open: 'SAM 3.1',
  },
];

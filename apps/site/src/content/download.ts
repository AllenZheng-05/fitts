// Download (/download). Fitts's voice: plain, warm, specific; no exclamation marks.
// Cost numbers come from docs/PROGRESS.md's paid bench runs (Nov 2, 2026); see SITE-DECISIONS.

export const download = {
  title: 'Download Fitts',
  lead: 'Fitts is a desktop app for Windows, macOS and Linux. It’s free, open source and in beta. The builds aren’t signed yet, so your computer will ask before opening it the first time.',
  buildsTitle: 'Builds',
  get: 'Download',
  releaseNotes: 'Release notes and every past build',

  requirementsTitle: 'What you need',
  requirements: [
    {
      name: 'Node.js and git',
      body: 'For local projects: Fitts starts your dev server and makes its changes on a git branch.',
    },
    {
      name: 'The GitHub CLI',
      body: 'For pull requests. Sign in once with gh auth login.',
    },
    {
      name: 'A Meta Model API key',
      body: 'Fitts’s models are Meta’s. You paste the key on the first screen.',
    },
    {
      name: 'A Baseten key, if you like',
      body: 'Optional. It adds Muse Spark Open as an independent reviewer, and runs the Open profile.',
    },
    {
      name: 'For Android apps',
      body: 'The Android SDK and an emulator. Fitts drives the emulator over adb.',
    },
  ],

  startTitle: 'Getting started',
  steps: [
    'Download Fitts and open it.',
    'Paste your Meta Model API key.',
    'Choose your project’s folder, or the address of a live site you own. For a local project, Fitts starts its dev server and reads the code.',
    'Answer a few questions, typed or spoken. Check what Fitts understood about your app, and correct anything it got wrong.',
    'Start the audit. Watch, talk to it, or take the wheel whenever you like.',
    'When Fitts thinks it’s done, it tells you what it covered and what it didn’t. You choose Finish, and the pull request opens.',
  ],

  worksTitle: 'Works with',
  works: [
    {
      name: 'Web projects with a dev server',
      body: 'Vite, Next.js, Astro and similar. The whole loop: audit, fix, verify and a pull request.',
    },
    {
      name: 'Expo Android apps',
      body: 'As a development build on the emulator. Audit and fixes, checked on the device.',
    },
    {
      name: 'Live sites you own',
      body: 'Audit only. There’s no code to change, so Fitts reports what it finds.',
    },
  ],

  limitsTitle: 'Known limits',
  limits: [
    'The builds aren’t signed yet, so Windows and macOS warn before the first launch.',
    'macOS hasn’t been tested on a real Mac yet.',
    'Speed is measured on your dev server and labeled “dev build”. Measuring the production build is on the roadmap.',
    'On Android, a finding’s steps are what Fitts saw happen. They aren’t replayed to confirm them, as they are on the web.',
    'No saved test logins yet. Pages behind a login need you to sign in, or Take the wheel.',
  ],

  privacyTitle: 'Privacy',
  privacy: [
    {
      name: 'What leaves your computer',
      body: 'Screenshots, page text, the accessibility tree and Fitts’s measurements go to Meta’s models to review your app. To understand and fix the code, Muse Code and Fitts’s fixer read files from a separate copy of your project, so the parts they read go to Meta too. With a Baseten key, reviews also go to Muse Spark Open on Baseten.',
    },
    {
      name: 'Your voice',
      body: 'When you talk to Fitts, your audio goes to Muse Voice Transcribe. Fitts’s spoken replies are made by ElevenLabs from the reply’s text.',
    },
    {
      name: 'Your keys',
      body: 'Keys are stored on your computer, encrypted with your operating system’s keychain. The Meta key reaches Muse Code on stdin when it starts, never on a command line, and Muse Code doesn’t keep it.',
    },
    {
      name: 'What stays',
      body: 'Fitts’s own notes about your project (what it understood, what you told it to remember) stay in Fitts’s app data, never in your repo. Its changes reach your repo as a branch and a pull request. There are no analytics.',
    },
  ],

  faqTitle: 'Questions',
  faq: [
    {
      q: 'What leaves my computer?',
      a: 'Screenshots, page details and the parts of your code Fitts reads or changes go to Meta’s models. Your audio goes to Muse Voice Transcribe when you speak, and ElevenLabs speaks Fitts’s replies. Keys stay on your computer, encrypted. The Privacy section above has the details.',
    },
    {
      q: 'What does a run cost?',
      a: 'It depends on the size of the app and the profile. On our test chat app, a full audit on the Economy profile cost between $0.08 and $0.19 across three runs. An Android audit of our test ordering app cost about $1. Fixes cost more: each Muse Code pass was about $0.40 to $1.10. You set a spending cap: Fitts warns you at 80%, pauses at 100%, and shows what every model call cost as it goes.',
    },
    {
      q: 'What kinds of projects does it work on?',
      a: 'Web projects with a dev server (Vite, Next.js, Astro and the like) get the full loop: audit, fix, verify and a pull request. Expo Android apps run as a development build on the emulator. Live sites you own can be audited without changes. Any app or site, whoever or whatever built it.',
    },
    {
      q: 'Will it click Delete on my site?',
      a: 'It tries every control, but anything it can’t undo waits for you. On the web, a real delete or payment is held at the network until you answer. On Android, the tap itself is held. Plan only mode never clicks at all.',
    },
    {
      q: 'Can it change my site’s whole look?',
      a: 'Yes, if the look doesn’t fit or you ask for a new one. Your ideas come first: your vision, what to keep, sites you admire. Fitts builds three directions around them from its design library, shows each with a mockup, applies the one you pick to every page, and checks them all. Nothing changes until you choose.',
    },
  ],
} as const;

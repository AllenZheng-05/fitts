// Every word on the site. Fitts's voice: plain, warm, specific; no exclamation marks.

const RELEASES = 'https://github.com/AllenZheng-05/fitts/releases';
const LATEST = `${RELEASES}/latest/download`;

export const links = {
  github: 'https://github.com/AllenZheng-05/fitts',
  releases: RELEASES,
  portfolio: 'https://allenzheng.com',
  /** The 2-3 minute demo. Empty until it's published: the section shows screenshots instead. */
  video: '',
};

export const downloads = [
  {
    os: 'windows',
    name: 'Windows',
    file: 'Fitts-Setup.exe',
    href: `${LATEST}/Fitts-Setup.exe`,
    note: 'Windows 10 and 11, 64-bit',
    install:
      'The installer isn’t signed yet, so SmartScreen says “Windows protected your PC”. Choose More info, then Run anyway.',
  },
  {
    os: 'mac',
    name: 'macOS (Apple silicon)',
    file: 'Fitts-arm64.dmg',
    href: `${LATEST}/Fitts-arm64.dmg`,
    note: 'M1 and newer',
    install:
      'Drag Fitts to Applications and open it once. macOS will block it: go to System Settings › Privacy & Security and choose Open Anyway.',
  },
  {
    os: 'mac-intel',
    name: 'macOS (Intel)',
    file: 'Fitts-x64.dmg',
    href: `${LATEST}/Fitts-x64.dmg`,
    note: 'Intel Macs',
    install: 'Same as Apple silicon: open it once, then Open Anyway in Privacy & Security.',
  },
  {
    os: 'linux',
    name: 'Linux',
    file: 'Fitts.AppImage',
    href: `${LATEST}/Fitts.AppImage`,
    note: 'AppImage, x64',
    install: 'Make it executable (chmod +x Fitts.AppImage), then run it.',
  },
] as const;

export type Os = (typeof downloads)[number]['os'];

export const hero = {
  eyebrow: 'A usability agent for your website',
  title: 'Fitts uses your site like a person would, then fixes what gets in the way.',
  lead: 'It clicks through every page, finds the problems people would hit, fixes the code, checks each fix on your own dev server and opens a pull request. You can talk to it the whole time.',
  download: 'Download for {os}',
  otherPlatforms: 'Other platforms',
  watch: 'See how it works',
  meta: 'Free · open source · beta · Windows, macOS, Linux',
};

export const beforeAfter = {
  title: 'It redesigned my own portfolio',
  lead: 'I rebuilt allenzheng.com the way I’d have made it in 2007, five fonts and all, and pointed Fitts at it. It found 9 problems, said the look “reads as chaotic” for recruiters, and restyled the site as “Quiet Confidence”. The new look fixed all 9, every page passed its checks, and my own test suite still passed, so it opened one pull request.',
  before: 'BEFORE',
  after: 'AFTER',
  caption: 'Drag the handle, or use the arrow keys, to compare.',
  sliderLabel: 'Before and after',
  pending:
    'The “after” is coming: it’s the real output of a Fitts run, not a mockup, so it goes up once that run has its pull request.',
};

export const steps = {
  title: 'How it works',
  items: [
    {
      n: '01',
      title: 'It interviews you',
      body: 'One question at a time: what the site is for, who uses it, how it should feel, and whether you want a new look. You can click around your site while you answer.',
    },
    {
      n: '02',
      title: 'It uses your site',
      body: 'It opens your dev server and tries every page and every main control, like a careful first-time user. Then it does it all again on a phone.',
    },
    {
      n: '03',
      title: 'It finds the problems',
      body: 'Deterministic probes measure what can be measured. Five reviewer personas look at every page. A problem is only shown when the evidence holds up.',
    },
    {
      n: '04',
      title: 'It fixes and checks',
      body: 'Each fix gets its own git branch. Fitts runs your site from that branch, re-checks the exact problem and looks for anything new it broke. Only then does the pull request open.',
    },
    {
      n: '05',
      title: 'It can redesign it',
      body: 'When the look doesn’t suit the people it’s for, or you ask for a new one, Fitts offers three directions, restyles every page in the one you pick and verifies them all.',
    },
  ],
};

export const science = {
  title: 'What Fitts looks for',
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
    'Jakob Nielsen’s ten heuristics (1994) are the standard checklist for a usability review. Every finding Fitts reports names the heuristic it breaks and how it found it.',
  heuristics: [
    {
      id: 'H1',
      name: 'Visibility of system status',
      how: 'Times every tap: does something visibly change within 0.1s, does a loading indicator show within 1s, does saving say it worked.',
    },
    {
      id: 'H2',
      name: 'Match between system and the real world',
      how: 'Reviewers flag jargon and developer words; probes catch leaked placeholders like “{{name}}” and “(null)”.',
    },
    {
      id: 'H3',
      name: 'User control and freedom',
      how: 'Goes back mid-form to see what’s lost, and looks for undo and a way out of every flow.',
    },
    {
      id: 'H4',
      name: 'Consistency and standards',
      how: 'Finds one action with different labels across pages, and counts fonts, sizes and spacing values.',
    },
    {
      id: 'H5',
      name: 'Error prevention',
      how: 'Submits forms empty, and holds any delete or payment at the network until you say yes.',
    },
    {
      id: 'H6',
      name: 'Recognition rather than recall',
      how: 'A first-time-user persona checks whether you have to remember things the screen should show.',
    },
    {
      id: 'H7',
      name: 'Flexibility and efficiency of use',
      how: 'Measures tap target sizes, and uses Fitts’s law to score how hard the main action is to reach.',
    },
    {
      id: 'H8',
      name: 'Aesthetic and minimalist design',
      how: 'A visual-design reviewer and theme-fit judge whether the look suits the people the site is for.',
    },
    {
      id: 'H9',
      name: 'Help users recognize, diagnose and recover from errors',
      how: 'Reads every error message: does it say what went wrong, and mark the field to fix.',
    },
    {
      id: 'H10',
      name: 'Help and documentation',
      how: 'Reviewers look for help where people get stuck, not just a help page.',
    },
  ],
  lensesTitle: 'And four more lenses',
  lenses: [
    {
      name: 'Accessibility',
      body: 'Contrast, names on icon buttons and links, visible keyboard focus, with axe-core underneath.',
    },
    {
      name: 'Performance',
      body: 'Web vitals, a request per keystroke, repeats that aren’t cached, and responses far too large.',
    },
    {
      name: 'Every screen',
      body: 'Sideways scrolling and cut-off text at 360, 768 and 1280px, then a full pass as a phone.',
    },
    {
      name: 'Look and feel',
      body: 'Whether the colors, type and decoration support how the site should feel.',
    },
  ],
  evidenceTitle: 'Only what the evidence supports',
  evidence:
    'Five reviewer personas (a first-time user, a power user, an accessibility specialist, a trust reviewer and a visual designer) look at each page, and probes measure. Severity uses Nielsen’s 0–4 scale. A reviewer’s claim that nothing measured backs up becomes a suggestion, not a finding.',
  redesignTitle: 'When does a site need a redesign?',
  redesign:
    'When the look works against the people it’s for: a funeral home in party colors, a bank that looks like a toy, a portfolio a recruiter can’t read. Or simply when you ask for one in the interview. Either way you pick from three directions, and the redesign has to pass the same checks as every fix.',
};

export const control = {
  title: 'You stay in control',
  items: [
    { name: 'Stop', body: 'Ctrl+. (⌘. on a Mac) stops it mid-action, any time.' },
    { name: 'Take the wheel', body: 'Drive your site yourself; Fitts watches and picks up after.' },
    {
      name: 'The gate',
      body: 'A real delete or payment is held at the network until you say yes.',
    },
    {
      name: 'Modes',
      body: 'Plan only never clicks. Ask every action asks before each tap. Autonomous just goes.',
    },
    { name: 'Undo', body: 'Undo closes the pull request, or opens a revert if it was merged.' },
    { name: 'A spending cap', body: 'It warns you at 80% and pauses at 100%.' },
  ],
};

export const talk = {
  title: 'Talk to it while it works',
  body: 'Ask why it flagged something, point at a part of your site, or tell it to stop. Say “Fitts” first and it listens; interrupt it mid-sentence and it stops talking.',
  examples: [
    '“Fitts, why is that a problem?”',
    '“Fitts, skip the settings page.”',
    '“Fitts, stop.”',
  ],
};

export const devices = {
  title: 'See it on every screen',
  body: 'Watch your site as an iPhone, an Android phone, a tablet, a laptop or a desktop, with real mobile emulation. Fitts checks every page on a phone too, and tells you what only goes wrong there.',
  list: [
    'Desktop · 1440×900',
    'Laptop · 1280×800',
    'Tablet · 820×1180',
    'iPhone · 390×844',
    'Android · 360×800',
  ],
};

export const demo = {
  title: 'Watch a run',
  noVideo:
    'The full demo video goes up with the hackathon submission. Until then, Fitts comes with a recorded run you can watch inside the app, no key needed: choose “Watch a recorded run” on the first screen.',
};

export const start = {
  title: 'Get started',
  needs:
    'You’ll need Node.js and git for local projects, and the GitHub CLI (gh auth login) to open pull requests.',
  steps: [
    'Download Fitts and open it.',
    'Paste a Meta Model API key. (No key? “Watch a recorded run” works without one.)',
    'Choose your project’s folder. Fitts starts its dev server for you.',
    'Answer a few questions, then start the audit.',
  ],
  all: 'All downloads and release notes',
};

export const faq = {
  title: 'Questions',
  items: [
    {
      q: 'What leaves my computer?',
      a: 'Screenshots and page details go to the model API to review your site. Your code stays on your machine, except the changes Fitts opens as pull requests on your own repo.',
    },
    {
      q: 'What does a run cost?',
      a: 'It depends on the size of the site. You set a cap; Fitts shows every model call’s cost as it goes and pauses at the cap.',
    },
    {
      q: 'What kinds of projects does it work on?',
      a: 'Local web projects with a dev server (Vite, Next.js, Astro and the like) for the full audit-and-fix loop. Live sites you own can be audited without changes.',
    },
    {
      q: 'Will it click Delete on my site?',
      a: 'It tries every control, but a real delete or payment is held at the network until you answer. Plan only mode never clicks at all.',
    },
    {
      q: 'Can it change my site’s whole look?',
      a: 'Yes, if the look doesn’t fit or you ask for a new one. It shows three directions with mockups, applies the one you pick to every page, and checks them all.',
    },
  ],
};

export const footer = {
  made: 'Made by Allen Zheng for the Meta Global AI Developer Hackathon 2026.',
  built: 'Built with Muse Spark, Muse Image and SAM.',
  portfolio: 'allenzheng.com',
  github: 'GitHub',
};

export const nav = {
  how: 'How it works',
  science: 'What it looks for',
  demo: 'Demo',
  download: 'Download',
  github: 'GitHub',
  skip: 'Skip to content',
};

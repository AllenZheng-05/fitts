// Words used on every page, and the switches that change them everywhere at once.
// Fitts's voice: plain, warm, specific; no exclamation marks.

const REPO = 'https://github.com/AllenZheng-05/fitts';
const RELEASES = `${REPO}/releases`;
const LATEST = `${RELEASES}/latest/download`;

export const SITE_URL = 'https://fitts.allenzheng.com';

export const links = {
  github: REPO,
  releases: RELEASES,
  issues: `${REPO}/issues`,
  license: `${REPO}/blob/main/LICENSE`,
  roadmap: `${REPO}/blob/main/docs/ROADMAP.md`,
  plantedChat: `${REPO}/blob/main/demo/chat/PLANTED.md`,
  plantedAndroid: `${REPO}/blob/main/demo/basil-ember-android/PLANTED.md`,
  portfolio: 'https://allenzheng.com',
  /** The demo video's embed URL. Empty until it's published: Home shows a poster card instead. */
  video: '',
};

/** Content switches (SPEC-site §5). */
export const flags = {
  /** Allen confirms Fitts on a real Mac → true, and the "not yet tested" notes go. */
  macTested: false,
  /** false hides Linux on every page, if the AppImage doesn't make the release. */
  linux: true,
};

export type Platform = 'windows' | 'mac' | 'linux';

export interface Build {
  id: string;
  platform: Platform;
  name: string;
  file: string;
  href: string;
  note: string;
  install: string;
}

const ALL_BUILDS: Build[] = [
  {
    id: 'windows',
    platform: 'windows',
    name: 'Windows',
    file: 'Fitts-Setup.exe',
    href: `${LATEST}/Fitts-Setup.exe`,
    note: 'Windows 10 and 11, 64-bit',
    install:
      'The installer isn’t signed yet, so SmartScreen says “Windows protected your PC”. Choose More info, then Run anyway.',
  },
  {
    id: 'mac',
    platform: 'mac',
    name: 'macOS (Apple silicon)',
    file: 'Fitts-arm64.dmg',
    href: `${LATEST}/Fitts-arm64.dmg`,
    note: 'M1 and newer',
    install:
      'Drag Fitts to Applications and open it once. macOS will block it: go to System Settings › Privacy & Security and choose Open Anyway.',
  },
  {
    id: 'mac-intel',
    platform: 'mac',
    name: 'macOS (Intel)',
    file: 'Fitts-x64.dmg',
    href: `${LATEST}/Fitts-x64.dmg`,
    note: 'Intel Macs',
    install: 'Same as Apple silicon: open it once, then Open Anyway in Privacy & Security.',
  },
  {
    id: 'linux',
    platform: 'linux',
    name: 'Linux',
    file: 'Fitts.AppImage',
    href: `${LATEST}/Fitts.AppImage`,
    note: 'AppImage, x64',
    install: 'Make it executable (chmod +x Fitts.AppImage), then run it.',
  },
];

export const builds = ALL_BUILDS.filter((b) => flags.linux || b.platform !== 'linux');

/** One button per platform on Home; macOS goes to Apple silicon (Intel is on /download). */
export const platforms: { platform: Platform; label: string; build: Build }[] = (
  [
    ['windows', 'Windows', 'windows'],
    ['mac', 'macOS', 'mac'],
    ['linux', 'Linux', 'linux'],
  ] as const
).flatMap(([platform, label, id]) => {
  const build = builds.find((b) => b.id === id);
  return build ? [{ platform, label, build }] : [];
});

export const macBeta = 'beta: not yet tested on a real Mac';

/** The Meta models Fitts uses, by name (the footer and How it works). */
export const META_MODELS = [
  'Muse Spark',
  'Muse Wonder',
  'Muse Code',
  'SAM 3.1',
  'Muse Image',
  'Muse Voice Transcribe',
  'Muse Spark Open',
] as const;

export type PageId = 'home' | 'how' | 'checks' | 'showcase' | 'download' | 'notfound';

export interface PageMeta {
  path: string;
  /** The nav's name for it. */
  nav: string;
  title: string;
  description: string;
}

/** Each page's address, nav name, <title> and description (vite.config.ts writes them into the HTML). */
export const pages: Record<PageId, PageMeta> = {
  home: {
    path: '/',
    nav: 'Home',
    title: 'Fitts · Making sure your design fits',
    description:
      'Fitts is your UX expert: a desktop app that uses your website or Android app like a person, finds what gets in the way, fixes the code, checks every fix and opens a pull request.',
  },
  how: {
    path: '/how-it-works/',
    nav: 'How it works',
    title: 'How Fitts works · Fitts',
    description:
      'Understand, explore, notice, prove, fix, and you decide. Which Meta model does each job, the safety rails, talking to Fitts, device previews, Android and redesigns.',
  },
  checks: {
    path: '/checks/',
    nav: 'What Fitts checks',
    title: 'What Fitts checks · Fitts',
    description:
      'Every check Fitts runs, from Nielsen’s 10 heuristics to WCAG 2.2 AA, keyboard, navigation, surprises, screen sizes, speed and Android, with how each is measured and how well it works.',
  },
  showcase: {
    path: '/showcase/',
    nav: 'Showcase',
    title: 'Fitts at work · Fitts',
    description:
      'Short clips of Fitts at work: understanding an app, noticing problems, proving them, fixing them, and asking before anything it can’t undo.',
  },
  download: {
    path: '/download/',
    nav: 'Download',
    title: 'Download Fitts · Fitts',
    description:
      'Download Fitts for Windows, macOS or Linux. What you need, how to get started, what it works with, its known limits, what leaves your computer, and answers to common questions.',
  },
  notfound: {
    path: '/404',
    nav: 'Not found',
    title: 'Page not found · Fitts',
    description: 'There’s no page at this address.',
  },
};

/** The pages the nav lists, in order. */
export const NAV_PAGES: PageId[] = ['home', 'how', 'checks', 'showcase', 'download'];

export const nav = {
  label: 'Site',
  skip: 'Skip to content',
  menu: 'Menu',
  github: 'Fitts on GitHub',
  homeLabel: 'Fitts, home',
};

export const footer = {
  made: 'Made by Allen Zheng. Built from scratch during the Meta Global AI Developer Hackathon, Oct 28 – Nov 4, 2026.',
  modelsTitle: 'The Meta models Fitts uses',
  voice: 'Fitts’s spoken voice is ElevenLabs.',
  license: 'Apache 2.0 license',
  github: 'GitHub',
  report: 'Report a problem',
  portfolio: 'allenzheng.com',
  audited: 'This site was audited by Fitts',
  /** The audit's result, filled in once Fitts has audited this site (SPEC-site step 5). */
  auditResult: '',
};

export const media = {
  play: 'Play',
  pause: 'Pause',
  clipComing: 'Clip coming',
  clipComingBody: 'This clip is recorded from a real run and goes up soon.',
};

export const notFound = {
  title: 'There’s no page here',
  body: 'This address doesn’t match any page on the site. It may have moved when the site was rebuilt. These are the pages there are:',
  home: 'Go to the home page',
};

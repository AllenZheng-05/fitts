// Every check Fitts runs, for /checks. Built from the code, not by hand:
// - The probe names are @fitts/schema's ProbeName: a new probe fails to compile until it's here.
// - WCAG criteria come from @fitts/probes' PROBE_STANDARDS and WCAG (the table repros cite).
// - Limits and throttling come from @fitts/probes (LIMITS, SLOW_4G, CPU_SLOWDOWN, PAGE_PROBES).
// - Each probe check's title and heuristic are the ones apps/desktop's aggregate.ts template()
//   gives a finding; `sample` is a measurement that reaches that template branch. The lists
//   that live only in apps/desktop (how fixes are checked, the screen-size cells, the axe tags)
//   are copied below. tests/unit/catalog.test.ts compares all of them with their sources.
import { CPU_SLOWDOWN, LIMITS, PAGE_PROBES, SLOW_4G } from '@fitts/probes';
import type { Heuristic, ProbeName } from '@fitts/schema';

export type GroupId =
  | 'accessibility'
  | 'keyboard'
  | 'navigation'
  | 'surprises'
  | 'states'
  | 'screens'
  | 'speed'
  | 'usability'
  | 'android'
  | 'brand'
  | 'fitts';

export type Evidence = 'measured' | 'reviewers' | 'wonder';
export type FixCheck = 'probe' | 'recheck' | 'replay' | 'review' | 'none';

export interface CatalogItem {
  id: string;
  group: GroupId;
  /** The probe that finds it; absent for reviewer and judge checks. */
  probe?: ProbeName;
  /** A measurement that reaches this check's branch of the app's template(). */
  sample?: string;
  /** The finding's title, as Fitts writes it (the test checks it against template()). */
  title: string;
  heuristic?: Heuristic;
  /** WCAG criteria, when this check names fewer than its probe's whole list. */
  wcag?: string[];
  /** Instead of criteria: a sentence (axe covers a whole standard). */
  standardNote?: string;
  what: string;
  how: string;
  evidence: Evidence;
  /** How a fix is checked, when it isn't the probe's (FIX_CHECK) or the reviewers' (review). */
  fix?: FixCheck;
}

export const GROUPS: { id: GroupId; name: string; about: string }[] = [
  {
    id: 'accessibility',
    name: 'Accessibility',
    about:
      'Every axe-core rule for WCAG 2.0, 2.1 and 2.2 at A and AA, plus best practice, on every page state.',
  },
  {
    id: 'keyboard',
    name: 'Keyboard',
    about: 'Fitts tabs through every page state, up to 200 stops, and opens every dialog it finds.',
  },
  {
    id: 'navigation',
    name: 'Navigation',
    about:
      'Every navigation and redirect is recorded. Every page is reloaded once, and a made-up address is tried.',
  },
  {
    id: 'surprises',
    name: 'Surprises',
    about:
      'A detector on every page notes what changes when nobody touched anything. The WCAG ones are findings; the moments Muse Wonder judges are frames from 2 s before and after.',
  },
  {
    id: 'states',
    name: 'States',
    about:
      'All three cases are built: for up to 6 of the site’s own GET requests, each page is loaded with the request failing, empty, and held for 3 s. Local projects only. Writes are never faked.',
  },
  {
    id: 'screens',
    name: 'Screen sizes',
    about:
      'Every reached page gets the measured checks in every screen-size cell. Up to 10 cells, chosen from the site’s own breakpoints.',
  },
  {
    id: 'speed',
    name: 'Speed',
    about: `Measured on your dev server, with Slow 4G (${(SLOW_4G.downloadThroughput * 8) / 1000 / 1000 / 0.9} Mbit/s, ${SLOW_4G.latency / 3.75} ms latency) and a ${CPU_SLOWDOWN}× slower CPU, and labeled “dev build”. A dev build is slower than what you ship, so these are leads, not verdicts. Measuring the production build is on the roadmap.`,
  },
  {
    id: 'usability',
    name: 'Feedback and flow',
    about:
      'Every action Fitts takes is timed and its result read: what changed, how fast, and what it said.',
  },
  {
    id: 'android',
    name: 'Android',
    about: 'Read from the same accessibility tree TalkBack uses, and from the screen’s pixels.',
  },
  {
    id: 'brand',
    name: 'Brand and look',
    about: 'Whether the look is consistent, and whether it suits the people it’s for.',
  },
  {
    id: 'fitts',
    name: 'Fitts’s law',
    about: 'How hard it is to hit what you mean to hit.',
  },
];

/** How a fix for each probe's finding is checked (apps/desktop/src/agent/fix/pipeline.ts). */
const MEASURED_AGAIN: ProbeName[] = [
  ...PAGE_PROBES,
  'focus-visible',
  'viewport-sweep',
  'links',
  'android-target',
  'android-label',
  'android-duplicate-label',
  'android-duplicate-bounds',
  'android-editable-desc',
  'android-contrast',
];
const RECHECKED: ProbeName[] = ['navigation', 'keyboard'];
const REPLAYED: ProbeName[] = [
  'feedback-timing',
  'back-mid-flow',
  'error-message',
  'label-consistency',
  'placeholder-leak',
];

export const FIX_CHECK = { measured: MEASURED_AGAIN, recheck: RECHECKED, replay: REPLAYED };

export function fixCheckFor(item: CatalogItem): FixCheck {
  if (item.fix) return item.fix;
  if (!item.probe) return 'review';
  if (MEASURED_AGAIN.includes(item.probe)) return 'probe';
  if (RECHECKED.includes(item.probe)) return 'recheck';
  if (REPLAYED.includes(item.probe)) return 'replay';
  // A probe finding Fitts can't check again stays the owner's to fix (pipeline.ts checkedBy).
  return 'none';
}

/** axe-core's tags, as packages/probes/src/page.ts runs it. */
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/** The screen-size cells every run starts from (apps/desktop's chooseCells, no breakpoints). */
export const BASE_CELLS = [
  'Reflow · 320×640',
  'iPhone · 390×844',
  'iPhone landscape · 844×390',
  'Laptop · 1280×800',
  'Desktop · 1440×900',
  'Text at 200% · 1280 wide',
  'Text spacing · 1280 wide',
];

const s = (ms: number) => `${ms / 1000} s`;

export const CATALOG: CatalogItem[] = [
  // Accessibility
  {
    id: 'axe',
    group: 'accessibility',
    probe: 'axe',
    title: 'Every axe rule',
    standardNote: 'WCAG 2.0, 2.1 and 2.2, A and AA, plus best practice',
    what: 'Image alt text, form labels, autocomplete, heading order, landmarks, valid ARIA, the page’s language, duplicate ids, controls inside controls, list markup, frame titles, blocked zoom, and the rest of axe-core’s rules.',
    how: 'axe-core runs on every page state Fitts reaches. Severity follows axe’s impact; best-practice rules stay at 2 or below. Each finding links the rule’s page and the WCAG criteria it names.',
    evidence: 'measured',
  },
  {
    id: 'contrast',
    group: 'accessibility',
    probe: 'contrast',
    sample: '2.6:1 (#bbb on #fff)',
    title: 'Text is too faint to read',
    what: 'Text, and the hint text inside fields, against what’s behind it.',
    how: 'Reads each text’s color and the color under it, in every screen-size cell. Under 4.5:1 is a finding.',
    evidence: 'measured',
  },
  {
    id: 'button-name',
    group: 'accessibility',
    probe: 'button-name',
    sample: 'a button with only an icon',
    title: 'Icon buttons have no accessible name',
    what: 'Buttons a screen reader would announce as just “button”.',
    how: 'Reads each button’s accessible name from the page.',
    evidence: 'measured',
  },
  {
    id: 'link-name',
    group: 'accessibility',
    probe: 'link-name',
    sample: 'a link with only an image',
    title: 'Links have no accessible name',
    what: 'Links a screen reader can’t say anything useful about.',
    how: 'Reads each link’s accessible name from the page.',
    evidence: 'measured',
  },
  {
    id: 'focus-visible',
    group: 'accessibility',
    probe: 'focus-visible',
    sample: 'no outline on focus',
    title: 'No visible focus when using the keyboard',
    what: 'Whether you can see where keyboard focus is.',
    how: 'Tabs to each control and compares how it looks focused and unfocused.',
    evidence: 'measured',
  },

  // Keyboard
  {
    id: 'keyboard-stuck',
    group: 'keyboard',
    probe: 'keyboard',
    sample: 'focus stuck on "Search" after 3 Tabs',
    title: 'Keyboard focus gets stuck',
    wcag: ['2.1.2'],
    what: 'Places Tab can’t get out of.',
    how: 'The same element after 3 Tabs, or a loop that never leaves one region outside an open dialog.',
    evidence: 'measured',
  },
  {
    id: 'keyboard-unreachable',
    group: 'keyboard',
    probe: 'keyboard',
    sample: '"Menu" can\'t be reached with Tab',
    title: 'A control can’t be reached with the keyboard',
    wcag: ['2.1.1'],
    what: 'Controls you can click but never Tab to.',
    how: 'Compares every interactive element in the accessibility tree with the stops Tab actually reaches.',
    evidence: 'measured',
  },
  {
    id: 'keyboard-hidden',
    group: 'keyboard',
    probe: 'keyboard',
    sample: '"Sign up" hidden while focused',
    title: 'The focused control is hidden',
    wcag: ['2.4.11'],
    what: 'Focus that lands under a sticky header or off screen.',
    how: 'Records each focused control’s box; half or more of it covered or out of view is a finding.',
    evidence: 'measured',
  },
  {
    id: 'keyboard-skip',
    group: 'keyboard',
    probe: 'keyboard',
    sample: 'no skip link before 8 navigation links',
    title: 'No way to skip the navigation',
    wcag: ['2.4.1'],
    what: 'Pages where keyboard users tab through the whole menu every time.',
    how: 'Six or more navigation links and no skip link first.',
    evidence: 'measured',
  },
  {
    id: 'keyboard-dialog',
    group: 'keyboard',
    probe: 'keyboard',
    sample: 'focus stayed behind the "Share" dialog when it opened',
    title: 'A dialog doesn’t work with the keyboard',
    wcag: ['2.4.3', '2.1.2'],
    what: 'Whether focus moves into a dialog, stays inside, closes on Esc, and comes back to what opened it.',
    how: 'Opens each dialog it finds and measures those four things.',
    evidence: 'measured',
  },
  {
    id: 'keyboard-order',
    group: 'keyboard',
    title: 'Tab order doesn’t follow the page',
    wcag: ['2.4.3'],
    what: 'Focus that jumps back up the page.',
    how: 'Compares Tab order with reading order. Three or more jumps on a page go to the reviewers as evidence, not a finding on their own.',
    evidence: 'reviewers',
  },

  // Navigation
  {
    id: 'nav-wrong-place',
    group: 'navigation',
    probe: 'navigation',
    sample: 'Contacts went to /settings (its link says /contacts)',
    title: 'A link goes to the wrong page',
    heuristic: 'H4',
    what: 'A control that arrives somewhere other than where it says.',
    how: 'Before each click, Fitts notes where it should go: the link’s address, or the destination in the code. A guess from the name alone is never a finding.',
    evidence: 'measured',
  },
  {
    id: 'nav-loop',
    group: 'navigation',
    probe: 'navigation',
    sample: '/account redirects in a loop',
    title: 'A page redirects in a loop',
    heuristic: 'H9',
    what: 'Redirects that come back to an address they already passed.',
    how: 'Every main-frame navigation and redirect is recorded, including client-side ones.',
    evidence: 'measured',
  },
  {
    id: 'nav-chain',
    group: 'navigation',
    probe: 'navigation',
    sample: '/old takes 3 redirects to open',
    title: 'Too many redirects before a page opens',
    what: 'More than 2 hops before a page loads.',
    how: 'Counts the hops in each recorded redirect chain.',
    evidence: 'measured',
  },
  {
    id: 'nav-login',
    group: 'navigation',
    probe: 'navigation',
    sample: '/pricing sends people to log in',
    title: 'A page asks for a login it doesn’t need',
    heuristic: 'H2',
    what: 'A redirect to the login page for a page the code doesn’t mark as private.',
    how: 'Checks the redirect against what Fitts read in the code about which pages need a login.',
    evidence: 'measured',
  },
  {
    id: 'nav-dropped',
    group: 'navigation',
    probe: 'navigation',
    sample: 'the redirect from /search?q=a drops ?q=a',
    title: 'A redirect drops part of the address',
    heuristic: 'H3',
    what: 'A search or anchor lost on the way.',
    how: 'Compares the query and hash before and after each redirect.',
    evidence: 'measured',
  },
  {
    id: 'nav-back-trap',
    group: 'navigation',
    probe: 'navigation',
    sample: 'Back from /home lands on / and is sent forward again',
    title: 'Back sends you straight back',
    heuristic: 'H3',
    what: 'The Back trap: Back lands on the redirecting address, which sends you forward again.',
    how: 'After arriving through a redirect, Fitts presses Back once.',
    evidence: 'measured',
  },
  {
    id: 'nav-refresh',
    group: 'navigation',
    probe: 'navigation',
    sample: 'refreshing /compose/confirm shows a blank page',
    title: 'Refreshing a page breaks it',
    heuristic: 'H9',
    what: 'Pages that only work if you arrived by clicking.',
    how: 'Every reached page is loaded fresh once: an error status, a blank page, an error screen or another page’s headings is a finding. Pages that rightly need earlier steps are only noted.',
    evidence: 'measured',
  },
  {
    id: 'nav-soft-404',
    group: 'navigation',
    probe: 'navigation',
    sample:
      '/fitts-not-a-page-x7 (an address that doesn’t exist) shows the home page with status 200',
    title: 'Unknown addresses show the home page',
    heuristic: 'H9',
    what: 'A made-up address that doesn’t say it doesn’t exist.',
    how: 'Loads a random address that can’t exist and reads the status and the page.',
    evidence: 'measured',
  },
  {
    id: 'links',
    group: 'navigation',
    probe: 'links',
    sample: '/help returns 404',
    title: 'Link goes to a missing page',
    heuristic: 'H10',
    what: 'Links to pages that don’t exist.',
    how: 'Follows every link it finds and reads the status, and the page for “not found” text.',
    evidence: 'measured',
  },

  // Surprises
  {
    id: 'surprise-wonder',
    group: 'surprises',
    title: 'Something popped up, jumped or scrolled by itself',
    what: 'A dialog or banner that appears unasked, content that moves after load, a page that scrolls on its own.',
    how: 'Fitts keeps the last 4 seconds of frames. For each moment it sends Muse Wonder up to 8 frames from 2 s before and after, with what was just done, and asks whether a person would expect it. SAM 3.1 outlines the element in the first and last frames. Up to 12 moments a run; cookie and newsletter banners once per site.',
    evidence: 'wonder',
  },
  {
    id: 'surprise-moved',
    group: 'surprises',
    probe: 'surprise',
    sample: '"Send" moved 58 px just before the tap',
    title: 'A control moves just as you reach for it',
    wcag: [],
    what: 'A target that shifts between Fitts deciding to tap it and the tap.',
    how: 'Compares the control’s box when Fitts chose it with its box at the click. More than 20 px is a mis-tap.',
    evidence: 'measured',
  },
  {
    id: 'surprise-focus',
    group: 'surprises',
    probe: 'surprise',
    sample: 'focusing "Email" alone opened a dialog',
    title: 'Focus alone changes the page',
    wcag: ['3.2.1'],
    what: 'A page change or dialog caused by focus, with nothing pressed.',
    how: 'The detector links each change to the input that came before it.',
    evidence: 'measured',
  },
  {
    id: 'surprise-typing',
    group: 'surprises',
    probe: 'surprise',
    sample: 'typing in "Search" opened another page before anything was submitted',
    title: 'Typing changes the page before you submit',
    wcag: ['3.2.2'],
    what: 'Typing that changes the page before you submit.',
    how: 'The detector links each change to the input that came before it.',
    evidence: 'measured',
  },
  {
    id: 'surprise-vanished',
    group: 'surprises',
    probe: 'surprise',
    sample: 'a 12-word message ("Saved") vanished after 2.1 s',
    title: 'A message disappears before it can be read',
    wcag: ['2.2.1'],
    what: 'A toast or status of 8 or more words gone within 5 seconds.',
    how: 'Times each message from when it appears to when it goes.',
    evidence: 'measured',
  },
  {
    id: 'surprise-autoplay',
    group: 'surprises',
    probe: 'surprise',
    sample: 'sound played on its own for 4.0 s',
    title: 'Sound plays on its own',
    wcag: ['1.4.2'],
    what: 'Audio or video playing with sound for more than 3 seconds, unasked.',
    how: 'Watches every audio and video element for sound with no input before it.',
    evidence: 'measured',
  },
  {
    id: 'surprise-focus-moved',
    group: 'surprises',
    title: 'Focus moved by itself',
    what: 'Keyboard focus jumping somewhere with nothing pressed.',
    how: 'Noted by the detector and given to the reviewers as evidence.',
    evidence: 'reviewers',
  },

  // States
  {
    id: 'state-error',
    group: 'states',
    probe: 'state',
    sample: '/contacts shows a blank page when contacts fails',
    title: 'The page breaks when a request fails',
    heuristic: 'H9',
    what: 'A blank page, an error screen or an uncaught error when one of the site’s own requests fails.',
    how: 'The request is answered with status 500 while the page loads. The page must say what went wrong, with a way to try again.',
    evidence: 'measured',
  },
  {
    id: 'state-slow',
    group: 'states',
    probe: 'state',
    sample: 'no sign /contacts is loading when contacts takes 3 s',
    title: 'No sign the page is loading',
    heuristic: 'H1',
    what: 'A page that shows nothing while it waits.',
    how: 'The request is held 3 seconds. No loading indicator within 1 second is a finding.',
    evidence: 'measured',
  },
  {
    id: 'state-empty',
    group: 'states',
    title: 'An empty list with no explanation',
    what: 'What a page says when there’s nothing to show yet.',
    how: 'The request’s lists come back empty. Leaked placeholders are measured; whether the page says what to do next is for the reviewers, who see the empty page.',
    evidence: 'reviewers',
  },

  // Screen sizes
  {
    id: 'viewport-wide',
    group: 'screens',
    probe: 'viewport-sweep',
    sample: 'the page is 412 px wide at 320 px',
    title: 'Page scrolls sideways on small screens',
    what: 'Pages wider than the screen at 320 px and other narrow widths.',
    how: 'Compares the page’s width with the screen’s in each cell.',
    evidence: 'measured',
  },
  {
    id: 'viewport-clipped',
    group: 'screens',
    probe: 'viewport-sweep',
    sample: 'a heading is cut off at 360 px',
    title: 'Text gets cut off on small screens',
    what: 'Text that doesn’t fit its box at narrow widths.',
    how: 'Finds text whose content is larger than its visible box in each cell.',
    evidence: 'measured',
  },
  {
    id: 'resize-text',
    group: 'screens',
    probe: 'resize-text',
    sample: 'the menu covers the heading',
    title: 'Page breaks at 200% text',
    what: 'Overflow and clipping with text twice the size.',
    how: 'Loads each page at 1280 wide with the zoom at 200%.',
    evidence: 'measured',
  },
  {
    id: 'text-spacing',
    group: 'screens',
    probe: 'text-spacing',
    sample: 'the Send button’s label is clipped',
    title: 'Text breaks with wider spacing',
    what: 'Clipping and overlap with WCAG’s text spacing.',
    how: 'Injects line height 1.5, paragraph spacing 2em, letter spacing 0.12em and word spacing 0.16em, then measures again.',
    evidence: 'measured',
  },
  {
    id: 'orientation',
    group: 'screens',
    probe: 'orientation',
    sample: 'hides its content',
    title: 'Page doesn’t work in landscape',
    what: 'Content locked to one orientation, or hidden in landscape.',
    how: 'Loads each page as a phone turned sideways (844×390).',
    evidence: 'measured',
  },
  {
    id: 'breakpoints',
    group: 'screens',
    title: 'Both sides of every breakpoint',
    what: 'Layouts that break just under a breakpoint the site defines.',
    how: 'Reads the site’s own media and container queries (and the ones in its code), and adds a cell 1 px under and one at each of the 4 most used. Dark mode and reduced motion get cells when the site has rules for them.',
    evidence: 'measured',
    fix: 'none',
  },

  // Speed
  {
    id: 'perf-lcp',
    group: 'speed',
    probe: 'perf',
    sample: 'the main content shows after 4.1 s on a mid-range phone on Slow 4G (dev build)',
    title: 'Slow to load on a phone',
    what: 'How long the main content takes to show (Largest Contentful Paint).',
    how: `Throttled. Over ${s(LIMITS.lcp)} is a finding; on a dev build it’s severity 1.`,
    evidence: 'measured',
  },
  {
    id: 'perf-tbt',
    group: 'speed',
    probe: 'perf',
    sample: 'the page is blocked for 640 ms on a mid-range phone on Slow 4G (dev build)',
    title: 'Slow to load on a phone',
    what: 'How long the page can’t respond while it loads (Total Blocking Time).',
    how: `Throttled. Over ${LIMITS.tbt} ms is a finding.`,
    evidence: 'measured',
  },
  {
    id: 'perf-cls',
    group: 'speed',
    probe: 'perf',
    sample: 'layout shift adds up to 0.31 on a mid-range phone on Slow 4G (dev build)',
    title: 'The layout jumps while loading',
    what: 'How much the page moves as it loads (Cumulative Layout Shift).',
    how: `Throttled. Over ${LIMITS.cls} is a finding.`,
    evidence: 'measured',
  },
  {
    id: 'perf-file',
    group: 'speed',
    probe: 'perf',
    sample: 'hero.png is 812 KB',
    title: 'A file is too big for phones',
    what: 'Images and scripts too heavy for a phone connection.',
    how: `Each image and script the page loads; over ${LIMITS['big-file'] / 1024} KB is a finding.`,
    evidence: 'measured',
  },
  {
    id: 'web-vitals',
    group: 'speed',
    probe: 'web-vitals',
    sample: 'LCP 3.2 s',
    title: 'Slow to show the main content',
    what: 'Web vitals as Fitts browses, unthrottled.',
    how: 'Read from the browser during the crawl; severity 1.',
    evidence: 'measured',
  },
  {
    id: 'network-keystroke',
    group: 'speed',
    probe: 'network',
    sample: '9 requests for 9 characters typed',
    title: 'Search sends a request on every keystroke',
    heuristic: 'H7',
    what: 'Typing that sends a request per character.',
    how: 'Counts the requests while Fitts types.',
    evidence: 'measured',
  },
  {
    id: 'network-cache',
    group: 'speed',
    probe: 'network',
    sample: '/api/contacts was fetched 4 times with no Cache-Control',
    title: 'Repeated requests aren’t cached',
    what: 'The same response downloaded again and again.',
    how: 'Finds repeated requests whose responses have no caching headers.',
    evidence: 'measured',
  },
  {
    id: 'network-large',
    group: 'speed',
    probe: 'network',
    sample: '/api/messages returned 2,400 items',
    title: 'Response is far too large',
    heuristic: 'H8',
    what: 'Everything sent at once instead of a page at a time.',
    how: 'Reads the size of each response the page asks for.',
    evidence: 'measured',
  },

  // Feedback and flow
  {
    id: 'feedback-loading',
    group: 'usability',
    probe: 'feedback-timing',
    sample: 'a 2.4 s wait with no loading indicator',
    title: 'No loading indicator while waiting',
    heuristic: 'H1',
    what: 'Waits with nothing on screen.',
    how: 'Times every action: the first visible change, and when a loading indicator appears. Nothing within 1 s of a wait is a finding.',
    evidence: 'measured',
  },
  {
    id: 'feedback-confirm',
    group: 'usability',
    probe: 'feedback-timing',
    sample: '"saving" saved with no confirmation',
    title: 'No confirmation after saving',
    heuristic: 'H1',
    what: 'Saving or sending that never says it worked.',
    how: 'After a save goes through, reads what the page shows and announces.',
    evidence: 'measured',
  },
  {
    id: 'feedback-nothing',
    group: 'usability',
    probe: 'feedback-timing',
    sample: 'pressing it changed nothing',
    title: 'A control does nothing visible',
    heuristic: 'H1',
    what: 'Controls that change nothing on screen.',
    how: 'Compares the screen before and after each press.',
    evidence: 'measured',
  },
  {
    id: 'back-lost',
    group: 'usability',
    probe: 'back-mid-flow',
    sample: 'the draft was empty after Back',
    title: 'Going back loses what you typed',
    heuristic: 'H3',
    what: 'Back in the middle of a form throwing your work away.',
    how: 'Types into a step, goes back, comes forward, and reads the fields.',
    evidence: 'measured',
  },
  {
    id: 'back-none',
    group: 'usability',
    probe: 'back-mid-flow',
    sample: 'no back or cancel on step 2 of 3',
    title: 'No back or cancel in this flow',
    heuristic: 'H3',
    what: 'Steps with no way back or out.',
    how: 'Looks for a back or cancel control on every step of a flow.',
    evidence: 'measured',
  },
  {
    id: 'error-message',
    group: 'usability',
    probe: 'error-message',
    sample: '"ERR_422", with no field marked',
    title: 'Error is a raw code, not an explanation',
    heuristic: 'H9',
    what: 'Error messages that don’t say what went wrong or how to fix it.',
    how: 'Submits forms, empty too, and reads the messages and which fields are marked.',
    evidence: 'measured',
  },
  {
    id: 'label-consistency',
    group: 'usability',
    probe: 'label-consistency',
    sample: 'NEXT, Send Text and Create Message do the same thing',
    title: 'One action has different labels',
    heuristic: 'H4',
    what: 'One action called different things through a flow.',
    how: 'Follows the forward action through each flow and compares its labels.',
    evidence: 'measured',
  },
  {
    id: 'placeholder-leak',
    group: 'usability',
    probe: 'placeholder-leak',
    sample: 'shows "(null)"',
    title: 'Page shows "(null)" instead of real content',
    heuristic: 'H2',
    what: 'Missing values leaking onto the screen: “(null)”, “undefined”, “NaN”, “[object Object]”, “{{name}}”.',
    how: 'Reads the text of every page state.',
    evidence: 'measured',
  },
  {
    id: 'reviewers',
    group: 'usability',
    title: 'Five reviewers',
    what: 'What only judgment can see: jargon, things you have to remember, missing help, actions that can’t be undone and don’t ask first, whether it feels trustworthy.',
    how: 'Five reviewer personas (a novice, a power user, an accessibility specialist, a visual designer, and trust and ethics) look at each page state with the measurements. A finding needs a measurement or 2 of 5 agreeing.',
    evidence: 'reviewers',
  },

  // Android
  {
    id: 'android-label',
    group: 'android',
    probe: 'android-label',
    sample: 'the button at the top right has no label',
    title: 'Icon buttons have no accessible name',
    what: 'Buttons TalkBack announces as just “button”.',
    how: 'Reads the label TalkBack would read from the uiautomator dump. Icon-font glyphs don’t count as words.',
    evidence: 'measured',
  },
  {
    id: 'android-target',
    group: 'android',
    probe: 'android-target',
    sample: '"Remove" is 36×36 dp',
    title: 'Tap target is too small',
    heuristic: 'H7',
    what: 'Controls under Android’s 48×48 dp minimum.',
    how: 'Each clickable element’s bounds from the dump, divided by the screen’s density.',
    evidence: 'measured',
  },
  {
    id: 'android-contrast',
    group: 'android',
    probe: 'android-contrast',
    sample: 'the description is 2.4:1 on its card',
    title: 'Text is hard to read',
    what: 'Text too faint against its background.',
    how: 'Estimated from the screenshot’s pixels inside each text’s bounds: its two main colors.',
    evidence: 'measured',
  },
  {
    id: 'android-duplicate-bounds',
    group: 'android',
    probe: 'android-duplicate-bounds',
    sample: 'two controls share the same bounds',
    title: 'Two controls sit in the same place',
    what: 'One control hiding another from touch and from TalkBack.',
    how: 'Finds clickable elements with identical bounds in the dump.',
    evidence: 'measured',
  },
  {
    id: 'android-duplicate-label',
    group: 'android',
    probe: 'android-duplicate-label',
    sample: 'three buttons are all called "Add"',
    title: 'Different controls have the same name',
    heuristic: 'H4',
    what: 'Controls a screen reader can’t tell apart.',
    how: 'Compares the spoken names of the controls on each screen.',
    evidence: 'measured',
  },
  {
    id: 'android-editable-desc',
    group: 'android',
    probe: 'android-editable-desc',
    sample: 'the name field has a content description',
    title: 'A text field reads its description, not its value',
    what: 'Text fields TalkBack reads by their description instead of what was typed.',
    how: 'Finds editable fields with a content description in the dump.',
    evidence: 'measured',
  },
  {
    id: 'android-placeholder',
    group: 'android',
    probe: 'placeholder-leak',
    sample: 'shows "Ready around undefined"',
    title: 'Page shows "Ready around undefined" instead of real content',
    heuristic: 'H2',
    what: 'Missing values leaking onto the screen.',
    how: 'Reads the text of every screen in the dump.',
    evidence: 'measured',
    fix: 'none',
  },
  {
    id: 'android-surprise',
    group: 'android',
    title: 'Something popped up or jumped',
    what: 'Content that moves after a screen opens, and things that appear unasked.',
    how: 'Consecutive dumps show what moved and appeared; a ring of screencaps gives Muse Wonder the frames around the moment, with the same cap and rules as the web.',
    evidence: 'wonder',
  },

  // Brand and look
  {
    id: 'font-inventory',
    group: 'brand',
    probe: 'font-inventory',
    sample: 'georgia, system-ui, trebuchet ms (3 families)',
    title: 'Too many font families',
    heuristic: 'H4',
    what: 'How many type families the site mixes.',
    how: 'Collects the font family of every piece of text.',
    evidence: 'measured',
  },
  {
    id: 'spacing',
    group: 'brand',
    probe: 'spacing',
    sample: '7px, 13px, 19px',
    title: 'Spacing is inconsistent and off-grid',
    heuristic: 'H8',
    what: 'Padding and margins off a 4 px grid.',
    how: 'Collects every padding and margin value on the page.',
    evidence: 'measured',
  },
  {
    id: 'theme-fit',
    group: 'brand',
    title: 'Whether the look fits',
    heuristic: 'H8',
    what: 'Whether the colors, type and decoration suit the people the site is for, and how you said it should feel.',
    how: 'The theme check looks at the pages’ states against your brief: Muse Wonder in the Quality profile, Muse Spark in Economy, Muse Spark Open in Open. When the look works against you, Fitts offers a redesign.',
    evidence: 'reviewers',
  },
  {
    id: 'brand-check',
    group: 'brand',
    title: 'Doesn’t match your brand',
    heuristic: 'H8',
    what: 'On Android: an app whose theme ignores the brand its logo, splash screen and photos carry.',
    how: 'The same model as the theme check compares the screens with the brief and the app’s own brand cues. One finding, fixed only when you ask, in theme tokens and the wordmark only.',
    evidence: 'reviewers',
  },

  // Fitts's law
  {
    id: 'fitts-id',
    group: 'fitts',
    probe: 'fitts-id',
    sample: '4.2 bits from where the last step ended',
    title: 'Main action is hard to reach',
    heuristic: 'H7',
    what: 'How hard the main action is to hit.',
    how: 'Fitts’s index of difficulty, log₂(D / W + 1), from where the previous step ended to the main action’s size and distance.',
    evidence: 'measured',
  },
  {
    id: 'target-size',
    group: 'fitts',
    probe: 'target-size',
    sample: '18×18px',
    title: 'Tap target is too small',
    heuristic: 'H7',
    what: 'Controls smaller than 24×24 px.',
    how: 'Measures every control’s box, padding included. The fix aims for 44×44 px.',
    evidence: 'measured',
  },
];

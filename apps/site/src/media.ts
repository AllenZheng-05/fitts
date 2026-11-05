// Every clip and screenshot slot on the site. A slot with no `src` shows a tidy "Clip coming"
// card: never a broken player, never a stand-in. To add one, put the files in public/media/ and
// fill in `src` and `poster` here.
// Clips: MP4 (H.264), muted, at most 4 MB; posters: WebP. No GIFs.

/** What kind of project the clip shows (Showcase's honesty labels). */
export type Honesty = 'untouched' | 'planted' | 'merged';

export const HONESTY: Record<Honesty, string> = {
  untouched: 'Real AI-built site, untouched',
  planted: 'Our test app, planted issues',
  merged: 'Real site, merged',
};

export interface Media {
  id: string;
  title: string;
  /** One line under it. */
  caption: string;
  honesty?: Honesty;
  kind: 'clip' | 'image';
  /** /media/….mp4 (clip) or /media/….webp|png (image). Empty until recorded. */
  src: string;
  /** /media/….webp: the clip's first frame. */
  poster: string;
  /** What happens in the clip (or what the image shows), for people who can't see it. */
  alt: string;
  width?: number;
  height?: number;
}

const slot = (m: Omit<Media, 'src' | 'poster' | 'kind'> & Partial<Media>): Media => ({
  kind: 'clip',
  src: '',
  poster: '',
  ...m,
});

/** The loop on How it works, one clip per step. */
export const LOOP_MEDIA: Record<string, Media> = {
  understand: slot({
    id: 'loop-understand',
    title: 'Understand',
    caption: 'Fitts reads the code and shows what it understood.',
    honesty: 'untouched',
    alt: 'Fitts opens a project and fills in its understanding card: the pages, the journeys and the stack it found in the code.',
  }),
  explore: slot({
    id: 'loop-explore',
    src: '/media/explore.mp4',
    poster: '/media/explore.webp',
    title: 'Explore',
    caption: 'Fitts follows a journey through the site, then tries it on a phone.',
    honesty: 'untouched',
    alt: 'Fitts clicks through a journey on the site, then switches the view to a phone and walks the same pages.',
  }),
  notice: slot({
    id: 'loop-notice',
    title: 'Notice',
    caption: 'Every action timed; what Fitts noticed, in its own lines.',
    honesty: 'planted',
    alt: 'The chat fills with actions and their timings, each followed by indented Noticed lines. One is selected and a box highlights its element on the site.',
  }),
  prove: slot({
    id: 'loop-prove',
    title: 'Prove',
    caption: 'A finding with its steps, the standard it breaks and a test that shows it.',
    honesty: 'planted',
    alt: 'A finding opens on the See it yourself tab: numbered steps, expected and actual, a WCAG link and a Playwright test.',
  }),
  fix: slot({
    id: 'loop-fix',
    src: '/media/verified-fix.mp4',
    poster: '/media/verified-fix.webp',
    title: 'Fix',
    caption: 'Muse Code changes the code in a separate copy; Fitts checks it there.',
    honesty: 'planted',
    alt: 'A fix runs: the diff appears, Fitts loads the fixed copy of the site, measures again, and marks the finding Verified.',
  }),
  decide: slot({
    id: 'loop-decide',
    title: 'You decide',
    caption: 'Fitts says what it covered and what it didn’t. You choose Finish.',
    honesty: 'planted',
    alt: 'Fitts posts a card saying it thinks it’s done, listing pages reached, journeys done and what wasn’t covered. The owner chooses Finish and the pull request opens.',
  }),
};

/** "What a Fitts pull request looks like": the real PR from the recorded run. */
export const PR_MEDIA: Media = slot({
  id: 'pull-request',
  kind: 'image',
  title: 'A Fitts pull request',
  caption: 'The pull request from the recorded run.',
  honesty: 'untouched',
  alt: 'A GitHub pull request opened by Fitts: a table of pages and what changed on each, the repro steps for each finding, and a verification footer marking each fix Verified or Checked by review.',
});

/** One card per feature on Showcase. */
export const SHOWCASE_MEDIA: Media[] = [
  slot({
    id: 'understanding',
    title: 'The understanding card',
    caption: 'Before it clicks anything, Fitts reads the code and tells you what it found.',
    honesty: 'untouched',
    alt: 'Fitts shows its understanding of Basil & Ember: the stack, the pages from the router, the journeys it plans, and the owner correcting one.',
  }),
  slot({
    id: 'noticed',
    title: 'Noticed lines',
    caption: 'Every action timed, and what Fitts noticed, written from what it measured.',
    honesty: 'planted',
    alt: 'Actions stream into the chat with timing chips; indented Noticed lines appear under them, and selecting one outlines the element on the site.',
  }),
  slot({
    id: 'presentation',
    title: 'Presentation mode',
    caption: 'The site large, with an info card saying what Fitts is doing and why.',
    honesty: 'untouched',
    alt: 'Fitts switches to presentation mode: the site fills the window and an info card describes the current step.',
  }),
  slot({
    id: 'see-it-yourself',
    title: 'See it yourself',
    caption: 'Repro steps anyone can follow, and a Playwright test that shows the problem.',
    honesty: 'planted',
    alt: 'The See it yourself tab: numbered steps, expected and actual, the WCAG criterion, and a Playwright test being copied.',
  }),
  slot({
    id: 'verified-fix',
    src: '/media/verified-fix.mp4',
    poster: '/media/verified-fix.webp',
    title: 'A verified fix',
    caption: 'Fixed in a separate copy, measured again there, then marked Verified.',
    honesty: 'planted',
    alt: 'Fitts applies a fix, loads the fixed copy of the site, measures the same problem again, and the finding turns Verified.',
  }),
  slot({
    id: 'pickup',
    src: '/media/pickup.mp4',
    poster: '/media/pickup.webp',
    title: 'The 2:45 AM pickup',
    caption: 'A pickup time the restaurant can’t honor, found by using the site like a customer.',
    honesty: 'untouched',
    alt: 'Fitts places a pickup order on Basil & Ember and is offered 2:45 AM, when the restaurant is closed; it files the finding.',
  }),
  slot({
    id: 'app-map',
    title: 'The App Map',
    caption: 'Every page at once: what it does, what Fitts checked, found and fixed there.',
    honesty: 'untouched',
    alt: 'The App Map on the Done screen: pages as a tree, one opened to show its checks, findings and fixes.',
  }),
  slot({
    id: 'android-jump',
    src: '/media/android-jump.mp4',
    poster: '/media/android-jump.webp',
    title: 'The menu jump, judged',
    caption: 'A banner pushes every row down; Muse Wonder judges the moment from its frames.',
    honesty: 'planted',
    alt: 'On the Android emulator, a banner appears above the menu and every row moves down; the finding shows the frames before and after, with the moved row outlined.',
  }),
  slot({
    id: 'emulator-fixed',
    title: 'The fixed version, beside the live app',
    caption: 'The emulator stays on the live app while the fixed version shows beside it.',
    honesty: 'planted',
    alt: 'Fitts shows the fixed version of the Android app at phone width, marked as an imitation, beside the emulator running the live app.',
  }),
  slot({
    id: 'brand-fix',
    title: 'The brand fix',
    caption: 'An app that ignored its own brand, restyled in its theme tokens and wordmark only.',
    honesty: 'planted',
    alt: 'The Android app before and after the brand fix: stock colors and the system font become the restaurant’s own colors and type.',
  }),
  slot({
    id: 'gate',
    src: '/media/gate.mp4',
    poster: '/media/gate.webp',
    title: 'The “Cancel order” gate',
    caption: 'Fitts tries every control, but anything it can’t undo waits for you.',
    honesty: 'planted',
    alt: 'Fitts taps Cancel order; the action is held and a card asks the owner whether to let it through.',
  }),
  slot({
    id: 'redesign',
    src: '/media/redesign.mp4',
    poster: '/media/redesign.webp',
    title: 'A redesign',
    caption:
      'Three directions as style boards, a round of feedback, every page restyled and checked.',
    honesty: 'untouched',
    alt: 'Fitts shows three style boards, the owner asks for changes, a second round appears, and the chosen direction is applied to every page with before and after shots.',
  }),
  slot({
    id: 'talk',
    title: 'Talking to Fitts',
    caption: 'Say “Fitts” first and it listens; interrupt it and it stops.',
    honesty: 'untouched',
    alt: 'The owner says “Fitts, why is that a problem?” and Fitts answers aloud; the owner interrupts and it stops mid-sentence.',
  }),
  slot({
    id: 'pause',
    title: 'The pause',
    caption:
      'When Meta’s models can’t be reached, Fitts stops and waits, then picks up where it left off.',
    honesty: 'planted',
    alt: 'The network drops; Fitts posts “I can’t reach Meta’s models, so I’ve paused.” When it comes back, the run resumes on its own.',
  }),
];

/** The portfolio before and after: shown only once both real images exist. */
export const PORTFOLIO = {
  /** /media/portfolio-today.webp: the live site as it is today. */
  before: '',
  /** /media/portfolio-merged.webp: the same page with Fitts's merged change. */
  after: '',
  /** The merged pull request. */
  prNumber: 0,
  prUrl: '',
  /** What changed between the two, for people who can't see the images. */
  alt: '',
};

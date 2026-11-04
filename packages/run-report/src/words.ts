// Every word the report shows, in Fitts's voice: plain, specific, no exclamation marks. Labels
// match the app's (apps/desktop/src/renderer/copy.ts) so a report reads like the Done screen.
import type { CostEvent, CostPhase, Heuristic, Lens } from '@fitts/schema';
import type { ChangeStatus } from './data';

export const severityNames: Record<number, string> = {
  0: 'Not a problem',
  1: 'Cosmetic',
  2: 'Minor',
  3: 'Major',
  4: 'Catastrophic',
};

export const heuristics: Record<Heuristic, string> = {
  H1: 'Visibility of system status',
  H2: 'Match between system and the real world',
  H3: 'User control and freedom',
  H4: 'Consistency and standards',
  H5: 'Error prevention',
  H6: 'Recognition rather than recall',
  H7: 'Flexibility and efficiency of use',
  H8: 'Aesthetic and minimalist design',
  H9: 'Help users recognize, diagnose and recover from errors',
  H10: 'Help and documentation',
};

export const lenses: Record<Lens, string> = {
  usability: 'Usability',
  accessibility: 'Accessibility',
  performance: 'Performance',
  'look-and-feel': 'Look & feel',
  ergonomics: 'Ergonomics',
  content: 'Content',
};

export const phases: Record<CostPhase, string> = {
  crawling: 'Interview, reading the code and exploring',
  reviewers: 'Reviewers',
  fixes: 'Fixes',
  summing: 'Summing up',
  media: 'Outlines, mockups and voice',
};

export const tasks: Record<CostEvent['task'], string> = {
  interview: 'the interview',
  understand: 'reading the code',
  crawl: 'choosing what to try',
  review: 'reviewing pages',
  aggregate: 'merging the reviews',
  themefit: 'the theme check',
  fix: 'writing fixes',
  sam: 'outlining elements',
  image: 'drawing mockups',
  stt: 'hearing the owner',
  tts: 'speaking',
};

const MODEL_NAMES: Record<string, string> = {
  'muse-spark-1.3': 'Muse Spark 1.3',
  'muse-spark-1.3-contributor': 'Muse Spark 1.3 (contributor pricing)',
  'muse-wonder-1.0': 'Muse Wonder 1.0',
  'meta-models/muse-spark-open-1026': 'Muse Spark Open',
  'sam-3.1': 'SAM 3.1',
  'muse-image-1.0': 'Muse Image 1.0',
  'muse-voice-transcribe-1.0': 'Muse Voice Transcribe 1.0',
  eleven_flash_v2_5: 'ElevenLabs Flash v2.5',
};

export const modelName = (id: string) => MODEL_NAMES[id] ?? id;

export const providers: Record<CostEvent['provider'], string> = {
  meta: 'Meta',
  baseten: 'Meta open weights on Baseten',
  elevenlabs: 'ElevenLabs',
};

export const changeStatus: Record<ChangeStatus, string> = {
  verified: 'Verified',
  review: 'Checked by review',
  'rolled-back': 'Rolled back',
  undone: 'Undone',
  retrying: 'Trying again',
};

export const findingStatus: Record<string, string> = {
  open: 'Open: not fixed in this run',
  dismissed: 'The owner said this isn’t a problem',
  fixing: 'Being fixed when the run ended',
  verified: 'Fixed',
  'pr-opened': 'Fixed, in the pull request',
  'rolled-back': 'The fix was rolled back',
  undone: 'The fix was undone',
};

export const confirmed: Record<'replayed' | 'observed' | 'owner', string> = {
  replayed: 'Replayed and seen again',
  observed: 'Seen once during the run',
  owner: 'Reported by the owner',
};

export const usd = (n: number) =>
  n === 0 ? '$0' : n < 0.01 ? `$${n.toFixed(4)}` : n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`;

export const tokens = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : `${n}`;

/**
 * For a run of one of the Fitts repo's own demo apps: how to start that app yourself. Keyed by
 * the project's id; `**bold**` and `` `code` `` work in `lead` and `after`.
 */
export const runItYourself: Record<string, { lead: string; commands: string[]; after: string }> = {
  'demo-chat': {
    lead: 'This is `demo/chat`, the test app in the Fitts repo. Its planted issues are listed in `demo/chat/PLANTED.md`. To start it on your computer, with Node.js 22.12 or later and pnpm:',
    commands: [
      'git clone https://github.com/AllenZheng-05/fitts.git',
      'cd fitts',
      'pnpm install',
      'pnpm --filter demo-chat dev',
    ],
    after:
      'It opens at `http://localhost:5173` (set `PORT` if that port is taken). To run this audit on it, choose the `demo/chat` folder in Fitts. To score the probes alone, free and with no key: `BENCH_OFFLINE=1 pnpm bench:chat`.',
  },
};

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

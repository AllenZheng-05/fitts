// Scenario B: hartwell-site, Autonomous redesign, about 40s (SPEC §6.7, §9.5).
import type { ChatItem, RunState } from '@fitts/schema';
import { copy } from '../../copy';
import type { BeatContext, Scenario } from '../../state/script';

const S = 1000;

export const HARTWELL_DIRECTIONS = [
  { id: 'quiet', name: 'Quiet & dignified', swatches: ['#1F2A44', '#DDD6CB', '#F6F4EF'] },
  { id: 'warm', name: 'Warm & personal', swatches: ['#5B3A29', '#C8955C', '#FBF3E8'] },
  { id: 'classic', name: 'Classic & formal', swatches: ['#16161D', '#8A8A93', '#FFFFFF'] },
];

const PAGES = 14;
const PR = 22;

type ProgressItem = Extract<ChatItem, { type: 'progress' }>;

function progressItem(s: RunState): ProgressItem | undefined {
  return [...s.chat].reverse().find((c): c is ProgressItem => c.type === 'progress');
}

/** "Applying the look": ✓ ✓ ◐ 9 of 14 pages ○ PR (SPEC §9.5 B). */
function applyLook(directionId: string, s: RunState, ctx: BeatContext) {
  const name = HARTWELL_DIRECTIONS.find((d) => d.id === directionId)?.name ?? directionId;
  s.activity = 'redesigning';
  s.nowText = `Applying ${name} to every page`;
  ctx.post({
    type: 'progress',
    title: 'Applying the look',
    items: [
      { text: 'Mocked up three directions', state: 'done' },
      { text: `${name} colors and type`, state: 'doing' },
      { text: `Restyling pages · 0 of ${PAGES}`, state: 'todo' },
      { text: 'Open the pull request', state: 'todo' },
    ],
  });
  const t = s.elapsedMs;
  const tick = (atMs: number, update: (items: ProgressItem['items'], s2: RunState) => void) =>
    ctx.at(t + atMs, (s2) => {
      const item = progressItem(s2);
      if (item) update(item.items, s2);
    });

  tick(3 * S, (items) => {
    setItem(items, 1, 'done');
    setItem(items, 2, 'doing', `Restyling pages · 3 of ${PAGES}`);
  });
  tick(8 * S, (items) => setItem(items, 2, 'doing', `Restyling pages · 9 of ${PAGES}`));
  ctx.at(t + 11 * S, (s2, c) => {
    c.post({ type: 'wording', from: 'Party packages', to: 'Service options' });
    s2.changes.push({
      id: 'change-wording-packages',
      findingIds: ['f-hartwell-wording'],
      kind: 'wording',
      title: 'Wording: "Party packages" → "Service options"',
      costUsd: 0.12,
      status: 'verified',
      prNumber: PR,
    });
  });
  tick(16 * S, (items) => {
    setItem(items, 2, 'done', `Restyling pages · ${PAGES} of ${PAGES}`);
    setItem(items, 3, 'doing');
  });
  ctx.at(t + 20 * S, (s2, c) => {
    const item = progressItem(s2);
    if (item) setItem(item.items, 3, 'done', `Opened PR #${PR}`);
    s2.changes.push({
      id: 'change-redesign',
      findingIds: ['f-hartwell-look'],
      kind: 'redesign',
      title: `Redesign: ${name}`,
      severity: 3,
      prNumber: PR,
      costUsd: 2.86,
      status: 'verified',
    });
    const look = s2.findings.find((f) => f.id === 'f-hartwell-look');
    if (look) {
      look.status = 'pr-opened';
      look.prNumber = PR;
    }
    s2.cost.byPhase.fixes += 2.86;
    s2.cost.byPhase.media += 1.1;
    s2.cost.spentUsd = Math.round((s2.cost.spentUsd + 3.96) * 100) / 100;
    c.post({ type: 'fix.result', changeId: 'change-redesign' });
    s2.activity = 'acting';
  });
  ctx.at(t + 24 * S, (_s2, c) => {
    c.finish();
    c.say(
      `Done. The new look is on all ${PAGES} pages in PR #${PR}, and each wording change can be undone on its own.`,
    );
  });
}

function setItem(
  items: ProgressItem['items'],
  index: number,
  state: ProgressItem['items'][number]['state'],
  text?: string,
) {
  const item = items[index];
  if (!item) return;
  item.state = state;
  if (text) item.text = text;
}

export const hartwellAudit: Scenario = {
  id: 'hartwell',
  label: 'hartwell-site · Autonomous redesign',
  beats: [
    {
      id: 'seed',
      atMs: 0,
      label: '0s · Looking at every page',
      apply: (s, ctx) => {
        s.routes = [
          '/',
          '/services',
          '/services/packages',
          '/about',
          '/obituaries',
          '/contact',
        ].map((path) => ({
          path,
          depth: path.split('/').length - 2,
          status: 'queued' as const,
          issues: 0,
        }));
        s.nowText = 'Reading every page';
        ctx.say('Looking at the whole site first, page by page.');
      },
    },
    {
      id: 'lookfeel',
      atMs: 4 * S,
      label: '4s · Look and feel mismatch',
      apply: (s, ctx) => {
        for (const r of s.routes) r.status = 'done';
        s.findings.push({
          id: 'f-hartwell-look',
          runId: s.runId,
          severity: 3,
          lens: 'look-and-feel',
          title: 'The look reads as celebratory',
          finding:
            'hot pink, confetti shapes and a bouncy font read as a party, which can feel hurtful to a grieving family.',
          fix: 'A calmer palette, a serif for headings and no confetti.',
          route: '/',
          agreement: {
            agreeing: 5,
            total: 5,
            who: ['Novice', 'Power user', 'Accessibility', 'Visual design', 'Content'],
          },
          evidence: ['Brief: families who just lost someone', 'Palette: #FF3EA5 on white'],
          stepIndex: 6,
          atMs: 4 * S,
          status: 'open',
        });
        ctx.post({ type: 'lookfeel', text: copy.fitts.redesign });
        s.activity = 'redesigning';
        s.nowText = 'Mocking up calmer directions';
      },
    },
    {
      id: 'directions',
      atMs: 9 * S,
      label: '9s · Three directions',
      apply: (_s, ctx) => {
        ctx.say(
          ctx.asks || ctx.mode === 'plan'
            ? "I mocked up three calmer directions. Pick the one that feels right and I'll apply it."
            : 'I mocked up three calmer directions and applied the one closest to what you described: quiet and dignified. Pick another anytime.',
        );
        ctx.offerDirections(HARTWELL_DIRECTIONS, 'quiet', (id, s2, c) => applyLook(id, s2, c));
      },
    },
  ],
};

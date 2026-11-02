// @vitest-environment node
// The surprise judge (SPEC-phase4 §6B.5): the call and its
// structured answer, an unusable answer as a note, the draft that cites the event.
import { describe, expect, it } from 'vitest';
import { CostLedger } from '../../src/agent/ledger/ledger';
import { aggregate } from '../../src/agent/review/aggregate';
import { LlmCaller, LlmError } from '../../src/agent/llm/call';
import { FakeLlmClient, type Fixture } from '../../src/agent/llm/fake';
import {
  JUDGE_PERSONA,
  judgeDraft,
  judgeSurprise,
  judgeText,
  type JudgeInput,
} from '../../src/agent/review/judge';

const input: JudgeInput = {
  note: {
    kind: 'popped-up',
    measured: 'a "Rate us" sheet covering 62% of the page popped up 2.4 s after the last input',
  },
  route: '/inbox',
  frames: [
    { t: -2000, jpegBase64: 'AAA' },
    { t: 0, jpegBase64: 'BBB' },
    { t: 2000, jpegBase64: 'CCC' },
  ],
  lastAction: 'Clicked “Mom”',
  brief: { summary: 'A calm messaging app for grandparents.' },
};
const ctx = { runId: 'run-1', projectId: 'demo-chat', contributor: false, allowed: () => true };
const answer = (outputText: string): Fixture => ({
  name: 'judge-surprise',
  model: 'muse-wonder-1.0',
  recordedAt: '2026-11-02T00:00:00.000Z',
  response: {
    id: 'r',
    model: 'muse-wonder-1.0',
    output: [],
    outputText,
    usage: { input: 100, cached: 0, output: 20, reasoning: 0 },
  } as never,
});

describe('the judge call', () => {
  it('frames labeled by time, the last action and the brief; task review, reasoning low', async () => {
    const client = new FakeLlmClient([
      answer(
        '{"expected":false,"why":"A sheet covers the chat the moment it opens.","severity":3,"heuristic":"H3"}',
      ),
    ]);
    const v = await judgeSurprise(
      new LlmCaller(() => client, new CostLedger()),
      ctx,
      'muse-wonder-1.0',
      input,
    );
    expect(v).toEqual({
      expected: false,
      why: 'A sheet covers the chat the moment it opens.',
      severity: 3,
      heuristic: 'H3',
    });
    const req = client.requests[0];
    expect(req?.task).toBe('review');
    expect(req?.model).toBe('muse-wonder-1.0');
    expect(req?.reasoning?.effort).toBe('low');
    const text = JSON.stringify(req?.input);
    expect(text).toContain('Frame at −2.0 s:');
    expect(text).toContain('Frame at +2.0 s:');
    expect(text).toContain('data:image/jpeg;base64,BBB');
    expect(judgeText(input)).toContain('What the person did just before: Clicked “Mom”');
    expect(judgeText(input)).toContain(
      'What the site is for: A calm messaging app for grandparents.',
    );
  });

  it('an answer that can’t be read, twice, is null (a note, never a finding)', async () => {
    const client = new FakeLlmClient([answer('not json'), answer('{"why":"no verdict"}')]);
    const v = await judgeSurprise(
      new LlmCaller(() => client, new CostLedger()),
      ctx,
      'muse-wonder-1.0',
      input,
    );
    expect(v).toBeNull();
    expect(client.requests).toHaveLength(2);
  });

  it('expected: severity 0 is kept as 0; an unknown heuristic is dropped', async () => {
    const client = new FakeLlmClient([
      answer(
        '{"expected":true,"why":"It opened because they tapped it.","severity":0,"heuristic":"H99"}',
      ),
    ]);
    const v = await judgeSurprise(new LlmCaller(() => client, new CostLedger()), ctx, 'm', input);
    expect(v).toEqual({
      expected: true,
      why: 'It opened because they tapped it.',
      severity: 0,
      heuristic: null,
    });
  });

  it('the draft cites the event as its evidence and counts as the Judge', () => {
    const d = judgeDraft(
      { kind: 'popped-up', measured: input.note.measured, ref: 'rate-sheet' },
      { expected: false, why: 'A sheet covers the chat.', severity: 3, heuristic: 'H3' },
      '/inbox#surprise-1',
    );
    expect(d).toMatchObject({
      title: 'Something pops up without being asked',
      severity: 3,
      heuristic: 'H3',
      elementRef: 'rate-sheet',
      evidenceIds: ['/inbox#surprise-1'],
      evidence: [input.note.measured],
    });
    expect(JUDGE_PERSONA).toBe('Judge');
  });
});

describe('the aggregator and the judge (§6B.5), and the bench noise fixes', () => {
  const stepOf = () => ({ stepIndex: 1, atMs: 0 });
  const draft = (evidenceIds: string[]) =>
    judgeDraft(
      { kind: 'popped-up', measured: 'a sheet covering 62% of the page popped up', ref: 'rate' },
      { expected: false, why: 'A sheet covers the chat.', severity: 3, heuristic: 'H3' },
      evidenceIds[0] ?? '',
    );

  it('a judge’s draft citing the surprise it judged is shown (one reviewer + the measured event)', () => {
    const f = aggregate({
      runId: 'run-1',
      probes: [],
      reviews: [{ route: '/', persona: JUDGE_PERSONA, drafts: [draft(['obs-12'])] }],
      stepOf,
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ title: 'Something pops up without being asked', lane: 'shown' });
    expect(f[0]?.evidenceIds).toContain('obs-12');
  });

  it('one other reviewer alone, citing nothing measured, isn’t shown', () => {
    const f = aggregate({
      runId: 'run-1',
      probes: [],
      reviews: [
        { route: '/', persona: 'Grandparent', drafts: [{ ...draft(['x']), evidenceIds: [] }] },
      ],
      stepOf,
    });
    expect(f.every((x) => x.lane !== 'shown')).toBe(true);
  });

  it('a broken link’s target page isn’t audited as a page; the link is still a finding', () => {
    const f = aggregate({
      runId: 'run-1',
      probes: [
        {
          evidenceId: 'e1',
          probe: 'links',
          route: '/',
          pass: false,
          items: [{ ref: 'help', selector: '', measured: '/help returns 404', expected: '' }],
        },
        {
          evidenceId: 'e2',
          probe: 'axe',
          route: '/help',
          pass: false,
          items: [
            {
              ref: 'e1',
              selector: 'html',
              measured: '<html> element must have a lang attribute',
              expected: '',
            },
          ],
        },
      ],
      reviews: [],
      stepOf,
    });
    expect(f.map((x) => x.route)).toEqual(['/']);
  });

  it('the same problem in two phone-size cells is one finding', () => {
    const tap = (device: string, evidenceId: string) => ({
      evidenceId,
      probe: 'target-size' as const,
      route: '/settings',
      pass: false,
      device,
      items: [
        {
          ref: 'settings-contacts',
          selector: '',
          measured: '20×20px',
          expected: 'at least 24×24px',
        },
      ],
    });
    const f = aggregate({
      runId: 'run-1',
      probes: [tap('phone', 'a'), tap('phone-small', 'b')],
      reviews: [],
      stepOf,
      cells: [
        {
          id: 'phone-small',
          label: 'Small phone',
          width: 320,
          height: 640,
          mobile: true,
          touch: true,
        },
      ],
    });
    expect(f).toHaveLength(1);
  });
});

describe('U5a: the judge waits while Meta’s models can’t be reached', () => {
  it('an unreachable call waits for the models, then the same judgement comes back (never a fall-through)', async () => {
    let down = true;
    let release: () => void = () => undefined;
    const back = new Promise<void>((r) => (release = r));
    const sent: string[] = [];
    const client = {
      respond: () => {
        sent.push('call');
        if (down) return Promise.reject(new LlmError('fetch failed', undefined, true));
        return Promise.resolve(
          answer('{"expected":false,"why":"It covers the page.","severity":3,"heuristic":"H3"}')
            .response,
        );
      },
    };
    const caller = new LlmCaller(() => client, new CostLedger(), {
      retries: 0,
      baseDelayMs: 1,
      waitForModels: () => back,
    });
    let done = false;
    const pending = judgeSurprise(caller, ctx, 'muse-wonder-1.0', input).then((v) => {
      done = true;
      return v;
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(done).toBe(false);
    down = false;
    release();
    await expect(pending).resolves.toMatchObject({ expected: false, severity: 3 });
    expect(sent.length).toBeGreaterThanOrEqual(2);
  });
});

describe('the judge’s moment joins the probe finding for the same thing (bench:chat, Nov 2)', () => {
  const stepOf = () => ({ stepIndex: 1, atMs: 0 });
  const judged = (ref: string | null) => ({
    ...judgeDraft(
      { kind: 'popped-up', measured: 'a dialog ("Rate us") popped up', ref: ref ?? '' },
      { expected: false, why: 'A sheet covers the inbox.', severity: 3, heuristic: 'H3' as const },
      'obs-3',
    ),
    elementRef: ref,
  });

  it('same element on the same page: one finding, with the Judge among its voices', () => {
    const f = aggregate({
      runId: 'run-1',
      probes: [
        {
          evidenceId: 'e1',
          probe: 'keyboard',
          route: '/',
          pass: false,
          items: [
            {
              ref: 'rate-dialog',
              selector: 'div',
              measured: 'Esc doesn\'t close the "Rate us" dialog',
              expected: '',
            },
          ],
        },
      ],
      reviews: [{ route: '/', persona: JUDGE_PERSONA, drafts: [judged('rate-dialog')] }],
      stepOf,
    });
    expect(f).toHaveLength(1);
    expect(f[0]?.agreement.who).toContain('Judge');
    expect(f[0]?.evidenceIds).toContain('obs-3');
  });

  it('no element: it joins the same page’s surprise finding', () => {
    const f = aggregate({
      runId: 'run-1',
      probes: [
        {
          evidenceId: 'e2',
          probe: 'surprise',
          route: '/compose/confirm',
          pass: false,
          items: [
            {
              ref: 'compose-send',
              selector: 'a',
              measured: '"Send Text" moved 58 px as it was tapped',
              expected: '',
            },
          ],
        },
      ],
      reviews: [{ route: '/compose/confirm', persona: JUDGE_PERSONA, drafts: [judged(null)] }],
      stepOf,
    });
    expect(f).toHaveLength(1);
  });
});

describe('a judged jump doesn’t join another problem on the same row (bench:android, Nov 2)', () => {
  it('stays its own finding beside the overlapping-rows probe finding', () => {
    const jump = {
      ...judgeDraft(
        {
          kind: 'jumped',
          measured: '"Margherita" jumped 290 px down',
          ref: 'menu-row-favorite-margherita',
        },
        {
          expected: false,
          why: 'The menu shifts as a banner lands.',
          severity: 3,
          heuristic: 'H3',
        },
        'obs-48',
      ),
    };
    const f = aggregate({
      runId: 'run-1',
      probes: [
        {
          evidenceId: 'e1',
          probe: 'android-duplicate-bounds',
          route: '/',
          pass: false,
          items: [
            {
              ref: 'menu-row-favorite-margherita',
              selector: 'ViewGroup',
              measured: 'two tap targets in exactly the same place',
              expected: '',
            },
          ],
        },
      ],
      reviews: [{ route: '/', persona: JUDGE_PERSONA, drafts: [jump] }],
      stepOf: () => ({ stepIndex: 1, atMs: 0 }),
    });
    expect(f.map((x) => x.title).sort()).toEqual([
      'The page jumps while you use it',
      'Two controls sit in the same place',
    ]);
  });
});

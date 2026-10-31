// @vitest-environment node
import type { Brief, RunState } from '@fitts/schema';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CostLedger } from '../../src/agent/ledger/ledger';
import { LlmCaller } from '../../src/agent/llm/call';
import { FakeLlmClient, type Fixture } from '../../src/agent/llm/fake';
import {
  interviewInput,
  interviewTurn,
  MAX_QUESTIONS,
  parseTurn,
} from '../../src/agent/interview/interview';
import {
  describeDirection,
  parseDirections,
  parseThemeFit,
  themeFit,
} from '../../src/agent/review/themefit';
import { testDirection } from './design';
import { redesignTask } from '../../src/agent/fix/redesign';

const state = (over: Partial<RunState> = {}): RunState =>
  ({
    runId: 'run-1',
    projectId: 'demo-chat',
    phase: 'interview',
    brief: {},
    chat: [
      { id: 'a', type: 'fitts.message', text: 'Hi Allen! What’s it for?' },
      { id: 'b', type: 'brief' },
      {
        id: 'c',
        type: 'user.message',
        text: 'A messaging app so my grandparents can text the family.',
      },
    ],
    ...over,
  }) as RunState;

describe('interview turns', () => {
  it('parses a turn: fields as summaries, empty ones dropped, at most 3 quick replies', () => {
    const turn = parseTurn(
      JSON.stringify({
        say: 'Got it. I can see the compose screen right now. Where do they get stuck?',
        fields: {
          for: 'Family messaging',
          who: 'Older adults, some with low vision',
          pain: null,
          feel: '  ',
        },
        quickReplies: ['a', 'b', 'c', 'd'],
        ready: true,
      }),
    );
    expect(turn.fields).toEqual({
      for: 'Family messaging',
      who: 'Older adults, some with low vision',
    });
    expect(turn.quickReplies).toEqual(['a', 'b', 'c']);
    expect(turn.ready).toBe(true);
    expect(() => parseTurn('{"say":""}')).toThrow();
    expect(() => parseTurn('not json')).toThrow();
  });

  it('sends the conversation, the brief, the screen and the click path', () => {
    const input = interviewInput({
      state: state({ brief: { for: 'Family messaging' } }),
      shot: 'JPEG',
      page: { path: '/compose', title: 'Chat', headings: ['New message'] },
      path: ['/compose', '/compose/recipient'],
    }) as { role: string; content: unknown }[];
    expect(input.map((m) => m.role)).toEqual(['assistant', 'user', 'user']);
    const last = input.at(-1)?.content as { type: string; text?: string }[];
    expect(last.map((c) => c.type)).toEqual(['input_text', 'input_image']);
    expect(last[0]?.text).toContain('Brief so far: {"for":"Family messaging"}');
    expect(last[0]?.text).toContain(`Questions asked so far: 1 of ${MAX_QUESTIONS}`);
    expect(last[0]?.text).toContain('Path the user clicked: /compose → /compose/recipient');
  });

  it('runs one turn through the caller (recorded fixture shape)', async () => {
    const fake = new FakeLlmClient([
      {
        name: 'interview-turn',
        model: 'muse-spark-1.3-contributor',
        recordedAt: '2026-10-30',
        response: {
          outputText: JSON.stringify({
            say: 'Got it. Where do they get stuck?',
            fields: {
              for: 'Family messaging',
              who: 'Grandparents',
              pain: null,
              feel: null,
              flows: null,
              outOfScope: null,
            },
            quickReplies: [],
            ready: true,
          }),
          output: [],
          usage: { input: 900, cached: 0, output: 400, reasoning: 300 },
          model: 'm',
        },
      },
    ]);
    const turn = await interviewTurn(
      new LlmCaller(() => fake, new CostLedger()),
      { runId: 'run-1', projectId: 'demo-chat', contributor: true, allowed: () => true },
      'muse-spark-1.3-contributor',
      { state: state(), path: [] },
    );
    expect(turn.fields).toEqual({ for: 'Family messaging', who: 'Grandparents' });
    expect(fake.requests[0]?.task).toBe('interview');
  });

  it('a redesign the user asks for is recorded as the look', () => {
    const turn = parseTurn(
      JSON.stringify({
        say: 'Got it, a new look. Start the audit whenever you’re ready.',
        fields: { look: 'Dark and bold, like a film poster', feel: null },
        quickReplies: [],
        ready: true,
      }),
    );
    expect(turn.fields).toEqual({ look: 'Dark and bold, like a film poster' });
  });
});

const fixture = (name: string, body: object): Fixture => ({
  name,
  model: 'm',
  recordedAt: '2026-10-30',
  response: {
    outputText: JSON.stringify(body),
    output: [],
    usage: { input: 1, cached: 0, output: 1, reasoning: 0 },
    model: 'm',
  },
});

const composed = (over: Record<string, unknown>[] = []) => ({
  directions: [
    {
      kind: 'closest',
      name: 'Ink and Signal',
      notes: 'Crisp and confident.',
      color: 'stark-mono',
      type: 'grotesk-swiss',
      shape: 'hairline',
      layout: 'swiss-grid',
      decor: [],
      motion: 'snappy',
      density: 'regular',
      hue: -1,
      brand: '#0f766e',
      headingFont: '',
      bodyFont: '',
      changes: ['Keeps the teal #0f766e as the accent, as asked.'],
    },
    {
      kind: 'further',
      name: 'Night Poster',
      notes: 'Loud and cinematic.',
      color: 'neon-dusk',
      type: 'poster',
      shape: 'hairline',
      layout: 'poster-stack',
      decor: ['three-field', 'not-a-part'],
      motion: 'cinematic',
      density: 'compact',
      hue: 180,
      brand: 'teal',
      headingFont: 'Rubik Mono One',
      bodyFont: '',
      changes: [],
    },
    {
      kind: 'unexpected',
      name: 'Garden Press',
      notes: 'Warm and literary.',
      color: 'garden',
      type: 'bookish',
      shape: 'ornate',
      layout: 'reading-column',
      decor: ['botanical'],
      motion: 'still',
      density: 'airy',
      hue: -1,
      brand: '',
      headingFont: '',
      bodyFont: '',
      changes: [],
    },
  ].map((d, i) => ({ ...d, ...(over[i] ?? {}) })),
});

describe('directions from the design library', () => {
  const ctx = { runId: 'run-1', projectId: 'p', contributor: true, allowed: () => true };
  const caller = (...fixtures: Fixture[]) => {
    const fake = new FakeLlmClient(fixtures);
    return { fake, caller: new LlmCaller(() => fake, new CostLedger()) };
  };
  const input = (brief: Brief = { for: 'A portfolio' }) => ({ brief, shots: [], inventory: [] });

  it('a mismatch composes 3 directions from library parts, with the owner’s brand and fonts', async () => {
    const { fake, caller: c } = caller(
      fixture('theme-fit', { fits: false, why: 'Too loud for recruiters.' }),
      fixture('directions', composed()),
    );
    const v = await themeFit(c, ctx, 'm', input());
    expect(v.fits).toBe(false);
    expect(v.directions.map((d) => [d.id, d.kind])).toEqual([
      ['a', 'closest'],
      ['b', 'further'],
      ['c', 'unexpected'],
    ]);
    const [a, b] = v.directions;
    expect(a?.spec.palette.accent).toBe('#0f766e');
    expect(a?.swatches).toHaveLength(4);
    expect(a?.spec.changes).toEqual(['Keeps the teal #0f766e as the accent, as asked.']);
    // Unknown decor dropped, a bad hex ignored, the named font kept, 3D noticed.
    expect(b?.spec.parts.decor).toEqual(['three-field']);
    expect(b?.spec.brand).toBeUndefined();
    expect(b?.typeface).toBe('Rubik Mono One');
    expect(b?.spec.three).toBe(true);
    const sent = JSON.stringify(fake.requests[1]?.input);
    expect(sent).toContain('- grotesk-swiss:');
    expect(sent).toContain('Best-ranked parts for this brief');
  });

  it('a fit composes nothing, unless the owner asked for a new look', async () => {
    const fits = fixture('theme-fit', { fits: true, why: 'Clean and modern.' });
    expect((await themeFit(caller(fits).caller, ctx, 'm', input())).directions).toEqual([]);
    const asked = await themeFit(
      caller(fits, fixture('directions', composed())).caller,
      ctx,
      'm',
      input({ for: 'A portfolio', look: '2007 web, but readable' }),
    );
    expect(asked.fits).toBe(false);
    expect(asked.directions).toHaveLength(3);
    const inspired = await themeFit(
      caller(fits, fixture('directions', composed())).caller,
      ctx,
      'm',
      input({ for: 'A portfolio', inspiration: 'a24films.com' }),
    );
    expect(inspired.directions).toHaveLength(3);
  });

  it('directions too alike, or unusable, fall back to three built from the library', async () => {
    const same = composed([
      {},
      { color: 'stark-mono', type: 'grotesk-swiss', shape: 'hairline', layout: 'swiss-grid' },
    ]);
    expect(() => parseDirections(JSON.stringify(same))).toThrow(/too alike/);
    const v = await themeFit(
      caller(fixture('theme-fit', { fits: false, why: 'Too loud.' }), fixture('directions', same))
        .caller,
      ctx,
      'm',
      input({ for: 'Online banking', feel: 'Trustworthy' }),
    );
    expect(v.directions).toHaveLength(3);
    expect(v.directions[0]?.spec.parts.color).toBe('trust-blue');
  });

  it('describes a direction for its mockup', () => {
    const [d] = parseDirections(JSON.stringify(composed()));
    expect(describeDirection(d!)).toContain('Shapes: hairline and sharp. Layout: asymmetric grid.');
  });

  it('tells the redesigner the owner’s wishes and the full spec', () => {
    const task = redesignTask({
      brief: {
        for: 'A portfolio',
        look: 'Dark and bold, like a film poster',
        keep: 'The teal',
        inspiration: 'a24films.com',
      },
      why: 'You asked for a new look.',
      direction: testDirection('a', 'Poster'),
      routes: ['/'],
      assets: { fontsCss: '/fitts/fonts.css', fonts: [], missing: ['Shippori Mincho'] },
    });
    expect(task).toContain('Their vision: "Dark and bold, like a film poster".');
    expect(task).toContain('Keep: "The teal".');
    expect(task).toContain('Sites they admire: a24films.com');
    expect(task).toContain('/fitts/fonts.css');
    expect(task).toContain('use the fallback stack for them: Shippori Mincho');
  });
});

describe('recorded P7 fixtures (real responses, replayed offline)', () => {
  const load = (name: string) =>
    (
      JSON.parse(
        readFileSync(join(__dirname, '../fixtures/llm/p7', `${name}.json`), 'utf8'),
      ) as Fixture
    ).response.outputText;

  it('the demo/chat first answer fills For and Who', () => {
    const turn = parseTurn(load('interview-turn'));
    expect(turn.fields.for).toBeTruthy();
    expect(turn.fields.who).toBeTruthy();
  });

  it('hartwell doesn’t fit', () => {
    const v = parseThemeFit(load('theme-fit'));
    expect(v.fits).toBe(false);
    expect(v.why).toBeTruthy();
  });
});

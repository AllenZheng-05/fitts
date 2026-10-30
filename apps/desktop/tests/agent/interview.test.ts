// @vitest-environment node
import type { RunState } from '@fitts/schema';
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
import { parseThemeFit, themeFit } from '../../src/agent/review/themefit';
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

describe('a requested redesign (brief.look)', () => {
  const caller = (verdict: object) =>
    new LlmCaller(
      () =>
        new FakeLlmClient([
          {
            name: 'theme-fit',
            model: 'm',
            recordedAt: '2026-10-30',
            response: {
              outputText: JSON.stringify(verdict),
              output: [],
              usage: { input: 1, cached: 0, output: 1, reasoning: 0 },
              model: 'm',
            },
          },
        ]),
      new CostLedger(),
    );
  const ctx = { runId: 'run-1', projectId: 'p', contributor: true, allowed: () => true };
  const input = (look?: string) => ({
    brief: { for: 'A portfolio', ...(look ? { look } : {}) },
    shots: [],
    inventory: [],
  });

  it('always gets directions: a "fits" verdict is unusable when the user asked for a new look', async () => {
    const fits = { fits: true, why: 'Clean and modern.', directions: [] };
    await expect(themeFit(caller(fits), ctx, 'm', input('2007 web'))).rejects.toThrow(
      /needs directions/,
    );
    expect((await themeFit(caller(fits), ctx, 'm', input())).fits).toBe(true);
  });

  it('tells the redesigner the owner’s vision', () => {
    const task = redesignTask({
      brief: { for: 'A portfolio', look: 'Dark and bold, like a film poster' },
      why: 'You asked for a new look.',
      direction: {
        id: 'a',
        name: 'Poster',
        swatches: ['#111111', '#f5f0e8'],
        typeface: 'Inter',
        notes: 'Bold.',
      },
      routes: ['/'],
    });
    expect(task).toContain('their vision: "Dark and bold, like a film poster"');
  });
});

describe('theme-fit verdicts', () => {
  const direction = (name: string) => ({
    id: 'x',
    name,
    swatches: ['#f4f1ec', '#2f3a3a', '#8a9a8f', 'pink'],
    typeface: 'Source Serif 4',
    notes: 'Quiet and warm.',
  });

  it('a mismatch comes with 3 directions (ids a, b, c; hex swatches only)', () => {
    const v = parseThemeFit(
      JSON.stringify({
        fits: false,
        why: 'Hot pink and confetti read as celebratory.',
        directions: [direction('Quiet stone'), direction('Soft linen'), direction('Evening')],
      }),
    );
    expect(v.fits).toBe(false);
    expect(v.directions.map((d) => d.id)).toEqual(['a', 'b', 'c']);
    expect(v.directions[0]?.swatches).toEqual(['#f4f1ec', '#2f3a3a', '#8a9a8f']);
  });

  it('a fit has no directions; a mismatch without 3 usable directions is rejected', () => {
    expect(
      parseThemeFit(
        JSON.stringify({ fits: true, why: 'Calm and clear.', directions: [direction('x')] }),
      ).directions,
    ).toEqual([]);
    expect(() =>
      parseThemeFit(
        JSON.stringify({ fits: false, why: 'Too loud.', directions: [direction('Only one')] }),
      ),
    ).toThrow();
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

  it('hartwell doesn’t fit, with 3 directions', () => {
    const v = parseThemeFit(load('theme-fit'));
    expect(v.fits).toBe(false);
    expect(v.directions).toHaveLength(3);
  });
});

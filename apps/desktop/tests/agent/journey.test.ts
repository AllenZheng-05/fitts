// @vitest-environment node
// Journeys (SPEC-phase4 §6.1): the step contract with a fake brain and a fake model: goal met,
// blocked, the 15-action ceiling, stuck pages, refs that aren't there, destructive controls
// outside the plan, and the App Model's form rules (one invalid value per form, then valid).
import type { AppPage, Journey } from '@fitts/schema';
import { describe, expect, it } from 'vitest';
import type { Action } from '../../src/agent/crawler/brain';
import {
  MAX_JOURNEY_ACTIONS,
  SparkJourneyBrain,
  fieldFor,
  formValue,
  journeyOrder,
  runJourney,
  type JourneyAction,
  type JourneyBrain,
  type JourneyDeps,
} from '../../src/agent/crawler/journey';
import { FakeLlmClient } from '../../src/agent/llm/fake';
import { LlmCaller } from '../../src/agent/llm/call';
import { CostLedger } from '../../src/agent/ledger/ledger';
import type { AxSnapshot } from '../../src/agent/protocol';

const journey: Journey = {
  id: 'send',
  name: 'Send a message to Grandma',
  goal: 'The thread shows the new message',
  start: '/compose',
  steps: ['Tap Grandma', 'Tap NEXT', 'Type a message', 'Tap Create Message', 'Tap Send Text'],
  pages: ['/compose', '/compose/recipient', '/compose/confirm'],
  priority: 1,
  source: 'code',
};

const page = (path: string, nodes: AxSnapshot['nodes'], headings: string[] = []): AxSnapshot => ({
  url: `http://localhost:5173${path}`,
  path,
  title: path,
  headings,
  nodes,
  hasPassword: false,
});

/** A site whose pages change as actions land, so the runner sees progress. */
function site(script: Record<string, AxSnapshot>, start = '/compose') {
  let path = start;
  const performed: (Exclude<Action, { kind: 'done' }> | 'back')[] = [];
  const deps = (brain: JourneyBrain, extra: Partial<JourneyDeps> = {}): JourneyDeps => ({
    brain,
    snapshot: () => Promise.resolve(script[path] ?? page(path, [])),
    screenshot: () => Promise.resolve('AAAA'),
    perform: (action) => {
      performed.push(action);
      if (action.kind === 'navigate') path = action.path;
      else if (action.kind === 'click') {
        const to = /^(.+)->(.+)$/.exec(action.ref);
        if (to) path = to[2]!;
      }
      return Promise.resolve(path);
    },
    back: () => {
      performed.push('back');
      path = start;
      return Promise.resolve(path);
    },
    stopped: () => false,
    ...extra,
  });
  return { deps, performed, where: () => path };
}

const scripted = (actions: JourneyAction[]): JourneyBrain => {
  let i = 0;
  return { next: () => Promise.resolve(actions[Math.min(i++, actions.length - 1)]!) };
};

describe('runJourney', () => {
  it('follows the brain through the pages and ends when the goal is met', async () => {
    const s = site({
      '/compose': page('/compose', [
        { ref: 'grandma->/compose/recipient', role: 'button', name: 'Grandma' },
      ]),
      '/compose/recipient': page('/compose/recipient', [
        { ref: 'compose-body', role: 'textbox', name: 'Message' },
        { ref: 'create->/compose/confirm', role: 'button', name: 'Create Message' },
      ]),
      '/compose/confirm': page('/compose/confirm', [], ['Sent']),
    });
    const brain = scripted([
      {
        kind: 'click',
        ref: 'grandma->/compose/recipient',
        name: 'Grandma',
        why: 'Picking Grandma',
      },
      { kind: 'type', ref: 'compose-body', name: 'Message', text: 'hi', why: 'Writing' },
      { kind: 'click', ref: 'create->/compose/confirm', name: 'Create Message', why: 'Creating' },
      { kind: 'goal_met', why: 'The page says Sent' },
    ]);
    const r = await runJourney(s.deps(brain), journey);
    expect(r.status).toBe('done');
    expect(r.steps).toBe(3);
    expect(r.route).toBe('/compose/confirm');
    expect(r.trace).toEqual([
      'tapped Grandma → /compose/recipient',
      'typed in Message',
      'tapped Create Message → /compose/confirm',
      'goal met: The page says Sent',
    ]);
  });

  it('reports blocked with the brain’s reason', async () => {
    const s = site({ '/compose': page('/compose', []) });
    const r = await runJourney(
      s.deps(scripted([{ kind: 'blocked', reason: 'a login wall' }])),
      journey,
    );
    expect(r).toMatchObject({ status: 'blocked', reason: 'a login wall', steps: 0 });
  });

  it('fails after 15 actions when the goal is never met', async () => {
    let n = 0;
    const s = site({});
    const brain: JourneyBrain = {
      next: () => Promise.resolve({ kind: 'navigate', path: `/p${n++}`, why: 'Looking' }),
    };
    const r = await runJourney(s.deps(brain), journey);
    expect(r.status).toBe('failed');
    expect(r.steps).toBe(MAX_JOURNEY_ACTIONS);
    expect(r.reason).toMatch(/15 actions/);
  });

  it('fails as stuck when three actions change nothing on the page', async () => {
    const s = site({
      '/compose': page('/compose', [{ ref: 'x', role: 'button', name: 'Nothing' }]),
    });
    const r = await runJourney(
      s.deps(scripted([{ kind: 'click', ref: 'x', name: 'Nothing', why: 'Trying' }])),
      journey,
    );
    expect(r.status).toBe('failed');
    expect(r.reason).toMatch(/nothing changed after 3 actions/);
    expect(s.performed.length).toBe(3);
  });

  it('skips a ref the page doesn’t have and refuses a destructive control outside the plan', async () => {
    const s = site({
      '/compose': page('/compose', [{ ref: 'del', role: 'button', name: 'Delete conversation' }]),
    });
    const r = await runJourney(
      s.deps(
        scripted([
          { kind: 'click', ref: 'ghost', name: 'Ghost', why: 'Trying' },
          { kind: 'click', ref: 'del', name: 'Delete conversation', why: 'Clearing' },
        ]),
      ),
      journey,
    );
    expect(r.status).toBe('blocked');
    expect(r.reason).toMatch(/Delete conversation/);
    expect(s.performed).toEqual([]);
    expect(r.trace[0]).toMatch(/no ghost on the page/);
  });

  it('types one invalid value per form from the App Model, then valid ones', async () => {
    const forms: AppPage['forms'] = [
      {
        name: 'add-contact',
        fields: [
          { name: 'Email', type: 'email', required: true },
          { name: 'Name', type: 'text', required: false },
        ],
        file: 'src/pages/Contacts.tsx',
        line: 10,
      },
    ];
    const s = site({
      '/contacts': page('/contacts', [
        { ref: 'email', role: 'textbox', name: 'Email' },
        { ref: 'name', role: 'textbox', name: 'Name' },
      ]),
    });
    const brain = scripted([
      { kind: 'type', ref: 'email', name: 'Email', text: 'a@b.c', why: 'Email' },
      { kind: 'type', ref: 'name', name: 'Name', text: 'x', why: 'Name' },
      { kind: 'type', ref: 'email', name: 'Email', text: 'a@b.c', why: 'Email again' },
      { kind: 'goal_met', why: 'done' },
    ]);
    // Each typing changes the page a little (a value), so the stuck rule doesn't fire.
    let typed = 0;
    const deps = s.deps(brain, {
      forms: () => forms,
      snapshot: () =>
        Promise.resolve(
          page(
            '/contacts',
            [
              { ref: 'email', role: 'textbox', name: 'Email', value: String(typed) },
              { ref: 'name', role: 'textbox', name: 'Name' },
            ],
            [`typed ${typed}`],
          ),
        ),
      perform: (action) => {
        s.performed.push(action);
        typed += 1;
        return Promise.resolve('/contacts');
      },
    });
    const r = await runJourney(deps, { ...journey, start: '/contacts' });
    expect(r.status).toBe('done');
    const texts = s.performed.map((a) => (a !== 'back' && a.kind === 'type' ? a.text : '?'));
    // The required email first gets the invalid (empty) value, then the form's valid ones.
    expect(texts).toEqual(['', 'fitts-test Name', 'fitts-test@example.com']);
  });

  it('stops when the run stops', async () => {
    const s = site({ '/compose': page('/compose', []) });
    const r = await runJourney(
      s.deps(scripted([{ kind: 'goal_met', why: 'x' }]), { stopped: () => true }),
      journey,
    );
    expect(r.status).toBe('blocked');
  });
});

describe('formValue and fieldFor', () => {
  it('knows valid and invalid values by type and rule', () => {
    expect(formValue({ name: 'Email', type: 'email', required: false }, false)).toBe(
      'fitts-test@example.com',
    );
    expect(formValue({ name: 'Email', type: 'email', required: false }, true)).toBe('not-an-email');
    expect(formValue({ name: 'Age', type: 'number', required: true }, true)).toBe('');
    expect(formValue({ name: 'Age', type: 'number', required: false }, true)).toBe('abc');
    expect(
      formValue({ name: 'Code', type: 'text', required: false, rule: '^[A-Z]{3}$' }, true),
    ).toBe('!');
    expect(formValue({ name: 'Note', type: 'textarea', required: false }, false)).toBe(
      'fitts-test Note',
    );
  });

  it('matches a control to a form field by name, loosely', () => {
    const forms: AppPage['forms'] = [
      {
        name: 'f',
        fields: [{ name: 'email address', type: 'email', required: true }],
        file: 'x',
        line: 1,
      },
    ];
    expect(fieldFor(forms, 'Email Address')?.field.type).toBe('email');
    expect(fieldFor(forms, 'Your email address')?.field.type).toBe('email');
    expect(fieldFor(forms, 'Phone')).toBeUndefined();
    expect(fieldFor(undefined, 'Email')).toBeUndefined();
  });
});

describe('journeyOrder', () => {
  it('runs priority 1 then 2 first, 3 later, and leaves out disabled or gated ones', () => {
    const j = (id: string, priority: 1 | 2 | 3, extra: Partial<Journey> = {}): Journey => ({
      ...journey,
      id,
      priority,
      ...extra,
    });
    const { first, later } = journeyOrder([
      j('c', 3),
      j('b', 2),
      j('a', 1),
      j('off', 1, { enabled: false }),
      j('login', 1, { needs: ['login'] }),
      j('data', 2, { needs: ['data'] }),
    ]);
    expect(first.map((x) => x.id)).toEqual(['a', 'b', 'data']);
    expect(later.map((x) => x.id)).toEqual(['c']);
  });
});

describe('SparkJourneyBrain', () => {
  const caller = (
    fixtures: {
      name: string;
      response: {
        outputText: string;
        output: unknown[];
        usage: { input: number; cached: number; output: number; reasoning: number };
      };
    }[],
  ) => {
    const client = new FakeLlmClient(fixtures as never);
    return { client, caller: new LlmCaller(() => client, new CostLedger()) };
  };
  const ctx = () => ({ runId: 'r', projectId: 'p', contributor: false, allowed: () => true });
  const snap = page('/compose', [{ ref: 'next', role: 'button', name: 'NEXT' }]);
  const call = (name: string, args: Record<string, unknown>) => ({
    outputText: '',
    output: [{ type: 'function_call', name, arguments: JSON.stringify(args) }],
    usage: { input: 1, cached: 0, output: 1, reasoning: 0 },
  });

  it('sends the goal, plan, history, controls and the screenshot, and maps the tool call', async () => {
    const { client, caller: c } = caller([
      { name: 'any', response: call('click', { ref: 'next', why: 'Going to step 2' }) },
    ]);
    const brain = new SparkJourneyBrain(c, ctx, () => 'muse-spark-1.3');
    const a = await brain.next({
      journey,
      snapshot: snap,
      shot: 'AAAA',
      history: ['tapped Grandma'],
    });
    expect(a).toEqual({ kind: 'click', ref: 'next', name: 'NEXT', why: 'Going to step 2' });
    const req = client.requests[0]!;
    expect(req.task).toBe('crawl');
    expect(req.reasoning).toEqual({ effort: 'low' });
    const content = (
      req.input as { content: { type: string; text?: string; image_url?: string }[] }[]
    )[0]!.content;
    expect(content[0]!.text).toContain('Goal: Send a message to Grandma');
    expect(content[0]!.text).toContain('1. Tap Grandma');
    expect(content[0]!.text).toContain('tapped Grandma');
    expect(content[0]!.text).toContain('<untrusted_page_content>');
    expect(content[1]).toEqual({ type: 'input_image', image_url: 'data:image/jpeg;base64,AAAA' });
  });

  it('maps goal_met, blocked, back and a bad ref', async () => {
    const { caller: c } = caller([
      { name: 'any', response: call('goal_met', { why: 'Sent shows' }) },
      { name: 'any', response: call('blocked', { reason: 'login' }) },
      { name: 'any', response: call('back', { why: 'wrong page' }) },
      { name: 'any', response: call('click', { ref: 'nope', why: 'x' }) },
      { name: 'any', response: call('navigate', { path: 'https://evil.example', why: 'x' }) },
    ]);
    const brain = new SparkJourneyBrain(c, ctx, () => 'm');
    const input = { journey, snapshot: snap, history: [] };
    expect(await brain.next(input)).toEqual({ kind: 'goal_met', why: 'Sent shows' });
    expect(await brain.next(input)).toEqual({ kind: 'blocked', reason: 'login' });
    expect(await brain.next(input)).toEqual({ kind: 'back', why: 'wrong page' });
    expect((await brain.next(input)).kind).toBe('blocked');
    expect((await brain.next(input)).kind).toBe('blocked');
  });
});

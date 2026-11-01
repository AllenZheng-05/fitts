// @vitest-environment node
// Pass 2 of Understand (SPEC-phase4 §3.2) on the recorded fixture for demo/chat, the owner's
// corrections (§3.3), the interview's context, and the run's `model` source fallback.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CostLedger } from '../../src/agent/ledger/ledger';
import { LlmCaller } from '../../src/agent/llm/call';
import { FakeLlmClient, type Fixture } from '../../src/agent/llm/fake';
import { appModelContext } from '../../src/agent/interview/interview';
import { extract } from '../../src/main/understand/extract';
import {
  patchFromMessage,
  summaryOf,
  understand,
  understandInput,
  validate,
  applyPatches,
  plainSummary,
  TOKEN_CAP,
} from '../../src/agent/understand/understand';
import { buildModel } from '../../src/agent/understand/runner';
import { fittsMd } from '../../src/main/understand/fitts-md';

const DEMO = resolve(__dirname, '../../../../demo/chat');
const FIXTURES = resolve(__dirname, '../fixtures/llm');
const fixture = (name: string): Fixture =>
  JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8')) as Fixture;
const ctx = { runId: 'run-1', projectId: 'demo-chat', contributor: true, allowed: () => true };
const recorded = existsSync(join(FIXTURES, 'understand.json'));

describe('Pass 2 on demo/chat (recorded fixture)', () => {
  it.skipIf(!recorded)(
    'the model names 8 pages with features and at least 4 journeys, one to send a message',
    async () => {
      const client = new FakeLlmClient([fixture('understand')]);
      const caller = new LlmCaller(() => client, new CostLedger());
      const x = extract(DEMO);
      const raw = await understand(caller, ctx, 'muse-spark-1.3', {
        extracted: x,
        readme: '',
        pkg: { name: 'demo-chat' },
        repoMap: '',
        routeFiles: [],
      });
      const v = validate(x, raw, (f) => x.files.includes(f));
      expect(v.modeled).toBe(true);
      expect(v.pages).toHaveLength(8);
      expect(v.pages.filter((p) => p.features.length > 0).length).toBeGreaterThanOrEqual(6);
      expect(v.journeys.length).toBeGreaterThanOrEqual(4);
      expect(v.journeys.some((j) => /send/i.test(j.name) && /message/i.test(j.name))).toBe(true);
      expect(v.summary.length).toBeGreaterThan(80);
      const req = client.requests[0];
      expect(req?.task).toBe('understand');
      expect(req?.reasoning?.effort).toBe('medium');
    },
  );

  it('the input wraps everything as untrusted data and drops the README past the cap', () => {
    const x = extract(DEMO);
    const small = understandInput({
      extracted: x,
      readme: 'hi',
      pkg: {},
      repoMap: 'map',
      routeFiles: [],
    });
    expect(small.startsWith('<untrusted_project_data>')).toBe(true);
    expect(small).toContain('readme: hi');
    const huge = understandInput({
      extracted: x,
      readme: 'r'.repeat(10),
      pkg: {},
      repoMap: 'x'.repeat(TOKEN_CAP * 4 + 10),
      routeFiles: [],
    });
    expect(huge).not.toContain('readme:');
  });

  it('builds the whole model offline from Pass 1 (fresh), and reuses main’s cache when the route files match', async () => {
    const ask = { projectId: 'demo-chat', folder: DEMO, commit: 'abc', patches: [] };
    const first = await buildModel(ask, undefined);
    expect(first.fresh).toBe(true);
    expect(first.modeled).toBe(false);
    expect(first.model.pages).toHaveLength(8);
    expect(Object.keys(first.hashes)).toEqual(expect.arrayContaining(['src/pages/Compose.tsx']));
    const again = await buildModel(
      {
        ...ask,
        commit: 'abc+dirty',
        cached: { model: first.model, hashes: first.hashes, modeled: true },
      },
      undefined,
    );
    expect(again.fresh).toBe(false);
    expect(again.model.commit).toBe('abc+dirty');
    // An offline cache is rebuilt once a model is available.
    const client = new FakeLlmClient([]);
    const caller = new LlmCaller(() => client, new CostLedger());
    const third = await buildModel(
      { ...ask, cached: { model: first.model, hashes: first.hashes, modeled: false } },
      { online: true, caller, ctx, model: 'muse-spark-1.3' },
    );
    expect(third.fresh).toBe(true);
  });
});

describe('the owner corrects the map (§3.3)', () => {
  it('turns the reply into patches it can check, and a line back', async () => {
    const reply = {
      addJourney: [
        {
          id: 'photo',
          name: 'Send Grandma a photo',
          goal: 'The photo shows in the thread',
          start: '/compose',
          steps: ['Tap Grandma', 'Attach a photo', 'Send'],
          pages: ['/compose', '/nowhere'],
          priority: 1,
          needs: [],
        },
        {
          id: 'ghost',
          name: 'Visit the admin',
          goal: 'x',
          start: '/admin',
          steps: ['a', 'b'],
          pages: [],
          priority: 2,
          needs: [],
        },
      ],
      dropJourney: ['fill-contacts-add-contacts', 'not-a-journey'],
      priority: [{ id: 'fill-contacts-add-contacts', priority: 3 }],
      outOfScope: ['/settings', '/nowhere'],
      say: 'Added the photo journey and left settings out.',
    };
    const client = new FakeLlmClient([
      {
        name: 'understand-patch',
        model: 'm',
        recordedAt: '',
        response: {
          outputText: JSON.stringify(reply),
          output: [],
          usage: { input: 1, cached: 0, output: 1, reasoning: 0 },
          model: 'm',
        },
      },
    ]);
    const caller = new LlmCaller(() => client, new CostLedger());
    const x = extract(DEMO);
    const v = validate(x, null, (f) => x.files.includes(f));
    const model = {
      version: 1 as const,
      projectId: 'demo-chat',
      commit: 'abc',
      kind: 'web' as const,
      stack: x.stack,
      ...v,
      tokens: [],
      apis: [],
      breakpoints: [],
      media: x.media,
      sensitive: [],
    };
    const { patches, say } = await patchFromMessage(
      caller,
      ctx,
      'm',
      model,
      'Add sending a photo; skip settings',
    );
    expect(say).toBe('Added the photo journey and left settings out.');
    expect(patches[0]).toMatchObject({
      op: 'addJourney',
      journey: { id: 'photo', pages: ['/compose'], source: 'owner' },
    });
    expect(patches.slice(1)).toEqual([
      { op: 'dropJourney', id: 'fill-contacts-add-contacts' },
      { op: 'priority', id: 'fill-contacts-add-contacts', priority: 3 },
      { op: 'outOfScope', routes: ['/settings'] },
    ]);
  });
});

describe('what the UI and the interview get', () => {
  it('summaryOf keeps the summary, pages with features and journeys, not the whole model', () => {
    const x = extract(DEMO);
    const v = validate(x, null, (f) => x.files.includes(f));
    const s = summaryOf(
      {
        version: 1,
        projectId: 'demo-chat',
        commit: 'abc',
        kind: 'web',
        stack: x.stack,
        ...v,
        tokens: x.tokens,
        apis: x.apis,
        breakpoints: [],
        media: x.media,
        sensitive: [],
      },
      false,
    );
    expect(s.pages).toHaveLength(8);
    expect(s.pages.find((p) => p.route === '/contacts')).toEqual({
      route: '/contacts',
      file: 'src/pages/Contacts.tsx',
      source: 'code',
      features: [],
      forms: 1,
    });
    expect(s.modeled).toBe(false);
    expect('apis' in s).toBe(false);
    const text = appModelContext(s);
    expect(text).toContain('read without a model');
    expect(text).toContain('Pages (8): /, /compose');
    expect(text).toContain('Fill in the contacts-add form on /contacts (priority 2)');
  });
});

describe('validation (§3.2)', () => {
  const x = extract(DEMO);
  const exists = (f: string) => x.files.includes(f);

  it('keeps what the code confirms and drops the rest, with a note each', () => {
    const v = validate(
      x,
      {
        summary: 'A family messaging app.',
        pages: [
          {
            route: '/compose',
            title: 'New message',
            features: [
              {
                id: 'pick',
                name: 'Pick a contact',
                description: 'Chips.',
                files: ['src/pages/Compose.tsx'],
              },
            ],
          },
          {
            route: '/contacts',
            title: 'Contacts',
            features: [
              {
                id: 'ghost',
                name: 'Import contacts',
                description: 'Nope.',
                files: ['src/pages/Import.tsx'],
              },
            ],
          },
          { route: '/admin', title: 'Admin', features: [] },
        ],
        journeys: [
          {
            id: 'send',
            name: 'Send a message to Grandma',
            goal: 'Sent',
            start: '/compose',
            steps: ['Tap Grandma', 'Tap NEXT'],
            pages: ['/compose', '/nowhere'],
            priority: 1,
            needs: [],
          },
          {
            id: 'bad',
            name: 'Visit the admin',
            goal: 'x',
            start: '/admin',
            steps: ['a', 'b'],
            pages: [],
            priority: 2,
            needs: [],
          },
          {
            id: 'short',
            name: 'One step',
            goal: 'x',
            start: '/',
            steps: ['only'],
            pages: [],
            priority: 2,
            needs: [],
          },
        ],
        notes: ['I guessed the thread route.'],
      },
      exists,
    );
    expect(v.modeled).toBe(true);
    expect(v.summary).toBe('A family messaging app.');
    expect(v.pages.find((p) => p.route === '/compose')?.title).toBe('New message');
    expect(v.pages.find((p) => p.route === '/compose')?.features.map((f) => f.id)).toEqual([
      'pick',
    ]);
    expect(v.pages.find((p) => p.route === '/contacts')?.features).toEqual([]);
    expect(v.pages.some((p) => p.route === '/admin')).toBe(false);
    expect(v.journeys.map((j) => j.id)).toEqual(['send', 'fill-contacts-add-contacts']);
    expect(v.journeys[0]?.pages).toEqual(['/compose']);
    expect(v.notes).toEqual(
      expect.arrayContaining([
        'I couldn’t confirm the files behind “Import contacts” on /contacts, so I left it out.',
        'I couldn’t confirm a page at /admin, so I left it out.',
        'I couldn’t confirm where “Visit the admin” starts (/admin), so I left it out.',
        'I couldn’t confirm the steps of “One step”, so I left it out.',
        'I guessed the thread route.',
      ]),
    );
  });

  it('without a model: Pass 1 alone, a plain summary, and a journey per form', () => {
    const v = validate(x, null, exists);
    expect(v.modeled).toBe(false);
    expect(v.summary).toBe(plainSummary(x));
    expect(v.summary).toMatch(/^demo-chat is a Vite \+ React app with 8 pages/);
    expect(v.journeys).toEqual([
      expect.objectContaining({
        id: 'fill-contacts-add-contacts',
        start: '/contacts',
        priority: 2,
        source: 'code',
      }),
    ]);
  });

  it('the owner’s patches add, drop, reprioritise and scope journeys, and survive reapplying', () => {
    const v = validate(x, null, exists);
    const model = {
      version: 1 as const,
      projectId: 'demo-chat',
      commit: 'abc',
      kind: 'web' as const,
      stack: x.stack,
      ...v,
      tokens: [],
      apis: [],
      breakpoints: [],
      media: x.media,
      sensitive: [],
    };
    const next = applyPatches(model, [
      {
        op: 'addJourney',
        journey: {
          id: 'nap',
          name: 'Send Grandma a photo',
          goal: 'x',
          start: '/compose',
          steps: ['a', 'b'],
          pages: ['/compose'],
          priority: 1,
          source: 'owner',
        },
      },
      { op: 'priority', id: 'fill-contacts-add-contacts', priority: 3 },
      { op: 'outOfScope', routes: ['/contacts'] },
    ]);
    expect(next.journeys.map((j) => [j.id, j.priority, j.source, j.enabled])).toEqual([
      ['fill-contacts-add-contacts', 3, 'owner', false],
      ['nap', 1, 'owner', undefined],
    ]);
    expect(
      applyPatches(next, [{ op: 'dropJourney', id: 'nap' }]).journeys.map((j) => j.id),
    ).toEqual(['fill-contacts-add-contacts']);
  });
});

describe('FITTS.md', () => {
  it('is the summary, the pages with features, the journeys and the notes', () => {
    const x = extract(DEMO);
    const v = validate(x, null, (f) => x.files.includes(f));
    const md = fittsMd({
      version: 1,
      projectId: 'demo-chat',
      commit: 'abc',
      kind: 'web',
      stack: x.stack,
      ...v,
      tokens: x.tokens,
      apis: x.apis,
      breakpoints: x.breakpoints,
      media: x.media,
      sensitive: x.sensitive,
    });
    expect(md).toMatch(/^# demo-chat\n/);
    expect(md).toContain('- `/contacts` · src/pages/Contacts.tsx');
    expect(md).toContain('## Journeys');
    expect(md).toContain('Fill in the contacts-add form on /contacts');
  });
});

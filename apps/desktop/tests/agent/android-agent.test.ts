// @vitest-environment node
// Android on the agent's side: A9's brand check (its answer, an unreadable one, its finding and
// the aggregator's rule for it) and the Maestro repro flow.
import type { Finding, Repro } from '@fitts/schema';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CostLedger } from '../../src/agent/ledger/ledger';
import { LlmCaller } from '../../src/agent/llm/call';
import { FakeLlmClient, type Fixture } from '../../src/agent/llm/fake';
import { maestroFlow } from '../../src/agent/repro/maestro';
import { aggregate } from '../../src/agent/review/aggregate';
import { BRAND_PERSONA, brandDraft, brandFit } from '../../src/agent/review/brandfit';

const answer = (outputText: string): Fixture => ({
  name: 'brand-fit',
  model: 'muse-spark-1.3',
  recordedAt: '2026-11-02T00:00:00.000Z',
  response: {
    id: 'r',
    model: 'm',
    output: [],
    outputText,
    usage: { input: 1, cached: 0, output: 1, reasoning: 0 },
  } as never,
});
const ctx = { runId: 'run-1', projectId: 'p', contributor: false, allowed: () => true };
const input = {
  brief: { summary: 'A wood-fired pizza place’s ordering app.' },
  shots: ['AAA', 'BBB'],
  tokens: ['ember', 'cream', 'display'],
};

describe('A9: the brand check on Android', () => {
  it('reads the verdict: what is on brand, what isn’t, and the suspect tokens', async () => {
    const client = new FakeLlmClient([
      answer(
        '{"fits":false,"onBrand":"The Basil & Ember wordmark keeps its ember and serif.","offBrand":"Buttons, tabs and headings use stock purple and the system font.","tokens":["ember","display"],"why":"The logo says wood-fired; the rest says default Android."}',
      ),
    ]);
    const v = await brandFit(new LlmCaller(() => client, new CostLedger()), ctx, 'm', input);
    expect(v).toMatchObject({ fits: false, tokens: ['ember', 'display'] });
    const req = client.requests[0];
    expect(req?.task).toBe('themefit');
    expect(JSON.stringify(req?.input)).toContain('Theme tokens in the code: ember, cream, display');
    expect(JSON.stringify(req?.input)).toContain('data:image/jpeg;base64,BBB');
  });

  it('an unreadable answer, twice, is no verdict (no finding)', async () => {
    const client = new FakeLlmClient([answer('nope'), answer('{"why":"x"}')]);
    expect(
      await brandFit(new LlmCaller(() => client, new CostLedger()), ctx, 'm', input),
    ).toBeNull();
  });

  it('a misfit is one shown finding, "Doesn’t match your brand", citing the screens', () => {
    const d = brandDraft(
      {
        fits: false,
        onBrand: 'The wordmark keeps its ember and serif.',
        offBrand: 'Buttons and headings use stock purple and the system font.',
        tokens: ['ember', 'display'],
        why: 'x',
      },
      ['/basil-ember#snapshot', '/your-bag#snapshot'],
    );
    expect(d).toMatchObject({
      title: 'Doesn’t match your brand',
      severity: 2,
      lens: 'look-and-feel',
    });
    expect(d.evidence).toContain('Theme tokens that look off: ember, display');
    const f = aggregate({
      runId: 'run-1',
      probes: [],
      reviews: [{ route: '/basil-ember', persona: BRAND_PERSONA, drafts: [d] }],
      stepOf: () => ({ stepIndex: 1, atMs: 0 }),
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ title: 'Doesn’t match your brand', lane: 'shown' });
  });
});

describe('the Maestro repro (§9.3)', () => {
  it('launches the app, taps by testID or text, types, and asserts what was seen', () => {
    const finding = {
      title: 'Placeholder text shows',
      fix: 'Show the pickup time.',
      finding: 'x',
    } as Finding;
    const repro: Repro = {
      start: { url: 'android://com.basilandember.order/basil-ember', device: 'Android emulator' },
      steps: [
        {
          n: 1,
          text: 'Tap **Margherita**',
          route: '/basil-ember',
          target: { role: 'button', name: 'Margherita', testId: 'menu-row-margherita' },
        },
        { n: 2, text: 'Type “Sam” in **Name for the order**', route: '/pickup-details' },
        {
          n: 3,
          text: 'Tap **Place order**',
          route: '/pickup-details',
          target: { role: 'button', name: 'Place order' },
        },
      ],
      expected: 'the pickup time',
      actual: 'shows "Ready around undefined"',
      environment: 'Android emulator · development build',
      confirmed: 'observed',
    };
    expect(maestroFlow(finding, repro, 'com.basilandember.order')).toBe(
      [
        '# Placeholder text shows',
        '# Fitts repro · Android emulator · development build',
        'appId: com.basilandember.order',
        '---',
        '- launchApp',
        '- tapOn: { id: "menu-row-margherita" }',
        '- inputText: "Sam"',
        '- tapOn: "Place order"',
        '- assertVisible: "Ready around undefined"   # actual; expected: the pickup time',
        '',
      ].join('\n'),
    );
  });
});

describe('A9 on the recorded brand check (a real answer on the real stock screenshot)', () => {
  it('flags the drift: stock purple against the ember wordmark', async () => {
    const recorded = JSON.parse(
      readFileSync(resolve(__dirname, '../fixtures/llm/brand-fit-stock.json'), 'utf8'),
    ) as Fixture;
    const client = new FakeLlmClient([recorded]);
    const shot = readFileSync(resolve(__dirname, '../fixtures/android/menu-stock.png')).toString(
      'base64',
    );
    const v = await brandFit(new LlmCaller(() => client, new CostLedger()), ctx, 'm', {
      ...input,
      shots: [shot],
    });
    expect(v?.fits).toBe(false);
    expect(v?.offBrand).toMatch(/purple/i);
    expect(JSON.stringify(client.requests[0]?.input)).toContain('data:image/png;base64,iVBOR');
  });
});

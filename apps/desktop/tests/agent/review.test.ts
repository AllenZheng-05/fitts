// @vitest-environment node
import type { FindingDraft, ProbeResult } from '@fitts/schema';
import { describe, expect, it } from 'vitest';
import { CostLedger } from '../../src/agent/ledger/ledger';
import { LlmCaller } from '../../src/agent/llm/call';
import { FakeLlmClient, type Fixture } from '../../src/agent/llm/fake';
import type { AxSnapshot } from '../../src/agent/protocol';
import { aggregate, aggregateWithChecks, severityOf } from '../../src/agent/review/aggregate';
import {
  cleanDrafts,
  ReviewerPanel,
  validIds,
  type PersonaReview,
  type RouteEvidence,
} from '../../src/agent/review/reviewers';

const snapshot = (path: string): AxSnapshot => ({
  url: `http://x${path}`,
  path,
  title: 'App',
  headings: [],
  nodes: [
    { ref: 'thread-message', role: 'button', name: 'Initialize thread' },
    { ref: 'thread-call', role: 'button', name: '' },
  ],
  hasPassword: false,
});

const probe = (over: Partial<ProbeResult>): ProbeResult => ({
  evidenceId: 'run-1-ev1',
  probe: 'contrast',
  route: '/',
  pass: false,
  items: [
    { ref: 'stamp', selector: '', measured: 'text contrast 1.9:1', expected: 'at least 4.5:1' },
  ],
  ...over,
});

const draft = (over: Partial<FindingDraft>): FindingDraft => ({
  title: 'Jargon on the main button',
  finding: '"Initialize thread" is a developer word.',
  fix: 'Say "Write a message".',
  heuristic: 'H2',
  lens: 'content',
  severity: 2,
  elementRef: 'thread-message',
  evidenceIds: ['/contacts/grandma#snapshot'],
  evidence: ['Button says "Initialize thread"'],
  ...over,
});

const ev: RouteEvidence = {
  route: '/contacts/grandma',
  shot: { jpegBase64: 'AAAA' },
  snapshot: snapshot('/contacts/grandma'),
  trace: ['tapping Initialize thread'],
  probes: [probe({ evidenceId: 'run-1-ev7', probe: 'button-name', route: '/contacts/grandma' })],
};

const stepOf = () => ({ stepIndex: 3, atMs: 9000 });

describe('reviewer drafts', () => {
  it('keeps only drafts that cite evidence they were given, with refs on the page', () => {
    expect(validIds(ev)).toEqual([
      '/contacts/grandma#shot',
      '/contacts/grandma#snapshot',
      '/contacts/grandma#trace',
      'run-1-ev7',
    ]);
    const out = cleanDrafts(
      {
        findings: [
          draft({ evidenceIds: ['made-up'] }),
          draft({ elementRef: 'not-on-page', severity: 9, evidenceIds: ['run-1-ev7', 'x'] }),
          { title: '', evidenceIds: ['run-1-ev7'] },
        ],
      },
      ev,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ elementRef: null, severity: 4, evidenceIds: ['run-1-ev7'] });
    expect(cleanDrafts('nonsense', ev)).toEqual([]);
  });

  it('the panel asks all five personas with the screenshot and returns their drafts', async () => {
    const fixture: Fixture = {
      name: 'review-novice',
      model: 'muse-spark-1.3-contributor',
      recordedAt: '2026-10-30',
      response: {
        outputText: JSON.stringify({ findings: [draft({})] }),
        output: [],
        usage: { input: 1000, cached: 0, output: 300, reasoning: 200 },
        model: 'm',
      },
    };
    const fake = new FakeLlmClient([fixture]);
    const panel = new ReviewerPanel(
      new LlmCaller(() => fake, new CostLedger()),
      () => ({ runId: 'run-1', projectId: 'demo-chat', contributor: true, allowed: () => true }),
      () => [{ provider: 'meta', model: 'muse-spark-1.3-contributor' }],
    );
    const reviews = await panel.review(ev, { for: 'grandparents texting family' });
    expect(reviews.map((r) => r.persona)).toEqual([
      'Novice',
      'Power user',
      'Accessibility',
      'Visual design',
      'Trust & ethics',
    ]);
    expect(reviews.every((r) => r.drafts.length === 1)).toBe(true);
    const content = (fake.requests[0]?.input as { content: { type: string }[] }[])[0]?.content;
    expect(content?.map((c) => c.type)).toEqual(['input_text', 'input_image']);
  });
});

describe('aggregator and evidence check', () => {
  it('turns probe failures into findings; site-wide ones merge into one with locations', () => {
    const findings = aggregate({
      runId: 'run-1',
      probes: [
        probe({ evidenceId: 'run-1-ev1', route: '/' }),
        probe({
          evidenceId: 'run-1-ev2',
          route: '/compose/recipient',
          items: [
            {
              ref: 'compose-body',
              selector: '',
              measured: 'placeholder contrast 2.6:1',
              expected: 'at least 4.5:1',
            },
          ],
        }),
        ...['/', '/search', '/settings'].map((route, i) =>
          probe({
            evidenceId: `run-1-ev${10 + i}`,
            probe: 'focus-visible',
            route,
            items: [{ ref: `b${i}`, selector: '', measured: 'no visible change', expected: '' }],
          }),
        ),
        probe({ evidenceId: 'run-1-ev20', probe: 'spacing', pass: true, items: [] }),
      ],
      reviews: [],
      stepOf,
    });
    expect(findings.map((f) => f.title)).toEqual([
      'Text is too faint to read',
      'Placeholder text is too faint to read',
      'No visible focus when using the keyboard',
    ]);
    const focus = findings[2];
    expect(focus?.locations?.map((l) => l.route)).toEqual(['/', '/search', '/settings']);
    expect(focus?.severity).toBe(4); // impact 3, on 3+ screens
    expect(findings.every((f) => f.lane === 'shown' && f.agreement.who[0] === 'Probe')).toBe(true);
  });

  it('reviewers citing a probe add agreement to its finding', () => {
    const reviews: PersonaReview[] = ['Accessibility', 'Novice'].map((persona) => ({
      route: '/contacts/grandma',
      persona,
      drafts: [
        draft({
          title: 'Call button has no label',
          elementRef: 'thread-call',
          evidenceIds: ['run-1-ev7'],
        }),
      ],
    }));
    const [f] = aggregate({
      runId: 'run-1',
      probes: [
        probe({
          evidenceId: 'run-1-ev7',
          probe: 'button-name',
          route: '/contacts/grandma',
          items: [
            {
              ref: 'thread-call',
              selector: '',
              measured: 'button with no accessible name',
              expected: '',
            },
          ],
        }),
      ],
      reviews,
      stepOf,
    });
    expect(f?.agreement).toEqual({
      agreeing: 3,
      total: 5,
      who: ['Probe', 'Accessibility', 'Novice'],
    });
  });

  it('a reviewer-only finding is shown at 2 of 5 on grounded evidence, else it is a suggestion', () => {
    const one = (persona: string, d: Partial<FindingDraft> = {}): PersonaReview => ({
      route: '/contacts/grandma',
      persona,
      drafts: [draft(d)],
    });
    const two = aggregate({
      runId: 'r',
      probes: [],
      reviews: [one('Novice'), one('Trust & ethics')],
      stepOf,
    });
    expect(two).toHaveLength(1);
    expect(two[0]).toMatchObject({ lane: 'shown', elementRef: 'thread-message', heuristic: 'H2' });
    expect(two[0]?.agreement.who).toEqual(['Novice', 'Trust & ethics']);

    const single = aggregate({ runId: 'r', probes: [], reviews: [one('Novice')], stepOf });
    expect(single[0]?.lane).toBe('suggestion');

    const shotOnly = aggregate({
      runId: 'r',
      probes: [],
      reviews: [
        one('Novice', { evidenceIds: ['/contacts/grandma#shot'] }),
        one('Visual design', { evidenceIds: ['/contacts/grandma#shot'] }),
      ],
      stepOf,
    });
    expect(shotOnly[0]?.lane).toBe('suggestion');
  });

  it('a draft about the page a broken link leads to joins that link’s finding', () => {
    const findings = aggregate({
      runId: 'r',
      probes: [
        probe({
          evidenceId: 'r-ev3',
          probe: 'links',
          route: '/',
          items: [{ ref: 'inbox-help', selector: '', measured: '/help returns 404', expected: '' }],
        }),
      ],
      reviews: ['Novice', 'Trust & ethics'].map((persona) => ({
        route: '/help',
        persona,
        drafts: [
          draft({
            title: 'Help page is a dead end',
            elementRef: null,
            evidenceIds: ['/help#snapshot'],
          }),
        ],
      })),
      stepOf,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.agreement.who).toEqual(['Probe', 'Novice', 'Trust & ethics']);
  });

  it('severity rubric: impact, raised one step for 3+ screens or 3+ reviewers, capped at 4', () => {
    expect(severityOf(2, 1, 1)).toBe(2);
    expect(severityOf(2, 3, 1)).toBe(3);
    expect(severityOf(2, 1, 3)).toBe(3);
    expect(severityOf(2, 4, 5)).toBe(3);
    expect(severityOf(3, 4, 4)).toBe(4);
    expect(severityOf(1, 1, 5)).toBe(1);
  });
});

describe('the phone pass (device sizes)', () => {
  const small = (measured: string) => ({
    ref: 'send',
    selector: '',
    measured,
    expected: 'at least 24×24px',
  });

  it('a problem only a phone shows is its own finding, named for the phone, never auto-fixed', () => {
    const { findings, checks } = aggregateWithChecks({
      runId: 'run-1',
      probes: [
        probe({ evidenceId: 'e1', probe: 'contrast' }),
        probe({
          evidenceId: 'e2',
          probe: 'target-size',
          device: 'phone',
          items: [small('20×20px on iPhone · 390×844')],
        }),
      ],
      reviews: [],
      stepOf: () => ({ stepIndex: 1, atMs: 1000 }),
    });
    const phone = findings.find((f) => f.title.startsWith('Tap target'));
    expect(phone?.title).toBe('Tap target is too small on a phone');
    expect(phone?.evidence.join(' ')).toContain('on iPhone · 390×844');
    expect(checks.get(phone?.id ?? '')).toMatchObject({ device: 'phone' });
    expect(
      checks.get(findings.find((f) => f.title.startsWith('Text'))?.id ?? ''),
    ).not.toHaveProperty('device');
  });
});

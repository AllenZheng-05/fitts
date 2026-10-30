import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  feedbackTiming,
  fittsId,
  isGenericError,
  labelConsistency,
  LEAK,
  networkProblems,
  offGridValues,
  type ActionTrace,
  type RequestRecord,
} from '../src/analyze';

const grey = (v: number) => ({ r: v, g: v, b: v, a: 1 });
const req = (over: Partial<RequestRecord>): RequestRecord => ({
  url: 'http://localhost:5191/api/search?q=f',
  method: 'GET',
  route: '/search',
  type: 'Fetch',
  status: 200,
  startMs: 0,
  endMs: 100,
  bytes: 100,
  ...over,
});
const trace = (over: Partial<ActionTrace>): ActionTrace => ({
  ref: 'x',
  name: 'X',
  kind: 'click',
  feedback: { firstChangeMs: 20, busyMs: null, added: [], live: [], errors: [] },
  navigated: false,
  requests: [],
  ...over,
});

describe('measurement helpers', () => {
  it('computes WCAG contrast (#BBB on white ≈ 1.9, #a1a1a1 ≈ 2.6, black on white = 21)', () => {
    expect(contrastRatio(grey(0), grey(255))).toBeCloseTo(21, 0);
    expect(contrastRatio(grey(0xbb), grey(255))).toBeCloseTo(1.9, 1);
    expect(contrastRatio(grey(0xa1), grey(255))).toBeCloseTo(2.6, 1);
  });

  it('finds template and serialization leaks, not ordinary words', () => {
    for (const t of ['To: (null)', 'undefined', 'Total: NaN', '[object Object]', 'Hi {{name}}'])
      expect(LEAK.test(t)).toBe(true);
    for (const t of ['Nullify this', 'Banana', 'null and void today'])
      expect(LEAK.test(t)).toBe(false);
  });

  it('recognizes generic error text', () => {
    for (const t of ['Error 0x3F', 'Error 500', 'Something went wrong', 'Error'])
      expect(isGenericError(t)).toBe(true);
    for (const t of ['Add a message before sending', 'Errors are rare here'])
      expect(isGenericError(t)).toBe(false);
  });

  it('lists off-grid spacing, ignoring hairlines', () => {
    expect(offGridValues([4, 8, 22, 7, 13, 1, 2, 16, 7])).toEqual([7, 13, 22]);
  });

  it('computes Fitts ID in bits', () => {
    expect(fittsId(300, 20)).toBeCloseTo(4, 1);
    expect(fittsId(0, 40)).toBe(0);
  });
});

describe('feedback timing', () => {
  it('flags a slow request with nothing on screen by 1s (#13)', () => {
    const items = feedbackTiming(
      trace({
        kind: 'type',
        ref: 'search-input',
        feedback: { firstChangeMs: null, busyMs: null, added: [], live: [], errors: [] },
        requests: [req({ startMs: 0, endMs: 1500 })],
      }),
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.measured).toMatch(/1\.5s wait with no loading indicator/);
  });

  it('passes a slow request with a spinner shown in time', () => {
    const items = feedbackTiming(
      trace({
        kind: 'type',
        feedback: { firstChangeMs: 30, busyMs: 30, added: ['Searching…'], live: [], errors: [] },
        requests: [req({ endMs: 1500 })],
      }),
    );
    expect(items).toEqual([]);
  });

  it('flags a save with no confirmation (#3), and passes one that says so', () => {
    const post = [req({ method: 'POST', url: 'http://x/api/messages', status: 201 })];
    expect(
      feedbackTiming(trace({ name: 'Send Text', navigated: true, requests: post }))[0]?.measured,
    ).toMatch(/no confirmation/);
    expect(
      feedbackTiming(
        trace({
          navigated: true,
          requests: post,
          feedback: {
            firstChangeMs: 10,
            busyMs: null,
            added: [],
            live: ['Message sent'],
            errors: [],
          },
        }),
      ),
    ).toEqual([]);
  });

  it('only counts short confirmation text, not page content that happens to say "thanks"', () => {
    const post = [req({ method: 'POST', url: 'http://x/api/messages', status: 201 })];
    const fb = (added: string[]) => ({
      firstChangeMs: 10,
      busyMs: null,
      added,
      live: [],
      errors: [],
    });
    expect(feedbackTiming(trace({ requests: post, feedback: fb(['Message sent']) }))).toEqual([]);
    expect(
      feedbackTiming(trace({ requests: post, feedback: fb(['Thanks for the photos!']) })),
    ).toHaveLength(1);
  });

  it('flags a button that changed nothing', () => {
    const items = feedbackTiming(
      trace({ feedback: { firstChangeMs: null, busyMs: null, added: [], live: [], errors: [] } }),
    );
    expect(items[0]?.measured).toMatch(/changed nothing/);
  });
});

describe('network', () => {
  it('flags a request per keystroke (#10), repeats with no cache headers (#11) and a huge payload (#12)', () => {
    const typed = Array.from({ length: 10 }, (_, i) =>
      req({ url: `http://x/api/search?q=${'fitts-test'.slice(0, i + 1)}`, ref: 'search-input' }),
    );
    typed[0] = { ...typed[0]!, bytes: 1_900_000, arrayItems: 20_000 };
    const items = networkProblems(typed, [
      trace({ kind: 'type', ref: 'search-input', chars: 10, requests: typed }),
    ]);
    const measured = items.map((i) => i.measured);
    expect(measured).toContain('10 requests for 10 characters typed');
    expect(measured).toContain('/api/search fetched 10 times, no Cache-Control or ETag');
    expect(measured).toContain('/api/search returns 1.9 MB, 20,000 items');
    expect(items.every((i) => i.ref === 'search-input')).toBe(true);
  });

  it('passes cached repeats and small payloads', () => {
    const list = [req({ cacheControl: 'max-age=60' }), req({ cacheControl: 'max-age=60' })];
    expect(networkProblems(list, [])).toEqual([]);
  });
});

describe('label consistency', () => {
  it('flags NEXT / Create Message / Send Text across the compose flow (#2)', () => {
    const items = labelConsistency(
      [
        { route: '/compose', ref: 'compose-next-1', name: 'NEXT', to: '/compose/recipient' },
        {
          route: '/compose/recipient',
          ref: 'compose-create',
          name: 'Create Message',
          to: '/compose/confirm',
        },
        { route: '/compose/recipient', ref: 'compose-next', name: 'NEXT', to: '/compose/confirm' },
        { route: '/compose/confirm', ref: 'compose-send', name: 'Send Text', to: '/' },
      ],
      [],
    );
    const refs = items.map((i) => i.ref).sort();
    expect(refs).toEqual(['compose-create', 'compose-next', 'compose-next-1', 'compose-send']);
  });

  it('flags synonyms for one action across the site', () => {
    const items = labelConsistency(
      [],
      [
        { route: '/a', ref: 'a-del', name: 'Delete' },
        { route: '/b', ref: 'b-rm', name: 'Remove' },
        { route: '/b', ref: 'b-save', name: 'Save' },
      ],
    );
    expect(items.map((i) => i.ref).sort()).toEqual(['a-del', 'b-rm']);
  });

  it("doesn't flag a list of names that all open the same page", () => {
    expect(
      labelConsistency(
        [
          { route: '/contacts', ref: 'c1', name: 'Grandma', to: '/contacts/grandma' },
          { route: '/contacts', ref: 'c2', name: 'Mom', to: '/contacts/grandma' },
          { route: '/contacts', ref: 'c3', name: 'Uncle Joe', to: '/contacts/grandma' },
        ],
        [],
      ),
    ).toEqual([]);
  });

  it('passes a flow with Next then Send', () => {
    expect(
      labelConsistency(
        [
          { route: '/c', ref: 'n1', name: 'Next', to: '/c/2' },
          { route: '/c/2', ref: 's', name: 'Send', to: '/' },
        ],
        [],
      ),
    ).toEqual([]);
  });
});

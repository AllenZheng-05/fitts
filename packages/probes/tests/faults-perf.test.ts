// state_pass rewriting (SPEC-phase4 §6B.6) and perf thresholds (§6B.7).
import { describe, expect, it } from 'vitest';
import { brokenOnError, emptied, faultable, faultLabel, rewrite } from '../src/faults';
import { median3, perfFixPasses, perfProblems } from '../src/perf';

describe('faults', () => {
  it('only the site’s own GETs on localhost are rewritten', () => {
    expect(
      faultable(
        { method: 'GET', url: 'http://localhost:5173/api/contacts' },
        'http://localhost:5173',
      ),
    ).toBe(true);
    expect(
      faultable(
        { method: 'POST', url: 'http://localhost:5173/api/contacts' },
        'http://localhost:5173',
      ),
    ).toBe(false);
    expect(
      faultable({ method: 'GET', url: 'https://cdn.example.com/x' }, 'http://localhost:5173'),
    ).toBe(false);
    expect(faultable({ method: 'GET', url: 'https://site.com/api' }, 'https://site.com')).toBe(
      false,
    );
  });

  it('empty, error and slow', () => {
    expect(emptied([1, 2])).toEqual([]);
    expect(emptied({ items: [1], total: 2 })).toEqual({ items: [], total: 2 });
    expect(rewrite('empty', { status: 200, body: '{"contacts":[{"n":1}]}' })).toEqual({
      status: 200,
      body: '{"contacts":[]}',
    });
    expect(rewrite('error', { status: 200, body: '[]' })).toEqual({
      status: 500,
      body: '{"error":"fitts-test"}',
    });
    expect(rewrite('slow', { status: 200, body: 'x' })).toMatchObject({
      delayMs: 3000,
      passThrough: true,
    });
    expect(faultLabel('error', '/api/contacts')).toBe('when contacts fails');
  });

  it('the error case breaks the page when it crashes, shows an error boundary or goes blank', () => {
    expect(brokenOnError({ mainText: 0, uncaught: 0 })).toBe('goes blank');
    expect(brokenOnError({ mainText: 400, uncaught: 1 })).toBe('crashes (an uncaught error)');
    expect(brokenOnError({ mainText: 400, uncaught: 0 })).toBeNull();
  });
});

describe('perf', () => {
  it('flags what passes the limits, labeled with where it was measured', () => {
    const items = perfProblems({
      route: '/search',
      lcpMs: 3400,
      inpMs: 150,
      cls: 0.25,
      files: [{ url: 'http://x/assets/index-abc.js', type: 'script', bytes: 900 * 1024 }],
      devBuild: true,
    });
    expect(items.map((i) => i.metric)).toEqual(['lcp', 'cls', 'big-file']);
    expect(items[0]?.measured).toBe(
      'the main content shows after 3.4 s on a mid-range phone on Slow 4G (dev build)',
    );
  });

  it('a fix passes on the median of three beating the limit by 10%', () => {
    expect(median3([3000, 2000, 2100])).toBe(2100);
    expect(perfFixPasses('lcp', [2200, 2300, 2000])).toBe(true);
    expect(perfFixPasses('lcp', [2400, 2300, 2350])).toBe(false);
  });
});

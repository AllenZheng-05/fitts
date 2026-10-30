// @vitest-environment node
import type { ProbeResult } from '@fitts/schema';
import { describe, expect, it } from 'vitest';
import { ProbeRunner } from '../../src/agent/crawler/probes';
import type { AxSnapshot } from '../../src/agent/protocol';
import type { Site } from '../../src/agent/site-client';

const snap = (path: string, nodes: AxSnapshot['nodes']): AxSnapshot => ({
  url: `http://x${path}`,
  path,
  title: 'App',
  headings: [],
  nodes,
  hasPassword: false,
});

function setup(over: Partial<Site> = {}) {
  const calls: string[] = [];
  const site = {
    snapshot: () =>
      Promise.resolve(
        snap('/compose/confirm', [{ ref: 'send', role: 'button', name: 'Send Text' }]),
      ),
    back: () => {
      calls.push('back');
      return Promise.resolve({ path: '/compose/recipient', navigated: true });
    },
    value: () => Promise.resolve(''),
    probes: () => Promise.resolve([]),
    focusSweep: () => Promise.resolve([]),
    viewportSweep: () => Promise.resolve([]),
    links: (hrefs: string[]) =>
      Promise.resolve(Object.fromEntries(hrefs.map((h) => [h, h === '/help' ? 404 : 200]))),
    network: () => Promise.resolve([]),
    ...over,
  } as unknown as Site;
  const results: ProbeResult[] = [];
  const runner = new ProbeRunner(site, 'run-1', (r) => results.push(r));
  const failed = (probe: string) => results.filter((r) => r.probe === probe && !r.pass);
  return { runner, results, calls, failed };
}

describe('ProbeRunner', () => {
  it('back mid-flow: typed text lost after Back, and no back or cancel control (#4, #5)', async () => {
    const { runner, calls, failed } = setup();
    await runner.afterAction(
      { kind: 'type', ref: 'compose-body', name: 'Message', text: 'fitts-test message' },
      '/compose/recipient',
      { path: '/compose/recipient', navigated: false },
    );
    await runner.afterAction(
      { kind: 'click', ref: 'compose-next', name: 'NEXT' },
      '/compose/recipient',
      { path: '/compose/confirm', navigated: true },
    );
    expect(calls).toEqual(['back']);
    const [r] = failed('back-mid-flow');
    expect(r?.route).toBe('/compose/recipient');
    expect(r?.items.map((i) => i.measured)).toEqual([
      'no back or cancel control on /compose/confirm',
      'after Back, what was typed is gone',
    ]);
  });

  it('empty submit: once per form, only with empty fields and a submit-like control', () => {
    const { runner } = setup();
    const form = snap('/compose/recipient', [
      { ref: 'compose-body', role: 'textbox', name: 'Message' },
      { ref: 'compose-create', role: 'button', name: 'Create Message' },
    ]);
    const untried = [{ ref: 'compose-create', name: 'Create Message' }];
    expect(runner.emptySubmit(form, untried)?.ref).toBe('compose-create');
    expect(runner.emptySubmit(form, untried)).toBeUndefined();
    const search = snap('/search', [
      { ref: 's', role: 'textbox', name: 'Search', type: 'search' },
      { ref: 'go', role: 'button', name: 'Search' },
    ]);
    expect(runner.emptySubmit(search, [{ ref: 'go', name: 'Search' }])).toBeUndefined();
  });

  it('records generic error text from an action (#14) and broken links at the end (#24)', async () => {
    const { runner, failed } = setup();
    await runner.onPage(
      snap('/', [{ ref: 'inbox-help', role: 'link', name: 'Help', href: '/help' }]),
    );
    await runner.afterAction(
      { kind: 'click', ref: 'compose-send', name: 'Send Text' },
      '/compose/confirm',
      {
        path: '/compose/confirm',
        navigated: false,
        trace: {
          feedback: {
            firstChangeMs: 30,
            busyMs: null,
            added: ['Error 0x3F'],
            live: [],
            errors: [
              { ref: 'compose-error', selector: 'p.error', measured: '"Error 0x3F"', expected: '' },
            ],
          },
          requests: [],
        },
      },
    );
    expect(failed('error-message')[0]?.items[0]?.ref).toBe('compose-error');
    await runner.finish();
    const links = failed('links');
    expect(links).toHaveLength(1);
    expect(links[0]?.items[0]).toMatchObject({ ref: 'inbox-help', measured: '/help returns 404' });
    expect(runner.results.every((r) => r.evidenceId.startsWith('run-1-ev'))).toBe(true);
  });
});

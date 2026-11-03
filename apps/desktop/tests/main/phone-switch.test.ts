// @vitest-environment node
// The emulator between the live app and a run's fixed version (Allen, Nov 2): the switch's states
// and its cleanup on every way out, with a fake adb and a fake Metro (no device, no processes).
import type { RunState } from '@fitts/schema';
import type { Adb } from '../../src/main/android/adb';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '' },
  BrowserWindow: class {
    static getAllWindows() {
      return [];
    }
  },
  ipcMain: { on: vi.fn(), handle: vi.fn() },
  nativeImage: { createFromBuffer: () => ({ isEmpty: () => true }) },
  net: {},
  protocol: {},
  session: {},
  shell: {},
  webContents: { fromId: () => undefined },
}));
vi.mock('@fitts/probes/page.js?raw', () => ({ default: '' }));

const { PhoneSwitch, phoneFor } = await import('../../src/main/android/phone-switch');
const { SiteManager } = await import('../../src/main/site/manager');

const APP = '<hierarchy><node clickable="true" bounds="[0,0][10,10]" /></hierarchy>';
const BLANK = '<hierarchy><node clickable="false" bounds="[0,0][10,10]" /></hierarchy>';

/** A device that records what Fitts asked of it; `opens` answers each reopen's dumps. */
function fakePhone(opts: { reopens?: boolean; open?: boolean } = {}) {
  const calls: string[] = [];
  let dumps: string[] = [APP];
  const adb = {
    reverse: (p: number) => (calls.push(`reverse ${p}`), Promise.resolve(true)),
    unreverse: (p: number) => (calls.push(`unreverse ${p}`), Promise.resolve(true)),
    open: (url: string) => {
      const port = /127\.0\.0\.1%3A(\d+)/.exec(url)?.[1];
      calls.push(`open ${port}`);
      // A reopen clears the old screen, then the app comes up (or never does).
      dumps = opts.reopens === false ? [BLANK] : [BLANK, APP];
      return Promise.resolve(opts.open ?? true);
    },
    dump: () => Promise.resolve(dumps.length > 1 ? (dumps.shift() ?? APP) : (dumps[0] ?? APP)),
  } as unknown as Adb;
  return { adb, calls };
}

function harness(
  opts: {
    reopens?: boolean;
    open?: boolean;
    metro?: boolean;
    noAdb?: boolean;
    served?: boolean;
  } = {},
) {
  const phone = fakePhone(opts);
  const metros: { dir: string; port: number; stopped: boolean }[] = [];
  const released: number[] = [];
  let next = 5200;
  const changes: string[] = [];
  const sw = new PhoneSwitch(
    {
      adb: () => Promise.resolve(opts.noAdb ? undefined : phone.adb),
      slug: 'basil-ember-android',
      livePort: 8081,
      metro: (dir, port) => {
        const m = { dir, port, stopped: false };
        metros.push(m);
        return {
          start: () => Promise.resolve(opts.metro ?? true),
          stop: () => void (m.stopped = true),
          served: () => opts.served ?? true,
        };
      },
      freePort: () => Promise.resolve(next++),
      releasePort: (p) => void released.push(p),
      sleep: () => Promise.resolve(),
    },
    (s) => changes.push(s.kind === 'fixed' ? `fixed ${s.branch}` : 'live'),
  );
  return { sw, calls: phone.calls, metros, released, changes };
}

describe('PhoneSwitch', () => {
  it('live → fixed: a Metro from the view worktree, a reverse, the dev client reopened on it', async () => {
    const h = harness();
    expect(await h.sw.showFixed('/wt/view', 'fitts/run-run-1')).toEqual({ ok: true });
    expect(h.sw.state()).toEqual({ kind: 'fixed', branch: 'fitts/run-run-1' });
    expect(h.metros).toEqual([{ dir: '/wt/view', port: 5200, stopped: false }]);
    expect(h.calls).toEqual(['reverse 5200', 'open 5200']);
    expect(h.changes).toEqual(['fixed fitts/run-run-1']);
  });

  it('fixed → live: the live Metro reopened, the reverse taken back, the worktree Metro stopped', async () => {
    const h = harness();
    await h.sw.showFixed('/wt/view', 'b');
    await h.sw.showLive();
    expect(h.sw.state()).toEqual({ kind: 'live' });
    expect(h.calls.slice(2)).toEqual(['open 8081', 'unreverse 5200']);
    expect(h.metros[0]?.stopped).toBe(true);
    expect(h.released).toEqual([5200]);
    expect(h.changes).toEqual(['fixed b', 'live']);
    // Again: nothing more to undo.
    await h.sw.showLive();
    expect(h.calls).toHaveLength(4);
  });

  it('the same branch twice is one switch; another branch goes back to live first', async () => {
    const h = harness();
    await h.sw.showFixed('/wt/a', 'a');
    await h.sw.showFixed('/wt/a', 'a');
    expect(h.metros).toHaveLength(1);
    await h.sw.showFixed('/wt/b', 'b');
    expect(h.calls).toEqual([
      'reverse 5200',
      'open 5200',
      'open 8081',
      'unreverse 5200',
      'reverse 5201',
      'open 5201',
    ]);
    expect(h.metros[0]?.stopped).toBe(true);
  });

  it("the worktree's Metro never serves a bundle: not the fixed version, and cleaned up", async () => {
    const h = harness({ served: false });
    expect(await h.sw.showFixed('/wt', 'b')).toEqual({ ok: false, reason: 'dev-client' });
    expect(h.sw.state()).toEqual({ kind: 'live' });
    expect(h.metros[0]?.stopped).toBe(true);
  });

  it('no emulator: nothing starts', async () => {
    const h = harness({ noAdb: true });
    expect(await h.sw.showFixed('/wt', 'b')).toEqual({ ok: false, reason: 'no-emulator' });
    expect(h.metros).toHaveLength(0);
  });

  it("the worktree's Metro doesn't start: cleaned up, still live", async () => {
    const h = harness({ metro: false });
    expect(await h.sw.showFixed('/wt', 'b')).toEqual({ ok: false, reason: 'metro' });
    expect(h.sw.state()).toEqual({ kind: 'live' });
    expect(h.metros[0]?.stopped).toBe(true);
    expect(h.released).toEqual([5200]);
    expect(h.calls).toEqual(['open 8081', 'unreverse 5200']);
  });

  it("the dev client doesn't come up on it: back on the live app, reverse and Metro gone", async () => {
    const h = harness({ reopens: false });
    expect(await h.sw.showFixed('/wt', 'b')).toEqual({ ok: false, reason: 'dev-client' });
    expect(h.sw.state()).toEqual({ kind: 'live' });
    expect(h.calls).toEqual(['reverse 5200', 'open 5200', 'open 8081', 'unreverse 5200']);
    expect(h.metros[0]?.stopped).toBe(true);
    expect(h.changes).toEqual([]);
  });

  it('calls are serialized: a switch back waits for the switch in flight', async () => {
    const h = harness();
    const fixed = h.sw.showFixed('/wt', 'b');
    const live = h.sw.showLive();
    await Promise.all([fixed, live]);
    expect(h.changes).toEqual(['fixed b', 'live']);
    expect(h.sw.state()).toEqual({ kind: 'live' });
  });
});

describe('phoneFor (when the phone switches)', () => {
  const state = (patch: Partial<RunState>): RunState =>
    ({
      runId: 'run-1',
      phase: 'audit',
      fixingCount: 0,
      activity: 'acting',
      changes: [],
      ...patch,
    }) as RunState;
  const verified = [{ status: 'verified', branch: 'fitts/run-run-1' }] as RunState['changes'];

  it('fixes checked and the agent waiting on the owner: the fixed version, once', () => {
    const working = state({ fixingCount: 1, changes: verified });
    const waiting = state({ activity: 'waiting-on-user', changes: verified });
    expect(phoneFor(working, waiting)).toEqual({ kind: 'fixed', branch: 'fitts/run-run-1' });
    expect(phoneFor(waiting, waiting)).toBeNull();
  });

  it('still fixing, or nothing verified: no switch', () => {
    expect(phoneFor(undefined, state({ fixingCount: 1, changes: verified }))).toBeNull();
    expect(phoneFor(undefined, state({ activity: 'waiting-on-user' }))).toBeNull();
  });

  it('a new run: the live app', () => {
    expect(phoneFor(state({ phase: 'done' }), state({ runId: 'run-2' }))).toEqual({
      kind: 'live',
    });
  });
});

describe('the SiteManager returns the phone to the live app', () => {
  function managerWithPhone() {
    const h = harness();
    const sites = new SiteManager('', () => undefined);
    const order: string[] = [];
    const android = {
      run: () => (
        order.push(`agent sees ${h.sw.state().kind}`),
        Promise.resolve({ op: 'snapshot' })
      ),
      stop: vi.fn(),
    };
    const live = {
      server: { stop: vi.fn(), url: 'http://localhost:8081', log: [] },
      status: { projectId: 'p', status: 'running', url: 'android:emulator-5554' },
      android,
      phone: h.sw,
    };
    (sites as unknown as { live: Map<string, unknown> }).live.set('p', live);
    return { sites, h, order, live };
  }

  it('before an agent action', async () => {
    const { sites, h, order } = managerWithPhone();
    await h.sw.showFixed('/wt', 'b');
    await sites.run('p', { op: 'snapshot' } as never);
    expect(order).toEqual(['agent sees live']);
    expect(h.metros[0]?.stopped).toBe(true);
  });

  it('when the project closes, and when Fitts quits', async () => {
    const a = managerWithPhone();
    await a.h.sw.showFixed('/wt', 'b');
    a.sites.close('p');
    await a.h.sw.showLive();
    expect(a.h.calls).toContain('unreverse 5200');
    expect(a.h.sw.state()).toEqual({ kind: 'live' });

    const b = managerWithPhone();
    await b.h.sw.showFixed('/wt', 'b');
    expect(b.sites.phoneShowingFixed()).toBe(true);
    await b.sites.restorePhones();
    expect(b.sites.phoneShowingFixed()).toBe(false);
    expect(b.h.metros[0]?.stopped).toBe(true);
  });

  it('switching back from the toggle, and the agent mid-run gets the web imitation', async () => {
    const { sites, h, live } = managerWithPhone();
    sites.phoneBusy = () => true;
    await sites.showFixed('p', 'run-1', 'fitts/run-run-1');
    expect(live.status).toMatchObject({ phoneFallback: 'busy' });
    expect(h.metros).toHaveLength(0);
    await h.sw.showFixed('/wt', 'b');
    await sites.showLive('p');
    expect(h.sw.state()).toEqual({ kind: 'live' });
    expect(live.status).not.toHaveProperty('phoneFallback', 'busy');
  });
});

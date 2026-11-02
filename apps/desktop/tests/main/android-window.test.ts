// @vitest-environment node
// The AndroidWindow over a fake adb (SPEC-phase4 §9.2): the screen's name, taps at the center of
// a node, the gate holding a destructive tap until the owner answers, the probes, the owner's
// canvas taps, and empty answers for what a phone has no equivalent of.
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  nativeImage: {
    createFromBuffer: () => ({
      getSize: () => ({ width: 2, height: 2 }),
      toJPEG: () => Buffer.from('jpeg'),
      toBitmap: () => Buffer.alloc(16, 255),
    }),
  },
}));

import { Adb, type AdbRunner } from '../../src/main/android/adb';
import { AndroidWindow } from '../../src/main/android/window';

const node = (a: Record<string, string>, children = '') =>
  `<node text="${a['text'] ?? ''}" resource-id="${a['id'] ? `com.basilandember.order:id/${a['id']}` : ''}" class="${a['class'] ?? 'android.view.ViewGroup'}" content-desc="${a['desc'] ?? ''}" clickable="${a['clickable'] ?? 'false'}" enabled="true" focusable="false" bounds="${a['bounds'] ?? '[0,0][0,0]'}"${children ? `>${children}</node>` : ' />'}`;

const SCREEN = (title: string) =>
  `<?xml version='1.0' ?><hierarchy rotation="0">${node(
    { bounds: '[0,0][1080,2400]' },
    [
      node({ class: 'android.widget.TextView', text: title, bounds: '[40,80][600,160]' }),
      node({
        id: 'order-cancel',
        class: 'android.widget.Button',
        text: 'Cancel order',
        clickable: 'true',
        bounds: '[40,1800][1040,1940]',
      }),
      node({
        id: 'cart-remove-margherita',
        clickable: 'true',
        desc: 'Remove',
        bounds: '[900,600][995,695]',
      }),
      node({
        id: 'order-pickup-line',
        class: 'android.widget.TextView',
        text: 'Ready around undefined',
        bounds: '[40,400][1040,460]',
      }),
    ].join(''),
  )}</hierarchy>`;

function fake(title = 'Your order') {
  const calls: string[][] = [];
  const run: AdbRunner = (args) => {
    calls.push(args);
    const s = args.join(' ');
    const out = s.startsWith('exec-out uiautomator')
      ? SCREEN(title)
      : s === 'shell wm density'
        ? 'Physical density: 420'
        : s === 'shell wm size'
          ? 'Physical size: 1080x2400'
          : '';
    return Promise.resolve({ code: 0, stdout: Buffer.from(out), stderr: '' });
  };
  return { adb: new Adb(run), calls };
}

const taps = (calls: string[][]) => calls.filter((c) => c[1] === 'input' && c[2] === 'tap');

describe('the AndroidWindow', () => {
  it('names the screen from its header, matched to the App Model’s screens when it can', async () => {
    const { adb } = fake('Your order');
    const status: string[] = [];
    const win = new AndroidWindow(
      adb,
      () => undefined,
      (p) => status.push(p.url ?? ''),
      undefined,
      {
        appId: 'com.basilandember.order',
        screens: [{ route: '/order/[id]', title: 'Your order' }],
      },
    );
    const snap = await win.snapshot();
    expect(snap.path).toBe('/order/[id]');
    expect(snap.url).toBe('android://com.basilandember.order/order/[id]');
    expect(status.at(-1)).toBe('android://com.basilandember.order/order/[id]');
    const plain = new AndroidWindow(
      fake('Pickup details').adb,
      () => undefined,
      () => undefined,
    );
    expect((await plain.snapshot()).path).toBe('/pickup-details');
  });

  it('a destructive tap waits for the owner: no tap on "Don’t do it", one tap on Allow', async () => {
    const { adb, calls } = fake();
    const held: { id: string; method: string; url: string }[] = [];
    const win = new AndroidWindow(
      adb,
      () => undefined,
      () => undefined,
      (h) => held.push(h),
    );
    await win.snapshot();
    const denied = win.run({ op: 'click', ref: 'order-cancel', destructive: true });
    await vi.waitFor(() => expect(held).toHaveLength(1));
    expect(held[0]).toMatchObject({ method: 'TAP', url: 'android-tap:Cancel order' });
    await win.run({ op: 'release', id: held[0]?.id ?? '', allow: false });
    await denied;
    expect(taps(calls)).toHaveLength(0);
    const allowed = win.run({ op: 'click', ref: 'order-cancel', destructive: true });
    await vi.waitFor(() => expect(held).toHaveLength(2));
    await win.run({ op: 'release', id: held[1]?.id ?? '', allow: true });
    await allowed;
    expect(taps(calls)).toEqual([['shell', 'input', 'tap', '540', '1870']]);
  });

  it('the probes: target size, label, placeholder leak, as page probe results', async () => {
    const win = new AndroidWindow(
      fake().adb,
      () => undefined,
      () => undefined,
    );
    await win.start();
    const r = await win.run({ op: 'probes', names: [] });
    if (r.op !== 'probes') throw new Error(r.op);
    const by = (p: string) => r.results.find((x) => x.probe === p);
    expect(by('android-target')?.items.map((i) => i.ref)).toEqual(['cart-remove-margherita']);
    expect(by('placeholder-leak')?.items[0]?.measured).toBe('shows "Ready around undefined"');
    expect(by('android-label')?.pass).toBe(true);
    win.stop();
  });

  it('the owner’s canvas click is a tap; what a phone has no equivalent of answers empty', async () => {
    const { adb, calls } = fake();
    const win = new AndroidWindow(
      adb,
      () => undefined,
      () => undefined,
    );
    await win.input({ kind: 'mouse', type: 'mouseDown', x: 100, y: 200 });
    await win.input({ kind: 'mouse', type: 'mouseUp', x: 102, y: 201 });
    expect(taps(calls)).toEqual([['shell', 'input', 'tap', '102', '201']]);
    expect(await win.run({ op: 'focus' })).toEqual({ op: 'items', items: [] });
    expect(await win.run({ op: 'network' })).toEqual({ op: 'network', requests: [] });
    await expect(
      win.run({ op: 'replay', ask: { start: { path: '/' }, steps: [] } }),
    ).rejects.toThrow("replay isn't available on Android");
  });
});

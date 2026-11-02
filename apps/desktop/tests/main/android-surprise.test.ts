// @vitest-environment node
// A10 (Nov 2): surprises on Android from consecutive dumps of one screen — a jump with no input,
// a pop-up, and a tap's own response that isn't flagged — and the judge's frames over a fake adb.
import { surpriseProblems } from '@fitts/probes';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  nativeImage: {
    createFromBuffer: (b: Buffer) => ({
      getSize: () => (b.length ? { width: 2, height: 2 } : { width: 0, height: 0 }),
      toJPEG: () => Buffer.from('jpeg'),
      toBitmap: () => Buffer.alloc(16, 255),
    }),
  },
}));

import { Adb, type AdbRunner } from '../../src/main/android/adb';
import { parseDump } from '../../src/main/android/dump';
import { diffDumps } from '../../src/main/android/surprise';
import { AndroidWindow } from '../../src/main/android/window';

const node = (a: Record<string, string>, children = '') =>
  `<node text="${a['text'] ?? ''}" resource-id="${a['id'] ?? ''}" class="${a['class'] ?? 'android.view.ViewGroup'}" content-desc="" clickable="${a['clickable'] ?? 'false'}" enabled="true" focusable="false" bounds="${a['bounds']}"${children ? `>${children}</node>` : ' />'}`;

/** The menu, with or without the special banner pushing the rows down 252px (96dp at 420dpi). */
const MENU = (banner: boolean, dialog = false) =>
  `<?xml version='1.0' ?><hierarchy rotation="0">${node(
    { bounds: '[0,0][1080,2400]' },
    [
      node({
        class: 'android.view.View',
        text: 'Basil & Ember',
        id: 'header-wordmark',
        bounds: '[42,175][451,257]',
      }),
      banner ? node({ id: 'menu-special-banner', bounds: '[42,560][1038,812]' }) : '',
      node(
        {
          id: 'menu-row-margherita',
          clickable: 'true',
          bounds: `[42,${banner ? 946 : 694}][1038,${banner ? 1514 : 1262}]`,
        },
        node({
          class: 'android.widget.TextView',
          text: 'Margherita Classica',
          bounds: '[288,740][712,800]',
        }),
      ),
      dialog
        ? node({ id: 'rate-dialog', class: 'android.app.Dialog', bounds: '[100,800][980,1600]' })
        : '',
    ].join(''),
  )}</hierarchy>`;

const opts = { density: 420, screen: { width: 1080, height: 2400 }, path: '/' };

describe('surprises from dumps', () => {
  it('the rows jump 96dp with no input between dumps: a jump, read as one by the analysis', () => {
    const events = diffDumps(
      { root: parseDump(MENU(false)), at: 1000 },
      { root: parseDump(MENU(true)), at: 2200 },
      [400],
      opts,
    );
    expect(events).toEqual([
      expect.objectContaining({
        type: 'shift',
        at: 1600,
        hadRecentInput: false,
        path: '/',
        sources: [
          expect.objectContaining({
            ref: 'menu-row-margherita',
            name: 'Margherita Classica',
            fromY: 694,
            toY: 946,
          }),
        ],
      }),
    ]);
    const { notes } = surpriseProblems(events, [400]);
    expect(notes[0]).toMatchObject({ kind: 'jumped', ref: 'menu-row-margherita' });
  });

  it('a tap’s own response (an input between the dumps) isn’t a jump', () => {
    const events = diffDumps(
      { root: parseDump(MENU(false)), at: 1000 },
      { root: parseDump(MENU(true)), at: 2200 },
      [1500],
      opts,
    );
    expect(events[0]).toMatchObject({ type: 'shift', hadRecentInput: true });
    expect(surpriseProblems(events, [1500]).notes).toEqual([]);
  });

  it('a dialog that appears with no input for a second pops up', () => {
    const events = diffDumps(
      { root: parseDump(MENU(false)), at: 1000 },
      { root: parseDump(MENU(false, true)), at: 3000 },
      [0],
      opts,
    );
    expect(events).toEqual([
      expect.objectContaining({ type: 'added', ref: 'rate-dialog', role: 'dialog' }),
    ]);
    expect(surpriseProblems(events, [0]).notes[0]).toMatchObject({ kind: 'popped-up' });
  });
});

describe('the AndroidWindow’s surprises and frames (fake adb)', () => {
  it('a jump between two looks at Menu comes out of the surprise read, on Fitts’s clock', async () => {
    let banner = false;
    const run: AdbRunner = (args) => {
      const s = args.join(' ');
      const out = s.startsWith('exec-out uiautomator')
        ? MENU(banner)
        : s.includes('density')
          ? 'Physical density: 420'
          : '';
      return Promise.resolve({ code: 0, stdout: Buffer.from(out), stderr: '' });
    };
    const win = new AndroidWindow(
      new Adb(run),
      () => undefined,
      () => undefined,
      undefined,
      {
        screens: [{ route: '/', title: 'Basil & Ember' }],
      },
    );
    await win.snapshot();
    banner = true;
    await win.snapshot();
    const r = await win.run({ op: 'surprise' });
    if (r.op !== 'surprise') throw new Error(r.op);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ type: 'shift', path: '/' });
    expect(typeof r.clock).toBe('number');
    expect((await win.run({ op: 'surprise' })).op === 'surprise').toBe(true);
  });

  it('frames: a thin ring falls back to a before shot and fresh after shots', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    try {
      const run: AdbRunner = (args) =>
        Promise.resolve({
          code: 0,
          stdout: Buffer.from(args.includes('screencap') ? 'png' : ''),
          stderr: '',
        });
      const win = new AndroidWindow(
        new Adb(run),
        () => undefined,
        () => undefined,
      );
      const at = Date.now() - 5000;
      const pending = win.framesAround(at);
      await vi.runAllTimersAsync();
      const frames = await pending;
      expect(frames).toHaveLength(3);
      expect(frames.every((f) => f.jpegBase64 === Buffer.from('jpeg').toString('base64'))).toBe(
        true,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('AndroidWindow.ready (fake adb)', () => {
  const BLANK = `<?xml version='1.0' ?><hierarchy rotation="0">${node({ bounds: '[0,0][1080,2400]' })}</hierarchy>`;
  const windowOver = (dumps: string[]) => {
    let n = 0;
    const run: AdbRunner = (args) =>
      Promise.resolve({
        code: 0,
        stdout: Buffer.from(
          args.join(' ').startsWith('exec-out uiautomator')
            ? (dumps[Math.min(n++, dumps.length - 1)] ?? '')
            : '',
        ),
        stderr: '',
      });
    return new AndroidWindow(
      new Adb(run),
      () => undefined,
      () => undefined,
      undefined,
      {
        screens: [{ route: '/', title: 'Basil & Ember' }],
      },
    );
  };

  it('waits out the reload: the old menu, a blank screen while loading, then the menu', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    try {
      const dumps = [MENU(false), BLANK, BLANK, BLANK, MENU(false)];
      const win = windowOver(dumps);
      const done = win.ready(30_000);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up when no known screen ever shows', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    try {
      const win = windowOver([BLANK]);
      const done = win.ready(5000);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(await done).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

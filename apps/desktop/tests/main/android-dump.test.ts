// @vitest-environment node
// Android (SPEC-phase4 §9.2–9.3): the uiautomator dump parsed into nodes and a snapshot, and the
// probes over it: target size in dp, labels, duplicate labels and bounds, editable descriptions,
// and the pixel contrast estimate.
import {
  androidContrast,
  androidDuplicateBounds,
  androidDuplicateLabel,
  androidEditableDesc,
  androidLabel,
  androidTarget,
  flatten,
  type Pixels,
} from '@fitts/probes';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng } from './png';
import { parseDump, roleOf, toSnapshot } from '../../src/main/android/dump';
import { Adb, inputText, type AdbRunner } from '../../src/main/android/adb';

const node = (attrs: Record<string, string>, children = '') =>
  `<node index="0" text="${attrs['text'] ?? ''}" resource-id="${attrs['id'] ? `com.basilandember.order:id/${attrs['id']}` : ''}" class="${attrs['class'] ?? 'android.view.ViewGroup'}" package="com.basilandember.order" content-desc="${attrs['desc'] ?? ''}" checkable="false" checked="false" clickable="${attrs['clickable'] ?? 'false'}" enabled="true" focusable="${attrs['focusable'] ?? attrs['clickable'] ?? 'false'}" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="${attrs['bounds'] ?? '[0,0][0,0]'}"${children ? `>${children}</node>` : ' />'}`;

// At 420dpi, 48dp is 126px.
const DUMP = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0">${node(
  { bounds: '[0,0][1080,2400]' },
  [
    node({
      class: 'android.widget.TextView',
      text: 'Basil &amp; Ember',
      id: 'header-wordmark',
      bounds: '[40,80][600,160]',
    }),
    // A1: the icon-only cart button (a group with an icon and a count badge read as nothing).
    node(
      { id: 'header-cart-button', clickable: 'true', bounds: '[940,70][1060,190]' },
      node({ class: 'android.widget.ImageView', bounds: '[960,90][1040,170]' }),
    ),
    // A2: a 36dp Remove (95px).
    node({
      id: 'cart-remove-margherita',
      clickable: 'true',
      desc: 'Remove Margherita',
      bounds: '[900,600][995,695]',
    }),
    // A7: the row and its overlay, same bounds.
    node(
      { id: 'menu-row-margherita', clickable: 'true', bounds: '[0,300][1080,520]' },
      node({ class: 'android.widget.TextView', text: 'Margherita', bounds: '[40,320][600,380]' }),
    ),
    node({ id: 'menu-row-favorite-margherita', clickable: 'true', bounds: '[0,300][1080,520]' }),
    // A6's neighbour: two buttons that say the same thing.
    node({
      class: 'android.widget.Button',
      text: 'Add to order',
      clickable: 'true',
      bounds: '[700,420][1040,520]',
    }),
    node({
      class: 'android.widget.Button',
      text: 'Add to order',
      clickable: 'true',
      bounds: '[700,820][1040,920]',
    }),
    node({
      class: 'android.widget.EditText',
      text: '',
      id: 'pickup-name',
      desc: 'Your name',
      clickable: 'true',
      bounds: '[40,1000][1040,1140]',
    }),
  ].join(''),
)}</hierarchy>`;

describe('the uiautomator dump', () => {
  it('parses into a tree with testIDs as refs and a<n> for the rest, entities decoded', () => {
    const root = parseDump(DUMP);
    const all = flatten(root);
    expect(all.find((n) => n.ref === 'header-wordmark')?.text).toBe('Basil & Ember');
    expect(all.find((n) => n.ref === 'cart-remove-margherita')?.bounds).toEqual({
      x: 900,
      y: 600,
      w: 95,
      h: 95,
    });
    expect(all.some((n) => /^a\d+$/.test(n.ref))).toBe(true);
    expect(all.find((n) => n.ref === 'header-cart-button')?.children).toHaveLength(1);
  });

  it('becomes a snapshot: controls with roles and names, the top texts as headings', () => {
    const snap = toSnapshot(parseDump(DUMP), { path: '/', title: 'Menu' });
    expect(snap.path).toBe('/');
    expect(snap.headings).toContain('Basil & Ember');
    expect(snap.nodes.find((n) => n.ref === 'menu-row-margherita')).toMatchObject({
      role: 'button',
      name: 'Margherita',
    });
    expect(snap.nodes.find((n) => n.ref === 'pickup-name')?.role).toBe('textbox');
    expect(roleOf({ cls: 'android.widget.Switch', clickable: true } as never)).toBe('switch');
  });
});

describe('the Android probes', () => {
  const all = flatten(parseDump(DUMP));

  it('target size: under 48dp in either dimension (A2)', () => {
    const items = androidTarget(all, 420);
    expect(items.map((i) => i.ref)).toContain('cart-remove-margherita');
    expect(items.find((i) => i.ref === 'cart-remove-margherita')?.measured).toBe(
      '"Remove Margherita" is 36×36dp',
    );
    expect(items.map((i) => i.ref)).not.toContain('menu-row-margherita');
  });

  it('labels: a clickable icon group with nothing to say (A1)', () => {
    expect(androidLabel(all).map((i) => i.ref)).toEqual([
      'header-cart-button',
      'menu-row-favorite-margherita',
    ]);
  });

  it('duplicate bounds (A7), duplicate labels, editable descriptions', () => {
    expect(androidDuplicateBounds(all)[0]?.ref).toBe('menu-row-margherita');
    expect(androidDuplicateLabel(all)[0]?.measured).toBe(
      '2 controls are all called "Add to order"',
    );
    expect(androidEditableDesc(all).map((i) => i.ref)).toEqual(['pickup-name']);
  });

  it('contrast from the pixels: light grey on cream is flagged (A3), ink on cream is not', () => {
    const W = 200;
    const H = 100;
    const data = new Uint8Array(W * H * 4);
    const paint = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      rgb: [number, number, number],
    ) => {
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) data.set([...rgb, 255], (y * W + x) * 4);
    };
    paint(0, 0, W, H, [0xff, 0xfc, 0xf6]);
    paint(10, 10, 90, 20, [0xb8, 0xaf, 0xa3]); // grey "text" in the first box
    paint(110, 10, 190, 20, [0x1c, 0x16, 0x11]); // ink "text" in the second
    const px: Pixels = { width: W, height: H, data };
    const text = (ref: string, x: number) => ({
      ref,
      cls: 'android.widget.TextView',
      text: 'Wood-fired',
      desc: '',
      bounds: { x, y: 0, w: 90, h: 40 },
      clickable: false,
      focusable: false,
      enabled: true,
      children: [],
    });
    const { items } = androidContrast([text('desc', 0), text('ink', 100)], px, 420);
    expect(items.map((i) => i.ref)).toEqual(['desc']);
    expect(items[0]?.measured).toMatch(/about 2\.\d:1 \(estimate/);
  });
});

describe('adb (over a fake adb)', () => {
  const fake = (out: Record<string, string>): { run: AdbRunner; calls: string[][] } => {
    const calls: string[][] = [];
    return {
      calls,
      run: (args) => {
        calls.push(args);
        const key = Object.keys(out).find((k) => args.join(' ').startsWith(k));
        return Promise.resolve({
          code: 0,
          stdout: Buffer.from(key ? (out[key] ?? '') : ''),
          stderr: '',
        });
      },
    };
  };

  it('reads devices, density, size and the dump; taps, types and opens URLs safely', async () => {
    const f = fake({
      devices: 'List of devices attached\nemulator-5554\tdevice\n',
      'shell wm density': 'Physical density: 420\n',
      'shell wm size': 'Physical size: 1080x2400\n',
      'exec-out uiautomator': `junk${DUMP}UI hierchary dumped to: /dev/tty`,
    });
    const adb = new Adb(f.run);
    expect(await adb.devices()).toEqual(['emulator-5554']);
    expect(await adb.density()).toBe(420);
    expect(await adb.size()).toEqual({ width: 1080, height: 2400 });
    expect((await adb.dump()).startsWith('<?xml')).toBe(true);
    await adb.tap(947.6, 130.2);
    await adb.text('Sam Rivera & co');
    await adb.open(
      'exp+basil-ember-android://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081',
    );
    expect(f.calls).toContainEqual(['shell', 'input', 'tap', '948', '130']);
    expect(f.calls).toContainEqual(['shell', 'input', 'text', 'Sam%sRivera%s\\&%sco']);
    expect(f.calls.at(-1)?.at(-1)).toBe(
      "'exp+basil-ember-android://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081'",
    );
    expect(inputText("it's")).toBe("it\\'s");
  });
});

describe('the real Basil & Ember menu on Fitts_Pixel (recorded dump and screencap)', () => {
  const root = parseDump(readFileSync(resolve(__dirname, '../fixtures/android/menu.xml'), 'utf8'));
  const nodes = flatten(root);

  it('finds the planted issues this screen carries: A1, A3, A7, and A6’s quick-add label', () => {
    expect(androidLabel(nodes).map((i) => i.ref)).toContain('header-cart-button');
    expect(androidDuplicateBounds(nodes).map((i) => i.ref)[0]).toMatch(
      /^menu-row-(favorite-)?margherita$/,
    );
    expect(nodes.filter((n) => n.text === 'Add to order').length).toBeGreaterThan(1);
    const px = decodePng(readFileSync(resolve(__dirname, '../fixtures/android/menu-stock.png')));
    expect(px.width).toBe(1080);
    const low = androidContrast(nodes, px, 420).items.map((i) => i.measured);
    expect(low.some((m) => /^"San Marzano tomato/.test(m))).toBe(true);
    expect(low.some((m) => /^"Margherita Classica"/.test(m))).toBe(false);
  });

  it('names the menu screen from its wordmark header', () => {
    const snap = toSnapshot(root, { path: '/', title: 'Basil & Ember' }, 'com.basilandember.order');
    expect(snap.url).toBe('android://com.basilandember.order/');
    expect(
      snap.nodes.some((n) => n.ref === 'quick-add-margherita' && n.name.startsWith('Add to order')),
    ).toBe(true);
  });
});

describe('dumps one at a time (uiautomator allows one connection)', () => {
  it('overlapping dumps run in turn, and a killed one is tried again', async () => {
    let running = 0;
    let most = 0;
    let killedOnce = false;
    const run: AdbRunner = async () => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 10));
      running -= 1;
      if (!killedOnce) {
        killedOnce = true;
        return { code: 0, stdout: Buffer.from('Killed'), stderr: '' };
      }
      return { code: 0, stdout: Buffer.from(DUMP), stderr: '' };
    };
    const adb = new Adb(run);
    const dumps = await Promise.all([adb.dump(), adb.dump(), adb.dump()]);
    expect(most).toBe(1);
    expect(dumps.every((d) => d.startsWith('<?xml'))).toBe(true);
  });
});

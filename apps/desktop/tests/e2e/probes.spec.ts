// The in-page probes (SPEC-phase2 §7) on fixture pages, in real Chromium: each probe catches
// its problem and passes the fixed version. (demo/chat's planted issues: site-live.spec.ts.)
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROBES = readFileSync(resolve(__dirname, '../../../../packages/probes/dist/page.js'), 'utf8');

interface Item {
  ref: string;
  measured: string;
}
interface Result {
  probe: string;
  pass: boolean;
  items: Item[];
  summary?: string;
}

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env))
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  app = await electron.launch({ args: [resolve(__dirname, 'helpers/probe-host.cjs')], env });
  page = await app.firstWindow();
});

test.afterAll(async () => {
  await app.close();
});

/** Loads a fixture, then the probes and the same ref helper main uses. */
async function load(html: string): Promise<void> {
  await page.setContent(`<!doctype html><html><body>${html}</body></html>`);
  await page.addScriptTag({ content: PROBES });
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    let n = 0;
    const own = (el: Element) =>
      el.getAttribute('data-ref') ??
      el.getAttribute('data-testid') ??
      el.getAttribute('data-fitts-ref');
    w['F'] = {
      refOf: (el: Element) => {
        const r = own(el);
        if (r) return r;
        const id = `e${++n}`;
        el.setAttribute('data-fitts-ref', id);
        return id;
      },
      find: (ref: string) =>
        document.querySelector(`[data-ref="${ref}"],[data-fitts-ref="${ref}"]`),
    };
  });
}

const P = 'window.__fittsProbes';

async function probe(name: string): Promise<Result> {
  const [r] = await page.evaluate<Result[], string>(
    (n) =>
      (
        window as never as {
          __fittsProbes: { run(a: string[], f: unknown): Promise<Result[]> };
          F: unknown;
        }
      ).__fittsProbes.run([n], (window as never as { F: unknown }).F),
    name,
  );
  if (!r) throw new Error(`no result for ${name}`);
  return r;
}

test('contrast: grey text and a pale placeholder fail; dark text passes', async () => {
  await load(`
    <style>.body::placeholder { color: #a1a1a1 }</style>
    <p data-ref="stamp" style="color:#bbb">10/27/26</p>
    <textarea data-ref="compose-body" class="body" placeholder="Write your message"></textarea>`);
  const r = await probe('contrast');
  expect(r.pass).toBe(false);
  expect(r.items.map((i) => i.ref).sort()).toEqual(['compose-body', 'stamp']);
  expect(r.items.find((i) => i.ref === 'compose-body')?.measured).toBe(
    'placeholder contrast 2.6:1',
  );
  await load(
    '<p style="color:#333">10/27/26</p><textarea placeholder="Write" style="color:#222"></textarea>',
  );
  expect((await probe('contrast')).pass).toBe(true);
});

test('target-size: a 28×20 link fails, a 44px button passes', async () => {
  await load(
    `<button data-ref="send" style="width:28px;height:20px;padding:0;border:0">Send</button>`,
  );
  const r = await probe('target-size');
  expect(r.items).toEqual([expect.objectContaining({ ref: 'send', measured: '28×20px' })]);
  await load(`<button style="width:88px;height:44px">Send</button>`);
  expect((await probe('target-size')).pass).toBe(true);
});

test('button-name and link-name: icon-only controls fail', async () => {
  await load(`<button data-ref="call"><svg width="16" height="16"></svg></button>
    <a data-ref="home" href="/x"><svg width="16" height="16"></svg></a>
    <button aria-label="Video call"><svg width="16" height="16"></svg></button>`);
  expect((await probe('button-name')).items.map((i) => i.ref)).toEqual(['call']);
  expect((await probe('link-name')).items.map((i) => i.ref)).toEqual(['home']);
});

test('placeholder-leak: "(null)" is caught on its element', async () => {
  await load(`<div data-ref="compose-to">To: (null)</div><p>All good</p>`);
  const r = await probe('placeholder-leak');
  expect(r.items).toEqual([
    expect.objectContaining({ ref: 'compose-to', measured: 'shows "To: (null)"' }),
  ]);
  await load(`<div>To: Grandma</div>`);
  expect((await probe('placeholder-leak')).pass).toBe(true);
});

test('font-inventory: three families fail, one passes', async () => {
  await load(`<h1 style="font-family:Georgia">Inbox</h1><p style="font-family:system-ui">Hi</p>
    <span style="font-family:'Trebuchet MS'">Send</span>`);
  const r = await probe('font-inventory');
  expect(r.pass).toBe(false);
  expect(r.summary).toMatch(/^3 font families \(georgia, system-ui, trebuchet ms\)/);
  await load(`<div style="font-family:system-ui"><h1>Inbox</h1><p>Hi</p></div>`);
  expect((await probe('font-inventory')).pass).toBe(true);
});

test('spacing: off-grid author padding fails, a 4px grid passes', async () => {
  await load(`<style>.a{padding:22px}.b{padding:7px}.c{margin:13px}.d{padding:8px}</style>
    <div class="a">a</div><div class="b">b</div><div class="c">c</div><div class="d">d</div>`);
  const r = await probe('spacing');
  expect(r.items.map((i) => i.measured.split(' ').at(-1))).toEqual(['7px', '13px', '22px']);
  await load(
    `<style>.a{padding:8px}.b{margin:16px 4px}</style><div class="a">a</div><div class="b">b</div>`,
  );
  expect((await probe('spacing')).pass).toBe(true);
});

test('focus-visible: Tab with outlines removed shows nothing; the default ring passes', async () => {
  const sweep = async () => {
    await page.evaluate(`${P}.focusStart()`);
    // As main's sweep does: stop at the end of the page or when focus wraps around.
    const out: Item[] = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      const r = await page.evaluate<Item | null | 'none'>(`${P}.focusCheck(window.F)`);
      if (r === 'none') break;
      if (r) {
        if (out.some((o) => o.ref === r.ref)) break;
        out.push(r);
      }
    }
    return out;
  };
  await load(
    `<style>*:focus{outline:none}</style><button data-ref="a">A</button><button data-ref="b">B</button>`,
  );
  expect(await sweep()).toEqual([
    expect.objectContaining({ ref: 'a' }),
    expect.objectContaining({ ref: 'b' }),
  ]);
  await load(`<button>A</button><button>B</button>`);
  expect(await sweep()).toEqual([]);
});

test('feedback: what appears after an action, a loading indicator, and generic error text', async () => {
  await load(`<button data-ref="go">Send</button><div id="out"></div>
    <script>
      document.querySelector('[data-ref=go]').onclick = () => {
        document.getElementById('out').innerHTML = '<span class="spinner">Loading…</span>';
        setTimeout(() => { document.getElementById('out').innerHTML = '<p data-ref="compose-error">Error 0x3F</p>'; }, 200);
      };
    </script>`);
  await page.evaluate(`${P}.feedbackArm()`);
  await page.click('[data-ref=go]');
  await page.waitForTimeout(400);
  const fb = await page.evaluate<{
    firstChangeMs: number | null;
    busyMs: number | null;
    errors: Item[];
  }>(`${P}.feedbackRead(window.F)`);
  expect(fb.firstChangeMs).not.toBeNull();
  expect(fb.busyMs).not.toBeNull();
  expect(fb.errors).toEqual([
    expect.objectContaining({
      ref: 'compose-error',
      measured: '"Error 0x3F", no field marked invalid',
    }),
  ]);
});

test('overflow and values: a 2000px row scrolls sideways; field values are read by ref', async () => {
  await load(`<div style="width:2000px">wide</div><input data-ref="name" value="fitts-test">`);
  const items = await page.evaluate<Item[]>(`${P}.overflow(window.F, 1024)`);
  expect(items[0]?.measured).toMatch(/^page is \d+px wide at 1024px$/);
  expect(await page.evaluate(`${P}.valueOf('name', window.F)`)).toBe('fitts-test');
});

test('web-vitals runs and reports LCP and CLS', async () => {
  await load(`<h1>Hello</h1>`);
  expect((await probe('web-vitals')).summary).toMatch(/^LCP \d+ms, CLS \d\.\d\d$/);
});

// Phase 2 P2: the real demo/chat streams into the workspace from an offscreen window.
import { expect, test, type Page } from '@playwright/test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp, type LaunchedApp } from './helpers/launch';

const DEMO = resolve(__dirname, '../../../../demo/chat');
const PORT = '5191';
let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp({ env: { FITTS_E2E_PICK_FOLDER: DEMO, FITTS_SITE_PORT: PORT } });
  await launched.page.setViewportSize({ width: 1440, height: 900 });
});

test.afterEach(async () => {
  await launched.close();
});

const canvas = (page: Page) => page.locator('[data-site-canvas] canvas');
const address = (page: Page) => page.getByLabel('Address');

/** The element's box in the live site, through the same bridge the overlays use. */
async function siteRect(page: Page, ref: string) {
  return page.evaluate(
    async ([id, r]) => {
      const site = (
        window as unknown as {
          fitts: {
            site: {
              rects(
                p: string,
                refs: string[],
              ): Promise<
                Record<string, { left: number; top: number; width: number; height: number }>
              >;
            };
          };
        }
      ).fitts.site;
      return (await site.rects(id, [r]))[r] ?? null;
    },
    ['demo-chat', ref] as const,
  );
}

/** Clicks a site element through the canvas, the way a user does while driving. */
async function clickInSite(page: Page, ref: string) {
  const rect = await siteRect(page, ref);
  if (!rect) throw new Error(`no ${ref} in the site`);
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.click(box.x + rect.left + rect.width / 2, box.y + rect.top + rect.height / 2);
}

test('demo/chat streams live, the user drives it in the interview, and point returns a ref', async () => {
  test.setTimeout(120_000);
  const { page } = launched;
  await page.getByLabel('Meta Model API key').fill('meta-key-12345');
  await expect(page.getByRole('status').filter({ hasText: 'Works' })).toBeVisible();
  await page.getByRole('button', { name: 'Browse' }).click();
  await expect(page.getByText(/Vite \+ React 19/)).toBeVisible();
  await page.getByRole('button', { name: 'Open my project' }).click();

  // The real site, at its start path, painted onto the canvas.
  await expect(address(page)).toHaveValue(`localhost:${PORT}/compose`, { timeout: 60_000 });
  await expect
    .poll(() => canvas(page).evaluate((c: HTMLCanvasElement) => c.width), { timeout: 30_000 })
    .toBeGreaterThan(300);

  // The user drives during the interview: pick Grandma, then NEXT.
  await expect.poll(() => siteRect(page, 'compose-contact-grandma')).not.toBeNull();
  await clickInSite(page, 'compose-contact-grandma');
  await clickInSite(page, 'compose-next-1');
  await expect(address(page)).toHaveValue(`localhost:${PORT}/compose/recipient`);

  // Point at something: a click on the canvas attaches the real element's ref.
  await page.getByRole('button', { name: 'Point at something' }).click();
  const to = await siteRect(page, 'compose-to');
  const box = await canvas(page).boundingBox();
  if (!to || !box) throw new Error('no To field');
  await page.mouse.move(box.x + to.left + 10, box.y + to.top + to.height / 2);
  await page.mouse.click(box.x + to.left + 10, box.y + to.top + to.height / 2);
  await expect(page.getByText('pointing at #compose-to')).toBeVisible();
});

/** The run as main holds it (the same reducer the UI uses). */
async function runState(page: Page) {
  return page.evaluate(async () => {
    const engine = (
      window as unknown as { fitts: { engine: { states(): Promise<Record<string, unknown>> } } }
    ).fitts.engine;
    return (await engine.states())['demo-chat'] as {
      phase: string;
      activity: string;
      routes: { path: string; status: string }[];
      controlsTried: { done: number; total: number };
      overlays: { attention?: { ref: string } };
      chat: { type: string; stateKind?: string; text?: string }[];
      step: number;
    };
  });
}

/** Welcome → interview answer → Start the audit, on the live demo. */
async function startAudit(page: Page) {
  await page.getByLabel('Meta Model API key').fill('meta-key-12345');
  await page.getByRole('button', { name: 'Browse' }).click();
  await expect(page.getByText(/Vite \+ React 19/)).toBeVisible();
  await page.getByRole('button', { name: 'Open my project' }).click();
  await expect(address(page)).toHaveValue(`localhost:${PORT}/compose`, { timeout: 60_000 });
  await page
    .getByLabel('Message Fitts')
    .fill('A messaging app so my grandparents can text the family.');
  await page.getByLabel('Message Fitts').press('Enter');
  await page.getByRole('button', { name: 'Start the audit' }).click();
}

test('the real crawl reaches every route and tries every primary control (coverage gate)', async () => {
  test.setTimeout(240_000);
  const { page } = launched;
  await startAudit(page);

  // While Fitts acts, the cobalt attention box sits on the real element it's acting on.
  await expect
    .poll(async () => (await runState(page)).overlays.attention?.ref ?? null, { timeout: 30_000 })
    .not.toBeNull();

  await expect
    .poll(
      async () =>
        (await runState(page)).chat.some(
          (c) =>
            c.stateKind === 'nothing-found' ||
            (c.type === 'fitts.message' && /All done/.test(c.text ?? '')),
        ),
      {
        timeout: 200_000,
        intervals: [2000],
      },
    )
    .toBe(true);
  const s = await runState(page);
  const paths = s.routes.map((r) => r.path);
  for (const p of [
    '/',
    '/compose',
    '/compose/recipient',
    '/compose/confirm',
    '/search',
    '/contacts',
    '/contacts/grandma',
    '/settings',
  ])
    expect(paths).toContain(p);
  expect(s.routes.every((r) => r.status === 'done')).toBe(true);
  expect(s.controlsTried.total).toBeGreaterThan(30);
  expect(s.controlsTried.done).toBe(s.controlsTried.total);
  // P6: probe findings end the run on the Run summary, which reports the coverage.
  await expect(
    page.getByText(new RegExp(`I opened \\d+ pages and tried ${s.controlsTried.total} controls`)),
  ).toBeVisible();

  // P5: each probe catches its planted issue (demo/chat PLANTED.md), read from the run log.
  const probes = probeResults();
  const failing = (probe: string) => probes.filter((r) => r.probe === probe && !r.pass);
  const refs = (probe: string) => failing(probe).flatMap((r) => r.items.map((i) => i.ref));
  const said = (probe: string) =>
    failing(probe)
      .flatMap((r) => r.items.map((i) => i.measured))
      .join(' | ');
  expect(refs('placeholder-leak')).toContain('compose-to'); // #1
  expect(refs('label-consistency')).toEqual(
    expect.arrayContaining(['compose-next', 'compose-create', 'compose-send']),
  ); // #2
  expect(said('feedback-timing')).toMatch(/"Send Text" saved with no confirmation/); // #3
  expect(failing('back-mid-flow').map((r) => r.route)).toContain('/compose/recipient'); // #4, #5
  expect(said('back-mid-flow')).toMatch(/no back or cancel control/);
  expect(refs('target-size')).toContain('compose-send'); // #7
  expect(refs('contrast')).toContain('compose-body'); // #8
  expect(failing('contrast').map((r) => r.route)).toContain('/'); // #9
  expect(said('network')).toMatch(/requests for 10 characters typed/); // #10
  expect(said('network')).toMatch(/\/api\/search fetched \d+ times, no Cache-Control or ETag/); // #11
  expect(said('network')).toMatch(/\/api\/search returns 1\.\d MB, 20,000 items/); // #12
  expect(said('feedback-timing')).toMatch(/wait with no loading indicator/); // #13
  expect(refs('error-message')).toContain('compose-error'); // #14
  expect(refs('button-name')).toEqual(expect.arrayContaining(['thread-call', 'thread-video'])); // #17
  expect(failing('font-inventory').length).toBeGreaterThan(0); // #19
  expect(failing('spacing').length).toBeGreaterThan(0); // #20
  expect(failing('focus-visible').length).toBeGreaterThan(0); // #23
  expect(refs('links')).toContain('inbox-help'); // #24
  expect(probes.every((r) => /^run-\d+-ev\d+$/.test(r.evidenceId))).toBe(true);
});

interface LoggedProbe {
  evidenceId: string;
  probe: string;
  route: string;
  pass: boolean;
  items: { ref: string; measured: string }[];
}

/** Every probe.result in demo/chat's run logs. */
function probeResults(): LoggedProbe[] {
  const runs = join(launched.userData, 'projects', 'demo-chat', 'runs');
  const out: LoggedProbe[] = [];
  for (const run of readdirSync(runs)) {
    const file = join(runs, run, 'events.ndjson');
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.includes('"probe.result"')) continue;
      const { event } = JSON.parse(line) as { event: { result: LoggedProbe } };
      out.push(event.result);
    }
  }
  return out;
}

test('take the wheel on the live site pauses the crawl and logs clicks by name; rewind shows a stored step shot', async () => {
  test.setTimeout(120_000);
  const { page } = launched;
  await startAudit(page);
  await expect
    .poll(async () => (await runState(page)).step, { timeout: 30_000 })
    .toBeGreaterThan(3);

  const controls = page.getByRole('group', { name: 'Run controls' });
  await controls.getByRole('button', { name: 'Take the wheel' }).click();
  await expect.poll(async () => (await runState(page)).activity).toBe('user-driving');
  await page.waitForTimeout(800);
  const step = (await runState(page)).step;
  await page.evaluate(() => {
    const site = (
      window as unknown as {
        fitts: { site: { nav(p: string, n: { kind: 'path'; path: string }): void } };
      }
    ).fitts.site;
    site.nav('demo-chat', { kind: 'path', path: '/compose/recipient' });
  });
  await expect(address(page)).toHaveValue(`localhost:${PORT}/compose/recipient`);
  await expect.poll(() => siteRect(page, 'compose-create')).not.toBeNull();
  await clickInSite(page, 'compose-create');
  await expect(address(page)).toHaveValue(`localhost:${PORT}/compose/confirm`);
  // Fitts didn't act while the user drove.
  expect((await runState(page)).step).toBe(step);
  await controls.getByRole('button', { name: 'Hand back to Fitts' }).click();
  await expect(page.getByRole('log', { name: 'Conversation with Fitts' })).toContainText(
    'Create Message',
  );
  await expect
    .poll(async () => (await runState(page)).step, { timeout: 20_000 })
    .toBeGreaterThan(step);

  // Rewind to step 2: its stored shot replaces the live canvas.
  await controls.getByRole('button', { name: 'Pause' }).click();
  await page.evaluate(() => {
    const engine = (window as unknown as { fitts: { engine: { call(c: unknown): void } } }).fitts
      .engine;
    engine.call({ projectId: 'demo-chat', method: 'rewindTo', args: [2] });
  });
  const shot = page.locator('img[src^="fitts-asset://"]');
  await expect(shot).toBeVisible();
  await expect
    .poll(() => shot.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(300);
});

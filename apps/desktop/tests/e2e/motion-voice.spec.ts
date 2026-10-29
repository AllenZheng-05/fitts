import { expect, test, type Page } from '@playwright/test';
import { completeSetup, loadScenario } from './helpers/flows';
import { launchApp, type LaunchedApp } from './helpers/launch';

let launched: LaunchedApp;

interface Body {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
}

const field = (page: Page) => page.locator('[data-shape-field]');
const frames = (page: Page) => page.evaluate(() => window.__fittsShapes?.frames ?? 0);
const bodies = (page: Page) =>
  page.evaluate(() => (window.__fittsShapes ? window.__fittsShapes.bodies() : []) as Body[]);
const audio = (page: Page) =>
  page.evaluate(() => (window as { __fittsAudio?: string[] }).__fittsAudio ?? []);

async function waitForField(page: Page, mode: string) {
  await expect(field(page)).toHaveAttribute('data-shape-field', mode);
  await expect.poll(() => frames(page), { timeout: 10_000 }).toBeGreaterThan(3);
}

test.beforeEach(async () => {
  launched = await launchApp();
  await launched.page.setViewportSize({ width: 1440, height: 900 });
});

test.afterEach(async () => {
  await launched.close();
});

test('Welcome: lively shapes, and the emblem lands on the target', async () => {
  const { page } = launched;
  await waitForField(page, 'lively');
  await expect(page.locator('[data-emblem]')).toHaveAttribute('data-emblem', 'arrived');
  expect((await bodies(page)).length).toBe(10);
});

test('renders at most 30 frames a second', async () => {
  const { page } = launched;
  await waitForField(page, 'lively');
  const before = await frames(page);
  await page.waitForTimeout(2_000);
  const perSecond = ((await frames(page)) - before) / 2;
  expect(perSecond).toBeGreaterThan(10);
  expect(perSecond).toBeLessThanOrEqual(33);
});

test('pauses while the window is blurred', async () => {
  const { page } = launched;
  await waitForField(page, 'lively');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(300);
  const paused = await frames(page);
  await page.waitForTimeout(800);
  expect((await frames(page)) - paused).toBeLessThanOrEqual(1);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => frames(page)).toBeGreaterThan(paused + 5);
});

test('reduced motion keeps the shapes still', async () => {
  const { page } = launched;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(field(page)).toHaveAttribute('data-shape-field', 'still');
});

test('the cursor reaches the shapes only while the mouse is held on the backdrop', async () => {
  const { page } = launched;
  await waitForField(page, 'lively');
  const cursorActive = () => page.evaluate(() => window.__fittsShapes?.cursorActive() ?? false);

  // Sweeping over the shapes without pressing: the cursor isn't in the physics scene.
  for (const b of (await bodies(page)).slice(0, 4)) {
    await page.mouse.move(b.x, b.y, { steps: 4 });
  }
  expect(await cursorActive()).toBe(false);

  // Pressing on a button doesn't bring it in either.
  await page.getByRole('button', { name: 'Allow microphone' }).hover();
  await page.mouse.down();
  expect(await cursorActive()).toBe(false);
  await page.mouse.up();

  // Pressing on empty backdrop (no shape under it, which would start a drag) does.
  const point = await page.evaluate(
    (list: Body[]) => {
      for (let y = 40; y < window.innerHeight; y += 40) {
        for (let x = 40; x < window.innerWidth; x += 40) {
          const el = document.elementFromPoint(x, y);
          const backdrop =
            el?.hasAttribute('data-backdrop') ||
            el === document.documentElement ||
            el === document.body;
          if (backdrop && list.every((b) => Math.hypot(b.x - x, b.y - y) > 140)) return { x, y };
        }
      }
      return null;
    },
    await bodies(page),
  );
  if (!point) throw new Error('no empty backdrop');
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await expect.poll(cursorActive).toBe(true);
  await page.mouse.up();
  await expect.poll(cursorActive).toBe(false);
});

test('a shape on the backdrop can be dragged and thrown', async () => {
  const { page } = launched;
  await waitForField(page, 'lively');
  await page.waitForTimeout(500);
  const all = await bodies(page);
  const onBackdrop = await page.evaluate((list: Body[]) => {
    return list.filter((b) => {
      const el = document.elementFromPoint(b.x, b.y);
      return (
        el?.hasAttribute('data-backdrop') || el === document.documentElement || el === document.body
      );
    });
  }, all);
  // A large solid shape, so the press can't miss it while it drifts (the torus has a hole).
  const target = onBackdrop.find((b) => /^(sphere-0|box-1|capsule-3)$/.test(b.id));
  if (!target) throw new Error('no shape on the backdrop');
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.mouse.move(target.x + 60, target.y + 10, { steps: 4 });
  await page.mouse.move(target.x + 180, target.y + 30, { steps: 3 });
  await page.mouse.up();
  const thrown = (await bodies(page)).find((b) => b.id === target.id);
  const speed = thrown ? Math.hypot(thrown.vx, thrown.vy) : 0;
  expect(speed).toBeGreaterThan(50);
  // Throws are capped (1600 px/s).
  expect(speed).toBeLessThanOrEqual(1610);

  // A hard fling at the edge still leaves every shape on screen: the window edge is a wall.
  const again = (await bodies(page)).find((b) => b.id === target.id);
  if (!again) throw new Error('shape gone');
  await page.mouse.move(again.x, again.y);
  await page.mouse.down();
  await page.mouse.move(0, again.y, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  const size = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  for (const b of await bodies(page)) {
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x).toBeLessThanOrEqual(size.w);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeLessThanOrEqual(size.h);
    // However hard they hit, no shape spins faster than 4 rad/s.
    expect(b.spin).toBeLessThanOrEqual(4.05);
  }
});

test('a shape behind see-through text can be grabbed through it', async () => {
  const { page } = launched;
  await waitForField(page, 'lively');
  const heading = await page.getByRole('heading', { level: 1 }).boundingBox();
  if (!heading) throw new Error('no heading');
  const hx = heading.x + heading.width / 2;
  const hy = heading.y + heading.height / 2;

  // Park a large shape behind the heading: drag it there and let go without a throw.
  const free = await page.evaluate(
    (list: Body[]) => {
      return list.filter((b) => {
        const el = document.elementFromPoint(b.x, b.y);
        return (
          el?.hasAttribute('data-backdrop') ||
          el === document.documentElement ||
          el === document.body
        );
      });
    },
    await bodies(page),
  );
  const target = free.find((b) => /^(sphere-0|box-1|capsule-3)$/.test(b.id));
  if (!target) throw new Error('no shape on the backdrop');
  const id = target.id;
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.mouse.move(hx, hy, { steps: 6 });
  await page.waitForTimeout(200);
  await page.mouse.up();

  // Press on the heading text right over the shape: it's grabbed, not the text.
  const parked = (await bodies(page)).find((b) => b.id === id);
  if (!parked) throw new Error('shape gone');
  await page.mouse.move(parked.x, parked.y);
  await page.mouse.down();
  await page.mouse.move(parked.x, parked.y + 160, { steps: 6 });
  await expect
    .poll(async () => (await bodies(page)).find((b) => b.id === id)?.y ?? 0)
    .toBeGreaterThan(parked.y + 100);
  await page.mouse.up();
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
});

test('Settings: floating shapes off, and shape movement', async () => {
  const { page } = launched;
  await completeSetup(page);
  await waitForField(page, 'calm');
  await page.keyboard.press('ControlOrMeta+,');
  await page.getByRole('button', { name: 'Voice & appearance' }).click();
  const slider = page.getByLabel('Shape movement');
  await slider.fill('2');
  await expect(field(page)).toHaveAttribute('data-shape-field', 'lively');
  await slider.fill('0');
  await expect(field(page)).toHaveAttribute('data-shape-field', 'still');
  await page.getByRole('switch', { name: 'Floating shapes' }).click();
  await expect(field(page)).toHaveCount(0);
});

test('Fitts speaks new lines when speaking is on, and the mic chimes', async () => {
  const { page } = launched;
  await loadScenario(page, 'Interview');
  await page.getByRole('button', { name: "Mute Fitts's voice" }).click();
  await expect(page.getByRole('button', { name: "Mute Fitts's voice" })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  const mic = page.getByRole('button', { name: 'Talk to Fitts' });
  await mic.click();
  await mic.click();
  await expect
    .poll(() => audio(page))
    .toEqual(
      expect.arrayContaining([
        'chime:start',
        'chime:stop',
        'say:Got it. I can see the compose screen right now. Where do they get stuck?',
      ]),
    );
});

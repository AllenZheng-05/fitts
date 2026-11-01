// The component chain behind an element (SPEC-phase4 §2.2), on a real React 19 page in real
// Chromium: the host stamp, then each component with its call site, nearest first. The fixture
// is bundled once in dev mode with the plugin's stamps (helpers/build-react-fixture.mjs).
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { SourceFrame } from '@fitts/schema';
import { SOURCE_CHAIN_FN } from '../../src/main/site/source-chain';

let app: ElectronApplication;
let page: Page;
let out: string;

function bundle(flags: string[] = []): string {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env))
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  // Through tsx (a root dev dependency): the script imports the plugin's TypeScript source.
  execFileSync(
    process.execPath,
    ['--import', 'tsx', resolve(__dirname, 'helpers/build-react-fixture.mjs'), out, ...flags],
    { env, stdio: 'pipe', timeout: 120_000 },
  );
  return readFileSync(join(out, 'bundle.js'), 'utf8');
}

test.beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), 'fitts-react-chain-'));
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env))
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  app = await electron.launch({ args: [resolve(__dirname, 'helpers/probe-host.cjs')], env });
  page = await app.firstWindow();
});

test.afterAll(async () => {
  await app.close();
  rmSync(out, { recursive: true, force: true });
});

async function render(script: string): Promise<SourceFrame[]> {
  await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
  await page.addScriptTag({ content: script });
  await expect(page.locator('button.btn')).toHaveText('Send');
  return page.evaluate<SourceFrame[]>(`(${SOURCE_CHAIN_FN})('button.btn')`);
}

test('with the plugin: host Button.tsx, then call Compose.tsx (Button), then call main.tsx (ComposePage)', async () => {
  test.setTimeout(180_000);
  const frames = await render(bundle());
  expect(frames[0]).toEqual({ kind: 'host', src: expect.stringMatching(/^Button\.tsx:5:5$/) });
  expect(frames[1]).toEqual({
    kind: 'call',
    component: 'Button',
    src: expect.stringMatching(/^Compose\.tsx:7:7$/),
  });
  expect(frames[2]).toEqual({
    kind: 'call',
    component: 'ComposePage',
    src: expect.stringMatching(/^main\.tsx:5:35$/),
  });
  expect(frames.length).toBeLessThanOrEqual(8);
});

test('without the plugin: components are still named, from React’s own debug info when it has any', async () => {
  test.setTimeout(180_000);
  const frames = await render(bundle(['--no-plugin']));
  // No stamps: no host frame, and every component frame is a `debug` one.
  expect(frames.every((f) => f.kind === 'debug')).toBe(true);
  expect(frames.map((f) => f.component)).toEqual(['Button', 'ComposePage']);
});

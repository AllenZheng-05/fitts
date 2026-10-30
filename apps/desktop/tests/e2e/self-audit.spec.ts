// Fitts audits its own Settings screen (SPEC-phase2 §17, P12) with the same probes it runs on
// users' sites. Accessibility probes must pass; look-and-feel probes are reported (Fitts uses
// three families on purpose: display, body and mono).
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { completeSetup } from './helpers/flows';
import { launchApp, type LaunchedApp } from './helpers/launch';

const PROBES = readFileSync(resolve(__dirname, '../../../../packages/probes/dist/page.js'), 'utf8');
const MUST_PASS = ['contrast', 'target-size', 'button-name', 'link-name', 'placeholder-leak'];

interface Result {
  probe: string;
  pass: boolean;
  items: { ref: string; selector: string; measured: string }[];
  summary?: string;
}

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
  await launched.page.setViewportSize({ width: 1440, height: 900 });
  await completeSetup(launched.page);
});

test.afterEach(async () => {
  await launched.close();
});

test('Fitts’s own Settings screen passes its accessibility probes', async () => {
  const { page } = launched;
  await page.keyboard.press('ControlOrMeta+,');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  // The way Fitts probes any site: main injects the bundle into an isolated world (1001), where
  // the page's CSP (which blocks inline scripts here) doesn't apply.
  const iso = <T>(code: string) =>
    launched.app.evaluate(
      ({ BrowserWindow }, c) =>
        BrowserWindow.getAllWindows()
          .find((w) => !w.webContents.isOffscreen())
          ?.webContents.executeJavaScriptInIsolatedWorld(1001, [{ code: c }]),
      code,
    ) as Promise<T>;
  await iso(PROBES);
  await iso(`window.F = (() => {
    let n = 0;
    const refOf = (el) => el.getAttribute('data-ref') || el.getAttribute('data-fitts-ref') || (el.setAttribute('data-fitts-ref', 'self-' + ++n), 'self-' + n);
    const find = (ref) => document.querySelector('[data-fitts-ref="' + ref + '"]');
    return { refOf, find };
  })(); true`);
  const results = await iso<Result[]>(
    `window.__fittsProbes.run(${JSON.stringify(['contrast', 'target-size', 'button-name', 'link-name', 'placeholder-leak', 'font-inventory', 'spacing'])}, window.F)`,
  );
  // Focus: real Tab presses, as main's sweep does.
  await iso('window.__fittsProbes.focusStart()');
  const focus: Result['items'] = [];
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    const r = await iso<Result['items'][number] | null | 'none'>(
      'window.__fittsProbes.focusCheck(window.F)',
    );
    if (r === 'none') break;
    if (r) {
      if (focus.some((f) => f.ref === r.ref)) break;
      focus.push(r);
    }
  }
  const lines = [
    ...results.map(
      (r) =>
        `${r.pass ? 'pass' : 'FAIL'} ${r.probe}${r.summary ? ` · ${r.summary}` : ''}${r.items.length ? `\n    ${r.items.map((i) => `${i.measured} (${i.selector})`).join('\n    ')}` : ''}`,
    ),
    `${focus.length ? 'FAIL' : 'pass'} focus-visible${focus.length ? `\n    ${focus.map((i) => i.selector).join('\n    ')}` : ''}`,
  ];
  console.log(`\nSelf-audit of Settings:\n${lines.join('\n')}\n`);
  for (const r of results.filter((x) => MUST_PASS.includes(x.probe)))
    expect(r.items.map((i) => `${r.probe}: ${i.measured} (${i.selector})`)).toEqual([]);
  expect(focus.map((i) => i.selector)).toEqual([]);
});

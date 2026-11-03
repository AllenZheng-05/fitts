// The report uses the app's tokens through a copy, like the site; a change in the app's tokens
// that the report doesn't follow fails here.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(import.meta.dirname, '../../..', p), 'utf8');

it('tokens.css is the app’s, unchanged', () => {
  expect(read('packages/run-report/src/tokens.css')).toBe(
    read('apps/desktop/src/renderer/styles/tokens.css'),
  );
});

it('the stylesheet uses no color, radius or shadow that isn’t a token', () => {
  const css = read('packages/run-report/src/report.css');
  expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  expect(css).not.toMatch(/rgba?\(/);
  expect(css).not.toMatch(/border-radius:[^;]*\d(px|rem|em|%)/);
  expect(css).not.toMatch(/box-shadow:[^;]*\d(px|rem|em)/);
});

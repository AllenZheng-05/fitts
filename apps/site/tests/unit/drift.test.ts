// The site keeps copies of things that live only inside apps/desktop. Each copy is compared with
// its source here, so a change in the app that the site doesn't follow fails CI (SITE-DECISIONS).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as appShapes from '../../../desktop/src/renderer/features/background/shapes';
import * as siteShapes from '../../src/field/shapes';

const desktop = (p: string) =>
  readFileSync(resolve(import.meta.dirname, '../../../desktop', p), 'utf8');
const site = (p: string) => readFileSync(resolve(import.meta.dirname, '../..', p), 'utf8');

describe('copies of the app', () => {
  it('tokens.css is the app’s, unchanged', () => {
    expect(site('src/styles/tokens.css')).toBe(desktop('src/renderer/styles/tokens.css'));
  });

  it('the field’s layout() places the same shapes as the app’s', () => {
    for (const mode of ['lively', 'calm', 'still'] as const)
      for (const [w, h] of [
        [1440, 900],
        [1280, 800],
        [390, 844],
        [320, 640],
      ] as const)
        expect(siteShapes.layout(mode, w, h)).toEqual(appShapes.layout(mode, w, h));
  });

  it('seeThrough.ts is the app’s, unchanged', () => {
    expect(site('src/field/seeThrough.ts')).toBe(
      desktop('src/renderer/features/background/seeThrough.ts'),
    );
  });

  it('the Fitts mark draws the same paths as the app’s', () => {
    const shapes = (src: string) =>
      [...src.matchAll(/\b(d|cx|cy|r|x|y|width|height)="([^"]+)"/g)].map((m) => `${m[1]}=${m[2]}`);
    const app = shapes(desktop('src/renderer/components/brand/FittsMark.tsx'));
    const ours = site('src/components/brand.tsx');
    const mark = ours.slice(0, ours.indexOf('export function GitHubMark'));
    expect(shapes(mark)).toEqual(app);
  });

  it('ShapeField keeps the app’s physics constants', () => {
    const constants = (src: string) =>
      [
        ...src.matchAll(
          /^const (FPS|MAX_SPEED|MAX_SPIN|THROW_WINDOW_MS|THROW_SCALE|THROW_MAX|CRUISE|SPIN|SETTLE|CURSOR_RADIUS) = (.+);$/gm,
        ),
      ].map((m) => `${m[1]}=${m[2]}`);
    const app = constants(desktop('src/renderer/features/background/ShapeField.tsx'));
    expect(app.length).toBe(10);
    expect(constants(site('src/field/ShapeField.tsx'))).toEqual(app);
  });
});

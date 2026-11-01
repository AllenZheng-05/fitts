// @vitest-environment node
// The component chain's pure parts (SPEC-phase4 §2.2): cleaning what the page returns and
// mapping a debug frame's dev-server URL to a project path.
import { describe, expect, it } from 'vitest';
import {
  cleanFrames,
  mapDebugSrc,
  MAX_FRAMES,
  selectorFor,
  SOURCE_CHAIN_FN,
} from '../../src/main/site/source-chain';

describe('cleanFrames', () => {
  it('keeps well-shaped frames, trims them, and drops the rest', () => {
    expect(
      cleanFrames([
        { kind: 'host', src: 'src/Button.tsx:12:5' },
        { kind: 'call', component: 'Button', src: 'src/Compose.tsx:118:9' },
        { kind: 'debug', component: 'x'.repeat(200) },
        { kind: 'nope', src: 'a' },
        { kind: 'call' },
        'junk',
        null,
      ]),
    ).toEqual([
      { kind: 'host', src: 'src/Button.tsx:12:5' },
      { kind: 'call', component: 'Button', src: 'src/Compose.tsx:118:9' },
      { kind: 'debug', component: 'x'.repeat(80) },
    ]);
    expect(cleanFrames(undefined)).toEqual([]);
    expect(cleanFrames('x')).toEqual([]);
  });

  it('never returns more than the cap', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ kind: 'call', component: `C${i}` }));
    expect(cleanFrames(many)).toHaveLength(MAX_FRAMES);
  });
});

describe('mapDebugSrc', () => {
  const origin = 'http://localhost:5173';
  it('maps a dev-server URL to the path after the origin, dropping the query', () => {
    expect(mapDebugSrc(`${origin}/src/pages/Compose.tsx?t=1730000:118:9`, origin)).toBe(
      'src/pages/Compose.tsx:118:9',
    );
  });

  it('maps Vite’s /@fs/ absolute paths under the project folder', () => {
    expect(
      mapDebugSrc(`${origin}/@fs/C:/code/site/src/App.tsx:3:1`, origin, 'C:\\code\\site'),
    ).toBe('src/App.tsx:3:1');
    expect(mapDebugSrc(`${origin}/@fs/home/a/site/src/App.tsx:3:1`, origin, '/home/a/site')).toBe(
      'src/App.tsx:3:1',
    );
  });

  it('leaves other origins and plain paths as they are', () => {
    expect(mapDebugSrc('https://cdn.example.com/x.js:1:1', origin)).toBe(
      'https://cdn.example.com/x.js:1:1',
    );
    expect(mapDebugSrc('src/App.tsx:3:1', origin)).toBe('src/App.tsx:3:1');
    expect(mapDebugSrc('not a frame', origin)).toBe('not a frame');
  });
});

describe('the main-world function', () => {
  it('is a plain function expression that takes a selector (no isolated-world helpers)', () => {
    expect(SOURCE_CHAIN_FN.startsWith('function (selector)')).toBe(true);
    expect(SOURCE_CHAIN_FN).not.toContain('F.find');
    expect(selectorFor('e12')).toBe('[data-ref="e12"],[data-testid="e12"],[data-fitts-ref="e12"]');
  });
});

import { describe, expect, it } from 'vitest';
import { LOCAL_PATH, REDACTED, scanText, scrub, scrubDeep } from '../src/scrub';

describe('scrub', () => {
  it.each([
    'sk-proj-AbCdEf1234567890GhIjKlMn',
    'sk_3f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c',
    'ghp_1234567890abcdefghijABCDEFGHIJ123456',
    'github_pat_11ABCDEFG0123456789_abcdefghijklmnop',
    'xoxb-1234567890-abcdefghij',
    'AKIAIOSFODNN7EXAMPLE',
    'AIzaSyA1234567890abcdefghijklmnopqrstu',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    'Zx81Kq3mN7pR2tV9wY4bC6dF0gH5jL1s',
  ])('redacts the key %s', (key) => {
    const out = scrub(`the key is ${key} here`);
    expect(out).not.toContain(key);
    expect(out).toContain(REDACTED);
    expect(scanText(out)).toEqual([]);
  });

  it('keeps the label and drops the value', () => {
    expect(scrub('api_key=abcdef123456')).toBe(`api_key=${REDACTED}`);
    expect(scrub('"password": "correct horse 9"')).toContain(REDACTED);
    expect(scrub('Authorization: Bearer abc.def-ghi_1234')).not.toContain('abc.def-ghi_1234');
  });

  it.each([
    'C:\\Users\\Plasm\\Projects\\fitts\\demo\\chat',
    'C:/Users/Plasm/AppData/Roaming/Fitts/projects',
    '/Users/allen/Code/site/src/App.tsx',
    '/home/allen/projects/site',
    '/tmp/fitts-e2e-abc/projects',
    '/var/folders/xy/abc123/T/fitts',
    'file:///C:/Users/Plasm/report.html',
    '\\\\server\\share\\folder',
    '~/Projects/fitts',
  ])('replaces the local path %s', (path) => {
    const out = scrub(`opened ${path} once`);
    expect(out).not.toContain(path);
    expect(out).toContain(LOCAL_PATH);
    expect(scanText(out)).toEqual([]);
  });

  it.each([
    'Tap **Grandma**',
    'src/pages/Compose.tsx:35:11',
    'http://localhost:5192/compose',
    'https://www.w3.org/WAI/WCAG22/Understanding/focus-visible',
    'https://github.com/AllenZheng-05/fitts/pull/12',
    '29896e25277ef3bef9b0c69b34742e0d357b2619+dirty',
    'assets/moment-obs-58-0.jpg',
    'compose-contact-grandma',
    '/home/feed',
    'Text contrast 3.6:1 (needs at least 4.5:1)',
    'The token was refreshed after 30 minutes.',
    'fonts/bricolage-grotesque-latin-wght-normal.woff2',
    'page.getByTestId("compose-contact-grandma").click();',
  ])('leaves ordinary text alone: %s', (text) => {
    expect(scrub(text)).toBe(text);
    expect(scanText(text)).toEqual([]);
  });

  it('reaches every string in a nested value, keys too', () => {
    const v = scrubDeep({
      a: ['ok', { 'C:\\Users\\x\\y': 'sk-live-1234567890abcdefXYZ' }],
      n: 3,
      b: true,
    });
    expect(JSON.stringify(v)).not.toMatch(/Users|sk-live/);
    expect(v.n).toBe(3);
  });
});

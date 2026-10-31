// @vitest-environment node
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fontFaceCss, FontStore, nearestWeight } from '../../src/main/fonts/fonts';

const meta = (id: string, family: string, weights: number[]) => ({
  id,
  family,
  weights,
  styles: ['normal'],
  subsets: ['latin', 'latin-ext'],
  defSubset: 'latin',
  license: 'OFL-1.1',
  variants: Object.fromEntries(
    weights.map((w) => [
      String(w),
      { normal: { latin: { url: { woff2: `https://cdn.example/${id}/latin-${w}.woff2` } } } },
    ]),
  ),
});

/** A Fontsource stand-in: two families, one only findable by name. No network. */
function fakeFetch() {
  const urls: string[] = [];
  const families: Record<string, ReturnType<typeof meta>> = {
    archivo: meta('archivo', 'Archivo', [400, 800]),
    'm-plus-rounded-1c': meta('m-plus-rounded-1c', 'M PLUS Rounded 1c', [400, 700]),
  };
  const json = (body: unknown, ok = true) =>
    ({ ok, status: ok ? 200 : 404, json: () => Promise.resolve(body) }) as unknown as Response;
  const fetchFn = (url: string) => {
    urls.push(url);
    if (url.startsWith('https://cdn.example/'))
      return Promise.resolve({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode(`woff2:${url}`).buffer),
      } as unknown as Response);
    const search = /\?family=(.*)$/.exec(url);
    if (search) {
      const name = decodeURIComponent(search[1] ?? '').toLowerCase();
      return Promise.resolve(
        json(Object.values(families).filter((f) => f.family.toLowerCase() === name)),
      );
    }
    const id = decodeURIComponent(url.split('/').pop() ?? '');
    return Promise.resolve(families[id] ? json(families[id]) : json({}, false));
  };
  return { urls, fetchFn };
}

let dir = '';
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('fonts for a redesign', () => {
  it('downloads the nearest weights once, then serves them from the cache', async () => {
    dir = mkdtempSync(join(tmpdir(), 'fitts-fonts-'));
    const { urls, fetchFn } = fakeFetch();
    const store = new FontStore(dir, fetchFn);
    const got = await store.files({ family: 'Archivo', id: 'archivo', weights: [400, 700] });
    expect(got?.family).toBe('Archivo');
    expect(got?.license).toBe('OFL-1.1');
    expect(got?.files.map((f) => f.weight)).toEqual([400, 800]);
    for (const f of got?.files ?? []) expect(existsSync(f.path)).toBe(true);
    const before = urls.length;
    await store.files({ family: 'Archivo', id: 'archivo', weights: [400, 700] });
    expect(urls.length).toBe(before);
  });

  it('finds a font the owner named by its family, and gives up on one that doesn’t exist', async () => {
    dir = mkdtempSync(join(tmpdir(), 'fitts-fonts-'));
    const { fetchFn } = fakeFetch();
    const store = new FontStore(dir, fetchFn);
    const named = await store.files({ family: 'M PLUS Rounded 1c', weights: [700] });
    expect(named?.id).toBe('m-plus-rounded-1c');
    expect(await store.files({ family: 'Not A Real Font', weights: [400] })).toBeNull();
  });

  it('writes @font-face rules for the copied files', () => {
    const css = fontFaceCss(
      [
        {
          family: 'Archivo',
          id: 'archivo',
          license: 'OFL-1.1',
          files: [{ weight: 800, path: 'x' }],
        },
      ],
      '/fitts/fonts',
    );
    expect(css).toContain('font-family: "Archivo"');
    expect(css).toContain('url("/fitts/fonts/archivo-800.woff2")');
    expect(css).toContain('font-display: swap');
    expect(nearestWeight(700, [400, 800])).toBe(800);
    expect(nearestWeight(500, [400, 600])).toBe(600);
  });
});

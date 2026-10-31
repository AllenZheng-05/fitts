// Fonts for a redesign (the design library, docs/DECISIONS.md): the woff2 files a direction
// names, from Fontsource (Google Fonts and other open-licensed faces), cached in Fitts's own
// folder so each family downloads once. The only network calls here are to Fontsource's API and
// its CDN; the files then go into the project, so the site never loads fonts from a third party.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://api.fontsource.org/v1/fonts';
const TIMEOUT_MS = 20_000;

export interface FontRequest {
  family: string;
  /** The Fontsource id, when known (a library font); otherwise found from the family. */
  id?: string;
  weights: number[];
}

export interface FontFiles {
  family: string;
  id: string;
  license: string;
  /** One woff2 per weight, in the cache. */
  files: { weight: number; path: string }[];
}

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

interface Meta {
  id: string;
  family: string;
  weights: number[];
  styles: string[];
  subsets: string[];
  defSubset?: string;
  license?: string;
  variants?: Record<string, Record<string, Record<string, { url: { woff2?: string } }>>>;
}

const slug = (family: string) =>
  family
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** The available weight closest to the one asked for (ties go heavier). */
export const nearestWeight = (want: number, have: number[]) =>
  [...have].sort((a, b) => Math.abs(a - want) - Math.abs(b - want) || b - a)[0] ?? 400;

export class FontStore {
  constructor(
    private readonly cacheDir: string,
    private readonly fetchFn: Fetch = (url, init) => fetch(url, init),
  ) {}

  private async get(url: string): Promise<Response> {
    return this.fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  }

  /** A family's metadata by id, or by searching its name; null when Fontsource doesn't have it. */
  private async meta(req: FontRequest): Promise<Meta | null> {
    const cached = join(this.cacheDir, `${req.id ?? slug(req.family)}.json`);
    if (existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8')) as Meta;
    let meta: Meta | null = null;
    for (const id of [...new Set([req.id, slug(req.family)].filter(Boolean))] as string[]) {
      const res = await this.get(`${API}/${encodeURIComponent(id)}`);
      if (res.ok) {
        meta = (await res.json()) as Meta;
        break;
      }
    }
    if (!meta) {
      // A name that isn't its id's spelling ("M PLUS Rounded 1c"): search by family.
      const res = await this.get(`${API}?family=${encodeURIComponent(req.family.trim())}`);
      const hits = res.ok ? ((await res.json()) as Meta[]) : [];
      const hit = hits.find((h) => h.family.toLowerCase() === req.family.trim().toLowerCase());
      if (hit) {
        const full = await this.get(`${API}/${encodeURIComponent(hit.id)}`);
        if (full.ok) meta = (await full.json()) as Meta;
      }
    }
    if (!meta) return null;
    mkdirSync(this.cacheDir, { recursive: true });
    writeFileSync(cached, JSON.stringify(meta));
    return meta;
  }

  /**
   * The family's files for the weights asked for (each mapped to the nearest one it has), in
   * its Latin subset, upright. Null when the family can't be found or nothing downloads.
   */
  async files(req: FontRequest): Promise<FontFiles | null> {
    const meta = await this.meta(req).catch(() => null);
    if (!meta) return null;
    const subset = meta.subsets.includes('latin') ? 'latin' : (meta.defSubset ?? meta.subsets[0]);
    const weights = [...new Set(req.weights.map((w) => nearestWeight(w, meta.weights)))];
    const dir = join(this.cacheDir, meta.id);
    mkdirSync(dir, { recursive: true });
    const files: FontFiles['files'] = [];
    for (const weight of weights) {
      const path = join(dir, `${subset}-${weight}-normal.woff2`);
      if (!existsSync(path)) {
        const url = meta.variants?.[String(weight)]?.['normal']?.[subset ?? '']?.url.woff2;
        if (!url || !url.startsWith('https://')) continue;
        const res = await this.get(url).catch(() => null);
        if (!res?.ok) continue;
        writeFileSync(path, Buffer.from(await res.arrayBuffer()));
      }
      files.push({ weight, path });
    }
    if (files.length === 0) return null;
    return { family: meta.family, id: meta.id, license: meta.license ?? 'see Fontsource', files };
  }
}

/** The @font-face rules for files copied to `<href>/<id>-<weight>.woff2`. */
export function fontFaceCss(fonts: FontFiles[], href: string): string {
  return fonts
    .flatMap((f) =>
      f.files.map(
        (file) =>
          `@font-face {\n  font-family: "${f.family}";\n  src: url("${href}/${f.id}-${file.weight}.woff2") format("woff2");\n  font-weight: ${file.weight};\n  font-style: normal;\n  font-display: swap;\n}`,
      ),
    )
    .join('\n\n');
}

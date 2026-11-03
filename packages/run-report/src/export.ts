// Writes a run's report as a self-contained static folder: index.html, report.css, the fonts and
// the screens it shows. Nothing outside the folder is referenced, so it opens from disk, from a
// zip, or from any static host. The written folder is scanned for keys and local paths last; a
// leak deletes the folder and fails the export.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import { buildReport, type ReportData } from './data';
import { renderReport, type RenderOptions } from './html';
import { readRun } from './read';
import { scanText, type Leak } from './scrub';

const here = import.meta.dirname;
const pkg = resolve(here, '..');

const FONTS: [string, string][] = [
  ['node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2', 'Geist-Variable.woff2'],
  ['node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2', 'GeistMono-Variable.woff2'],
  [
    'node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2',
    'bricolage-grotesque-latin-wght-normal.woff2',
  ],
];

/** What a published run's listing needs (written as meta.json beside the page). */
export interface ReportMeta {
  id: string;
  project: string;
  runId: string;
  startedAt: string;
  minutes: number;
  shown: number;
  suggestions: number;
  verified: number;
  review: number;
  rolledBack: number;
  spentUsd: number;
  calls: number;
  label?: string;
}

export interface ExportOptions extends RenderOptions {
  /** The folder name on the site, and meta.json's id. */
  id?: string;
}

export interface ExportResult {
  outDir: string;
  data: ReportData;
  meta: ReportMeta;
  files: string[];
}

/** A folder may be replaced only when it's empty or holds an earlier report. */
function prepare(outDir: string) {
  if (existsSync(outDir)) {
    const entries = readdirSync(outDir);
    if (entries.length && !entries.includes('meta.json'))
      throw new Error(
        `${basename(outDir)} isn't empty and isn't an earlier report; not touching it`,
      );
    rmSync(outDir, { recursive: true, force: true });
  }
  mkdirSync(join(outDir, 'assets'), { recursive: true });
  mkdirSync(join(outDir, 'fonts'), { recursive: true });
}

export function exportRun(runDir: string, outDirArg: string, o: ExportOptions = {}): ExportResult {
  const run = readRun(runDir);
  const outDir = resolve(outDirArg);
  if (
    outDir === run.dir ||
    outDir.startsWith(`${run.dir}${'\\'}`) ||
    outDir.startsWith(`${run.dir}/`)
  )
    throw new Error('Write the report outside the run folder');
  prepare(outDir);

  // Assets: each source file copied once, under a name unique in the folder.
  const copied = new Map<string, string>();
  const used = new Set<string>();
  const sink = (file: string, name: string) => {
    const had = copied.get(file);
    if (had) return had;
    const ext = extname(name).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp', '.svg'].includes(ext))
      throw new Error(`Unexpected asset type ${ext}`);
    let out = name;
    for (let i = 2; used.has(out); i++) out = `${basename(name, ext)}-${i}${ext}`;
    used.add(out);
    copyFileSync(file, join(outDir, 'assets', out));
    const rel = `assets/${out}`;
    copied.set(file, rel);
    return rel;
  };
  const data = buildReport(run, sink, (f) => readFileSync(f, 'utf8'));

  const css =
    readFileSync(join(here, 'tokens.css'), 'utf8') +
    '\n' +
    readFileSync(join(here, 'report.css'), 'utf8');
  writeFileSync(join(outDir, 'report.css'), css);
  for (const [from, to] of FONTS) copyFileSync(join(pkg, from), join(outDir, 'fonts', to));
  writeFileSync(join(outDir, 'index.html'), renderReport(data, o));

  const meta: ReportMeta = {
    id: o.id ?? `${run.state.projectId}-${run.state.runId}`,
    project: data.project,
    runId: data.runId,
    startedAt: data.startedAt,
    minutes: data.minutes,
    shown: data.stats.shown,
    suggestions: data.stats.suggestions,
    verified: data.stats.verified,
    review: data.stats.review,
    rolledBack: data.stats.rolledBack,
    spentUsd: data.stats.spentUsd,
    calls: data.stats.calls,
    ...(o.label ? { label: o.label } : {}),
  };
  writeFileSync(join(outDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');

  const leaks = scanDir(outDir);
  if (leaks.length) {
    rmSync(outDir, { recursive: true, force: true });
    throw new Error(
      `The report would have leaked ${leaks.length} private value(s); nothing was written:\n` +
        leaks.map((l) => `  ${l.file}: ${l.kind} ${l.match}`).join('\n'),
    );
  }
  return { outDir, data, meta, files: listFiles(outDir).map((f) => relative(outDir, f)) };
}

const TEXT = new Set(['.html', '.css', '.json', '.svg', '.txt', '.md', '.js']);

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

/** Every text file in a folder, scanned for keys and local paths. */
export function scanDir(dir: string): (Leak & { file: string })[] {
  return listFiles(dir)
    .filter((f) => TEXT.has(extname(f).toLowerCase()))
    .flatMap((f) =>
      scanText(readFileSync(f, 'utf8')).map((l) => ({ ...l, file: relative(dir, f) })),
    );
}

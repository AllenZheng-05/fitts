// Publishing a run on the Fitts site (apps/site): the export goes to public/runs/<id>/, and
// src/content/runs.json lists it for /runs/ and says which run the site links to ("featured").
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { exportRun, type ExportResult, type ReportMeta } from './export';

export const SITE_DIR = resolve(import.meta.dirname, '../../../apps/site');

export interface RunsManifest {
  /** The run Home, Showcase and the README link to. */
  featured: string;
  runs: ReportMeta[];
}

export const manifestFile = (site = SITE_DIR) => join(site, 'src/content/runs.json');

export function readManifest(site = SITE_DIR): RunsManifest {
  const f = manifestFile(site);
  if (!existsSync(f)) return { featured: '', runs: [] };
  return JSON.parse(readFileSync(f, 'utf8')) as RunsManifest;
}

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,60}$/;

export function publishToSite(
  runDir: string,
  o: { id: string; label?: string; featured?: boolean; site?: string },
): ExportResult & { manifest: RunsManifest } {
  if (!SAFE_ID.test(o.id)) throw new Error(`--id must be lowercase letters, digits and dashes`);
  const site = o.site ?? SITE_DIR;
  const result = exportRun(runDir, join(site, 'public/runs', o.id), {
    id: o.id,
    site: { home: '/', runs: '/runs/' },
    index: true,
    ...(o.label ? { label: o.label } : {}),
  });
  const before = readManifest(site);
  const runs = [result.meta, ...before.runs.filter((r) => r.id !== o.id)].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
  const manifest: RunsManifest = {
    featured: o.featured || !before.featured ? o.id : before.featured,
    runs,
  };
  writeFileSync(manifestFile(site), JSON.stringify(manifest, null, 2) + '\n');
  return { ...result, manifest };
}

/** Where the Fitts app keeps its projects on this computer (FITTS_USER_DATA overrides). */
export function userDataDir(): string {
  if (process.env.FITTS_USER_DATA) return process.env.FITTS_USER_DATA;
  if (process.platform === 'win32')
    return join(process.env.APPDATA ?? join(homedir(), 'AppData/Roaming'), 'Fitts');
  if (process.platform === 'darwin') return join(homedir(), 'Library/Application Support/Fitts');
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'Fitts');
}

/** A project's newest run folder (by its log's last write). */
export function latestRun(projectId: string, root = userDataDir()): string {
  const runs = join(root, 'projects', projectId, 'runs');
  if (!existsSync(runs))
    throw new Error(`No runs for project “${projectId}” in Fitts's data folder`);
  const dirs = readdirSync(runs)
    .map((d) => join(runs, d))
    .filter((d) => existsSync(join(d, 'events.ndjson')))
    .sort(
      (a, b) =>
        statSync(join(b, 'events.ndjson')).mtimeMs - statSync(join(a, 'events.ndjson')).mtimeMs,
    );
  const newest = dirs[0];
  if (!newest) throw new Error(`Project “${projectId}” has no run with a log yet`);
  return newest;
}

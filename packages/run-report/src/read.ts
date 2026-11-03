// Reads one run as Fitts saved it (SPEC-phase2 §12.1): userData/projects/<id>/runs/<runId>/ with
// events.ndjson, shots/<step>.jpg and assets/. The state is the shared reducer over every event,
// the same way the app and the benches rebuild a run. Nothing here touches the network.
import {
  replay,
  type AppModel,
  type AppModelSummary,
  type Brief,
  type CostEvent,
  type LoggedEvent,
  type RunEvent,
  type RunState,
} from '@fitts/schema';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

export interface RunInput {
  /** The run folder. Never written into the report. */
  dir: string;
  state: RunState;
  /** Every model call, in order (`ledger.entry` events). */
  ledger: CostEvent[];
  /** When the first and last events were logged (ms since epoch). */
  startedAt: number;
  endedAt: number;
  /** The safe parts of the project's record (project.json), when it's next to the run. */
  project?: { name?: string; framework?: string; brief?: Brief };
  /** What Fitts understood from the code: the run's own, else the project's cached App Model. */
  appModel?: AppModelSummary;
}

export function readRun(runDir: string): RunInput {
  const dir = resolve(runDir);
  const file = join(dir, 'events.ndjson');
  if (!existsSync(file)) throw new Error(`No events.ndjson in ${basename(dir)}`);
  const logged = readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as LoggedEvent);
  const events: RunEvent[] = logged.map((l) => l.event);
  const state = replay(events);
  if (!state) throw new Error('The log has no run.started event');
  const ledger = events.flatMap((e) => (e.type === 'ledger.entry' ? [e.entry] : []));
  const projectDir = dirname(dirname(dir));
  return {
    dir,
    state,
    ledger,
    startedAt: logged[0]?.ts ?? 0,
    endedAt: logged.at(-1)?.ts ?? 0,
    ...optional('project', readProject(projectDir)),
    ...optional('appModel', state.appModel ?? readAppModel(projectDir)),
  };
}

const optional = <K extends string, V>(key: K, value: V | undefined) =>
  (value === undefined ? {} : { [key]: value }) as Partial<Record<K, V>>;

/** Only the name, framework and brief: the record also holds the project's folder on disk. */
function readProject(projectDir: string): RunInput['project'] {
  const file = join(projectDir, 'project.json');
  if (!existsSync(file)) return undefined;
  try {
    const p = JSON.parse(readFileSync(file, 'utf8')) as {
      name?: unknown;
      framework?: unknown;
      brief?: Brief;
    };
    return {
      ...(typeof p.name === 'string' ? { name: p.name } : {}),
      ...(typeof p.framework === 'string' ? { framework: p.framework } : {}),
      ...(p.brief && typeof p.brief === 'object' ? { brief: p.brief } : {}),
    };
  } catch {
    return undefined;
  }
}

/** The newest cached App Model (app-model/<commit>.json holds `{ model, hashes, modeled }`). */
function readAppModel(projectDir: string): AppModelSummary | undefined {
  const folder = join(projectDir, 'app-model');
  if (!existsSync(folder)) return undefined;
  const files = readdirSync(folder)
    .filter((f) => f.endsWith('.json'))
    .map((f) => join(folder, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const f of files) {
    try {
      const doc = JSON.parse(readFileSync(f, 'utf8')) as { model?: AppModel; modeled?: boolean };
      if (doc.model?.pages) return summarize(doc.model, Boolean(doc.modeled));
    } catch {
      // A partly written cache file: try the next one.
    }
  }
  return undefined;
}

export function summarize(m: AppModel, modeled: boolean): AppModelSummary {
  return {
    summary: m.summary,
    commit: m.commit,
    pages: m.pages.map((p) => ({
      route: p.route,
      ...(p.title ? { title: p.title } : {}),
      ...(p.file ? { file: p.file } : {}),
      source: p.source,
      ...(p.gate ? { gate: p.gate } : {}),
      features: p.features.map((f) => ({ id: f.id, name: f.name, description: f.description })),
      forms: p.forms.length,
    })),
    journeys: m.journeys,
    notes: m.notes,
    modeled,
  };
}

/**
 * The file behind an asset URL of this run: `fitts-asset://<project>/<run>/<path>`, or a step's
 * shot by number. Anything else (another run's asset, a path that climbs out) is refused.
 */
export function assetFile(run: RunInput, url: string | undefined): string | undefined {
  if (!url) return undefined;
  const m = /^fitts-asset:\/\/([^/]+)\/([^/]+)\/(.+)$/.exec(url);
  if (!m) return undefined;
  const [, project, runId, rel = ''] = m;
  if (project !== run.state.projectId || runId !== run.state.runId) return undefined;
  if (rel.split(/[\\/]/).some((s) => s === '..' || s === '')) return undefined;
  const file = join(run.dir, rel);
  return existsSync(file) ? file : undefined;
}

export function shotFile(run: RunInput, step: number | undefined): string | undefined {
  if (step === undefined || !Number.isInteger(step) || step < 0) return undefined;
  const file = join(run.dir, 'shots', `${step}.jpg`);
  return existsSync(file) ? file : undefined;
}

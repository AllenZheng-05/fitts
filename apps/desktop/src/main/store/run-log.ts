// The append-only run log (SPEC-phase2 §12.1): userData/projects/<id>/runs/<runId>/events.ndjson,
// plus snapshot.json every SNAPSHOT_EVERY events so a long run loads fast.
import {
  reduce,
  SNAPSHOT_EVERY,
  type LoggedEvent,
  type RunEvent,
  type RunState,
} from '@fitts/schema';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

/** Ids become folder names, so only plain slugs are accepted. */
export const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;

export function runDir(root: string, projectId: string, runId: string): string {
  if (!SAFE_ID.test(projectId) || !SAFE_ID.test(runId)) throw new Error('unsafe id');
  return join(root, 'projects', projectId, 'runs', runId);
}

export class RunLog {
  private seq = 0;
  private sinceSnapshot = 0;
  private readonly file: string;

  constructor(
    private readonly dir: string,
    private readonly projectId: string,
    private readonly runId: string,
  ) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, 'events.ndjson');
    if (existsSync(this.file)) {
      this.seq = readFileSync(this.file, 'utf8').split('\n').filter(Boolean).length;
    }
  }

  /** Appends events; `state` is the run after them, for the periodic snapshot. */
  append(events: RunEvent[], state: RunState | undefined): void {
    const ts = Date.now();
    const lines = events.map((event) => {
      this.seq += 1;
      const line: LoggedEvent = {
        v: 1,
        seq: this.seq,
        ts,
        projectId: this.projectId,
        runId: this.runId,
        event,
      };
      return JSON.stringify(line);
    });
    appendFileSync(this.file, lines.join('\n') + '\n');
    this.sinceSnapshot += events.length;
    if (state && this.sinceSnapshot >= SNAPSHOT_EVERY) {
      this.sinceSnapshot = 0;
      writeFileSync(join(this.dir, 'snapshot.json'), JSON.stringify({ seq: this.seq, state }));
    }
  }
}

/** Rebuilds a run from its log, starting from the snapshot when there is one. */
export function loadRun(dir: string): RunState | undefined {
  const file = join(dir, 'events.ndjson');
  if (!existsSync(file)) return undefined;
  let state: RunState | undefined;
  let after = 0;
  const snap = join(dir, 'snapshot.json');
  if (existsSync(snap)) {
    const s = JSON.parse(readFileSync(snap, 'utf8')) as { seq: number; state: RunState };
    state = s.state;
    after = s.seq;
  }
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    const logged = JSON.parse(line) as LoggedEvent;
    if (logged.seq <= after) continue;
    state = reduce(state, logged.event);
  }
  return state;
}

/** Run ids for a project, oldest first (the run picker, §12.3). */
export function listRuns(root: string, projectId: string): string[] {
  if (!SAFE_ID.test(projectId)) return [];
  const dir = join(root, 'projects', projectId, 'runs');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(
    (d) => SAFE_ID.test(d) && existsSync(join(dir, d, 'events.ndjson')),
  );
}

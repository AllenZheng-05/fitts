// The judges' replay (SPEC-phase2 §12.3): a recorded run bundled with the app, playable with no
// keys. Opening it copies the run (log, step shots, media) into userData under its own project
// id, so `fitts-asset://` serves its images like any other run, and hands the events to the
// renderer's ReplayRunEngine.
import { IPC, type RunEvent } from '@fitts/schema';
import { app, ipcMain } from 'electron';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runDir } from './store/run-log';

/** The bundled recording and the project id it plays under. */
export const REPLAY_SOURCE_PROJECT = 'demo-chat';
export const REPLAY_PROJECT = 'replay-demo-chat';

function replaysDir(): string {
  // Development and e2e: next to out/ (as window.ts finds the icon), not app.getAppPath(),
  // which is out/main when Electron is started with a script.
  return app.isPackaged
    ? join(process.resourcesPath, 'replays')
    : join(__dirname, '../../resources/replays');
}

export interface ReplayOpened {
  projectId: string;
  runId: string;
  events: { ts: number; event: RunEvent }[];
}

/** Copies the recording in (ids rewritten) and returns its events, or null if there is none. */
export function openReplay(userData: string): ReplayOpened | null {
  const src = join(replaysDir(), 'demo-chat');
  const log = join(src, 'events.ndjson');
  if (!existsSync(log)) return null;
  const rewrite = (text: string) =>
    text
      .replaceAll(`"projectId":"${REPLAY_SOURCE_PROJECT}"`, `"projectId":"${REPLAY_PROJECT}"`)
      .replaceAll(`fitts-asset://${REPLAY_SOURCE_PROJECT}/`, `fitts-asset://${REPLAY_PROJECT}/`);
  const lines = rewrite(readFileSync(log, 'utf8')).split('\n').filter(Boolean);
  const first = JSON.parse(lines[0] ?? '{}') as { runId?: string };
  const runId = first.runId ?? 'run-1';
  const dest = runDir(userData, REPLAY_PROJECT, runId);
  mkdirSync(dest, { recursive: true });
  for (const kind of ['shots', 'assets']) {
    const from = join(src, kind);
    if (existsSync(from) && readdirSync(from).length > 0)
      cpSync(from, join(dest, kind), { recursive: true });
  }
  writeFileSync(join(dest, 'events.ndjson'), lines.join('\n') + '\n');
  const events = lines.map((l) => {
    const e = JSON.parse(l) as { ts: number; event: RunEvent };
    return { ts: e.ts, event: e.event };
  });
  return { projectId: REPLAY_PROJECT, runId, events };
}

export function registerReplay(userData: string): void {
  ipcMain.handle(IPC.replayOpen, () => openReplay(userData));
}

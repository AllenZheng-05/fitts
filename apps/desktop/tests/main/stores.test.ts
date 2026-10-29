// @vitest-environment node
import { diff, SNAPSHOT_EVERY, type Project, type RunState } from '@fitts/schema';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listRuns, loadRun, RunLog, runDir } from '../../src/main/store/run-log';

vi.mock('electron', () => ({ ipcMain: { on: vi.fn(), handle: vi.fn() } }));
const { ProjectStore } = await import('../../src/main/store/projects');

const project = (id: string): Project => ({
  id,
  name: id,
  kind: 'local',
  folder: `/code/${id}`,
  url: 'localhost:5173',
  brief: {},
  createdAt: '2026-10-29T00:00:00.000Z',
});
const DEMO_PROJECTS = [project('demo-chat'), project('hartwell-site'), project('portfolio')];

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'fitts-store-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const base = (n: number): RunState => ({
  runId: 'run-1',
  projectId: 'demo-chat',
  phase: 'audit',
  activity: 'acting',
  mode: 'ask-unsure',
  step: n,
  stepEstimate: 120,
  elapsedMs: n * 100,
  routes: [],
  controlsTried: { done: 0, total: 24 },
  findings: [],
  changes: [],
  chat: [],
  queued: [],
  overlays: { problems: [] },
  fixingCount: 0,
  cost: {
    spentUsd: 0,
    capUsd: 20,
    byPhase: { fixes: 0, reviewers: 0, crawling: 0, summing: 0, media: 0 },
  },
  brief: {},
  fittsTyping: false,
  driverClicks: [],
});

describe('RunLog', () => {
  it('appends events, snapshots every SNAPSHOT_EVERY, and loads back the same state', () => {
    const dir = runDir(root, 'demo-chat', 'run-1');
    const log = new RunLog(dir, 'demo-chat', 'run-1');
    let prev: RunState | undefined;
    let state = base(0);
    for (let n = 0; n <= SNAPSHOT_EVERY + 50; n++) {
      state = { ...base(n), nowText: `step ${n}` };
      log.append(diff(prev, state), state);
      prev = state;
    }
    expect(existsSync(join(dir, 'snapshot.json'))).toBe(true);
    expect(loadRun(dir)).toEqual(state);
    expect(listRuns(root, 'demo-chat')).toEqual(['run-1']);
    // Reopening continues the sequence instead of restarting it.
    const lines = readFileSync(join(dir, 'events.ndjson'), 'utf8').trim().split('\n');
    const reopened = new RunLog(dir, 'demo-chat', 'run-1');
    reopened.append([{ type: 'clock.tick', elapsedMs: 1 }], undefined);
    const last = JSON.parse(
      readFileSync(join(dir, 'events.ndjson'), 'utf8').trim().split('\n').at(-1) ?? '{}',
    ) as { seq: number };
    expect(last.seq).toBe(lines.length + 1);
  });

  it('refuses ids that are not plain slugs', () => {
    expect(() => runDir(root, '../evil', 'run-1')).toThrow();
    expect(() => runDir(root, 'ok', 'a/b')).toThrow();
    expect(listRuns(root, '..')).toEqual([]);
  });
});

describe('ProjectStore', () => {
  it('round-trips the persisted blob as one file per project, and removal deletes its folder', () => {
    const store = new ProjectStore(root);
    expect(store.load()).toBeNull();
    const blob = {
      state: { projects: DEMO_PROJECTS, lastOpenId: DEMO_PROJECTS[0]?.id },
      version: 0,
    };
    store.save(JSON.stringify(blob));
    for (const p of DEMO_PROJECTS)
      expect(existsSync(join(root, 'projects', p.id, 'project.json'))).toBe(true);
    expect(JSON.parse(store.load() ?? 'null')).toEqual(blob);

    const [first, ...rest] = DEMO_PROJECTS;
    store.save(JSON.stringify({ state: { projects: rest, lastOpenId: rest[0]?.id }, version: 0 }));
    expect(existsSync(join(root, 'projects', first?.id ?? '', 'project.json'))).toBe(false);
    expect((JSON.parse(store.load() ?? 'null') as typeof blob).state.projects).toHaveLength(
      rest.length,
    );
  });
});

// The UI's only door to a run (SPEC §9.2). Phase 2: IpcRunEngine (the agent process) is the
// default; MockRunEngine stays for the Scenario panel and for tests outside Electron.
import type { RunEngine } from '@fitts/schema';
import { bridge } from '../lib/bridge';
import { profileFor } from '../mock/profiles';
import { IpcRunEngine } from './ipc-engine';
import { MockRunEngine } from './mock-engine';
import { ReplayRunEngine } from './replay-engine';
import { useProjects } from './projects';
import { useSettings } from './settings';

export type { RunEngine };
export type EngineKind = 'ipc' | 'mock' | 'replay';

let mock: MockRunEngine | undefined;
let replay: ReplayRunEngine | undefined;

/** Replay mode's engine (§12.3): plays a recorded run, needs no keys. */
export function getReplayEngine(): ReplayRunEngine {
  replay ??= new ReplayRunEngine();
  return replay;
}
let ipc: IpcRunEngine | undefined;

const briefFor = (id: string) => useProjects.getState().projects.find((p) => p.id === id)?.brief;

/** The scripted engine. Dev tools use its extra controls; the Scenario panel plays on it. */
export function getMockEngine(): MockRunEngine {
  mock ??= new MockRunEngine({ profileFor, briefFor: (id) => briefFor(id) ?? {} });
  return mock;
}

/** The real engine, or undefined outside Electron (unit tests). */
export function getIpcEngine(): IpcRunEngine | undefined {
  const engineBridge = bridge().engine;
  if (!engineBridge) return undefined;
  ipc ??= new IpcRunEngine(engineBridge, briefFor, () => {
    const { capUsd, modelProfile, contributorMode } = useSettings.getState();
    return { capUsd, modelProfile, contributorMode };
  });
  return ipc;
}

let kind: EngineKind = getIpcEngine() ? 'ipc' : 'mock';
const kindListeners = new Set<(k: EngineKind) => void>();

export const getEngineKind = (): EngineKind => kind;

/** The Scenario panel switches the UI to the scripted engine for the rest of the session. */
export function switchToMockEngine(): void {
  if (kind === 'mock') return;
  kind = 'mock';
  for (const l of kindListeners) l(kind);
}

export function onEngineKindChange(fn: (k: EngineKind) => void): () => void {
  kindListeners.add(fn);
  return () => kindListeners.delete(fn);
}

/** Replay while a recorded run is open; back to the real engine when you leave it. */
export function setReplaying(on: boolean): void {
  const next: EngineKind = on ? 'replay' : getIpcEngine() ? 'ipc' : 'mock';
  if (kind === next || (!on && kind === 'mock')) return;
  kind = next;
  for (const l of kindListeners) l(kind);
}

export function getEngine(): RunEngine {
  if (kind === 'replay') return getReplayEngine();
  return (kind === 'ipc' && getIpcEngine()) || getMockEngine();
}

/**
 * "You clicked …" while the user has the wheel (Phase 1 §7.3). The P1 stub agent records it
 * like the mock; P2 moves it to main's site-window recorder.
 */
export function recordUserClick(projectId: string, label: string): void {
  if (kind === 'mock') getMockEngine().recordUserClick(projectId, label);
  else getIpcEngine()?.recordUserClick(projectId, label);
}

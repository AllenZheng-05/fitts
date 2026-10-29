// The UI's only door to a run (SPEC §9.2). Phase 2: IpcRunEngine (the agent process) is the
// default; MockRunEngine stays for the Scenario panel and for tests outside Electron.
import type { RunEngine } from '@fitts/schema';
import { bridge } from '../lib/bridge';
import { profileFor } from '../mock/profiles';
import { IpcRunEngine } from './ipc-engine';
import { MockRunEngine } from './mock-engine';
import { useProjects } from './projects';

export type { RunEngine };
export type EngineKind = 'ipc' | 'mock';

let mock: MockRunEngine | undefined;
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
  ipc ??= new IpcRunEngine(engineBridge, briefFor);
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

export function getEngine(): RunEngine {
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

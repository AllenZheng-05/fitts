// The UI's only door to a run (SPEC §9.2). Phase 1 plays scripted scenarios; Phase 2
// swaps in an IPC-backed engine without UI changes.
import type { RunEngine } from '@fitts/schema';
import { profileFor } from '../mock/profiles';
import { MockRunEngine } from './mock-engine';
import { useProjects } from './projects';

export type { RunEngine };

let engine: MockRunEngine | undefined;

/** The shared mock engine. Dev tools use its extra controls; the UI uses RunEngine. */
export function getMockEngine(): MockRunEngine {
  engine ??= new MockRunEngine({
    profileFor,
    briefFor: (id) => useProjects.getState().projects.find((p) => p.id === id)?.brief ?? {},
  });
  return engine;
}

export function getEngine(): RunEngine {
  return getMockEngine();
}

// Replay mode (SPEC-phase2 §12.3): recorded timing at 4×, long gaps shortened, actions are
// no-ops, and stopping jumps to the end.
import type { RunEvent, RunState } from '@fitts/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplayRunEngine } from '../../src/renderer/state/replay-engine';

const start = {
  runId: 'run-7',
  projectId: 'replay-demo-chat',
  phase: 'audit',
  activity: 'acting',
  mode: 'autonomous',
  step: 0,
  stepEstimate: 10,
  elapsedMs: 0,
  routes: [],
  controlsTried: { done: 0, total: 0 },
  findings: [],
  changes: [],
  chat: [],
  queued: [],
  overlays: { problems: [] },
  fixingCount: 0,
  cost: {
    spentUsd: 0,
    capUsd: 3,
    byPhase: { fixes: 0, reviewers: 0, crawling: 0, summing: 0, media: 0 },
  },
  brief: {},
  fittsTyping: false,
  driverClicks: [],
} as RunState;

const events: { ts: number; event: RunEvent }[] = [
  { ts: 1000, event: { type: 'run.started', state: start } },
  { ts: 1400, event: { type: 'step.started', step: 1, stepEstimate: 10 } },
  // A minute of nothing: plays as 3s / 4.
  { ts: 61_400, event: { type: 'step.started', step: 2, stepEstimate: 10 } },
  { ts: 61_800, event: { type: 'phase.changed', phase: 'done' } },
];

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('ReplayRunEngine', () => {
  it('plays at 4× recorded timing, with long gaps shortened', () => {
    const engine = new ReplayRunEngine();
    const seen: number[] = [];
    engine.subscribe('replay-demo-chat', (s) => seen.push(s.step));
    engine.play('replay-demo-chat', events, 4);
    expect(engine.getState('replay-demo-chat')?.step).toBe(0);
    vi.advanceTimersByTime(100); // 400ms / 4
    expect(engine.getState('replay-demo-chat')?.step).toBe(1);
    vi.advanceTimersByTime(749);
    expect(engine.getState('replay-demo-chat')?.step).toBe(1);
    vi.advanceTimersByTime(1); // 3000ms / 4
    expect(engine.getState('replay-demo-chat')?.step).toBe(2);
    vi.advanceTimersByTime(100);
    expect(engine.getState('replay-demo-chat')?.phase).toBe('done');
    expect(engine.playing).toBe(false);
  });

  it('every action is a no-op except stop, which jumps to the end', () => {
    const engine = new ReplayRunEngine();
    engine.play('replay-demo-chat', events, 4);
    engine.pause();
    engine.takeWheel();
    engine.sendMessage();
    expect(engine.getState('replay-demo-chat')?.activity).toBe('acting');
    engine.stopRun();
    expect(engine.getState('replay-demo-chat')).toMatchObject({ step: 2, phase: 'done' });
    expect(engine.playing).toBe(false);
  });
});

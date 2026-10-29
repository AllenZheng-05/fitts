import { diff, reduce, replay, type RunEvent, type RunState } from '@fitts/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_CHAT, HARTWELL, PORTFOLIO } from '../../src/renderer/mock/fixtures/projects';
import { profileFor } from '../../src/renderer/mock/profiles';
import { MockRunEngine } from '../../src/renderer/state/mock-engine';

let engine: MockRunEngine;
let log: Record<string, RunEvent[]>;
let prev: Record<string, RunState | undefined>;

beforeEach(() => {
  vi.useFakeTimers();
  engine = new MockRunEngine({ profileFor });
  log = {};
  prev = {};
  engine.subscribeAll((projectId, state) => {
    // Events go through JSON, as they do on disk (undefined values are dropped).
    const events = JSON.parse(JSON.stringify(diff(prev[projectId], state))) as RunEvent[];
    (log[projectId] ??= []).push(...events);
    prev[projectId] = state;
  });
});

afterEach(() => {
  engine.dispose();
  vi.useRealTimers();
});

const replayed = (projectId: string) => replay(log[projectId] ?? []);
const plain = (s: RunState | undefined) => JSON.parse(JSON.stringify(s)) as unknown;

describe('diff + reduce reproduce the engine state exactly', () => {
  it('the whole demo/chat run in Ask when unsure, with approvals and the gate', () => {
    engine.loadAudit(DEMO_CHAT, 'ask-unsure');
    for (let t = 0; t < 150; t++) {
      vi.advanceTimersByTime(1000);
      const s = engine.getState(DEMO_CHAT);
      const batch = s?.chat.find((c) => c.type === 'approval.batch' && c.answer === undefined);
      if (batch?.type === 'approval.batch') engine.approveFixes(DEMO_CHAT, batch.findingIds);
      if (s?.gate) engine.respondGate(DEMO_CHAT, s.gate.id, 'deny');
      const q = s?.chat.find((c) => c.type === 'question' && c.answer === undefined);
      if (q?.type === 'question') engine.answerQuestion(DEMO_CHAT, q.id, q.options[0] ?? 'Yes');
      expect(plain(replayed(DEMO_CHAT))).toEqual(plain(engine.getState(DEMO_CHAT)));
    }
    expect(engine.getState(DEMO_CHAT)?.phase).toBe('done');
  });

  it('the interview, messages, pause, wheel, rewind and undo', () => {
    engine.startInterview(DEMO_CHAT);
    vi.advanceTimersByTime(2000);
    engine.answerInterview(DEMO_CHAT, 'A messaging app for my grandparents.');
    vi.advanceTimersByTime(3000);
    engine.startAudit(DEMO_CHAT);
    vi.advanceTimersByTime(20_000);
    engine.sendMessage(DEMO_CHAT, 'Check search too', { pointingAt: 'search-input' });
    engine.pause(DEMO_CHAT);
    engine.takeWheel(DEMO_CHAT);
    engine.handBack(DEMO_CHAT);
    engine.resume(DEMO_CHAT);
    engine.rewindTo(DEMO_CHAT, 19);
    engine.rewindTo(DEMO_CHAT, null);
    engine.setMode(DEMO_CHAT, 'autonomous');
    vi.advanceTimersByTime(60_000);
    const change = engine.getState(DEMO_CHAT)?.changes[0];
    if (change) engine.undoChange(DEMO_CHAT, change.id);
    vi.advanceTimersByTime(5000);
    expect(plain(replayed(DEMO_CHAT))).toEqual(plain(engine.getState(DEMO_CHAT)));
  });

  it('every edge state, the redesign and a nothing-found run', () => {
    for (const kind of [
      'stop-run-confirm',
      'stopped',
      'uncommitted',
      'login-wall',
      'site-down',
      'budget-warning',
      'budget',
      'api-trouble',
      'reopen',
    ] as const) {
      engine.loadAudit(DEMO_CHAT, 'ask-unsure');
      vi.advanceTimersByTime(5000);
      engine.showEdgeState(DEMO_CHAT, kind);
      vi.advanceTimersByTime(13_000);
      expect(plain(replayed(DEMO_CHAT))).toEqual(plain(engine.getState(DEMO_CHAT)));
    }
    engine.loadAudit(HARTWELL, 'autonomous');
    vi.advanceTimersByTime(90_000);
    expect(plain(replayed(HARTWELL))).toEqual(plain(engine.getState(HARTWELL)));
    engine.loadAudit(PORTFOLIO, 'ask-unsure');
    engine.showEdgeState(PORTFOLIO, 'nothing-found');
    expect(plain(replayed(PORTFOLIO))).toEqual(plain(engine.getState(PORTFOLIO)));
  });
});

describe('reduce', () => {
  it('ignores events before run.started and never mutates its input', () => {
    expect(reduce(undefined, { type: 'phase.changed', phase: 'audit' })).toBeUndefined();
    engine.loadAudit(DEMO_CHAT, 'ask-unsure');
    const s = engine.getState(DEMO_CHAT);
    if (!s) throw new Error('no run');
    const frozen = JSON.stringify(s);
    const next = reduce(s, { type: 'queued.added', text: 'hi' });
    expect(next?.queued).toEqual(['hi']);
    expect(JSON.stringify(s)).toBe(frozen);
  });

  it('run.patch can unset keys that JSON would drop', () => {
    engine.loadAudit(DEMO_CHAT, 'ask-unsure');
    const s = engine.getState(DEMO_CHAT);
    const next = reduce(s, { type: 'run.patch', patch: {}, unset: ['nowText'] });
    expect(next && 'nowText' in next).toBe(false);
  });
});

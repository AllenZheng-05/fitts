import type { ChatItem, RunState } from '@fitts/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '../../src/renderer/copy';
import { format } from '../../src/renderer/lib/format';
import { DEMO_CHAT, HARTWELL, PORTFOLIO } from '../../src/renderer/mock/fixtures/projects';
import { LIVE_FINDINGS } from '../../src/renderer/mock/fixtures/demo-chat';
import { profileFor } from '../../src/renderer/mock/profiles';
import { demoChatAudit } from '../../src/renderer/mock/scenarios/demo-chat';
import { MockRunEngine, REPLY_MS, RETRY_MS } from '../../src/renderer/state/mock-engine';
import { isBriefReady } from '../../src/renderer/state/script';

let engine: MockRunEngine;

beforeEach(() => {
  vi.useFakeTimers();
  engine = new MockRunEngine({ profileFor });
});

afterEach(() => {
  engine.dispose();
  vi.useRealTimers();
});

const run = (projectId = DEMO_CHAT): RunState => {
  const s = engine.getState(projectId);
  if (!s) throw new Error(`no run for ${projectId}`);
  return s;
};
const advance = (ms: number) => vi.advanceTimersByTime(ms);
const types = (s: RunState) => s.chat.map((c) => c.type);
const last = (s: RunState): ChatItem | undefined => s.chat.at(-1);
const messages = (s: RunState) =>
  s.chat.flatMap((c) => (c.type === 'fitts.message' ? [c.text] : []));
const findItem = <T extends ChatItem['type']>(s: RunState, type: T) =>
  [...s.chat].reverse().find((c): c is Extract<ChatItem, { type: T }> => c.type === type);
const beatIndex = (id: string) => demoChatAudit.beats.findIndex((b) => b.id === id);

describe('beat ordering', () => {
  it('plays beats in time order', () => {
    engine.loadAudit(DEMO_CHAT, 'ask-unsure');
    expect(run().routes).toHaveLength(8);
    advance(20_000);
    const s = run();
    expect(s.elapsedMs).toBe(20_000);
    expect(types(s)).toEqual([
      'fitts.message',
      'steps',
      'fitts.thinking',
      'finding',
      'fitts.message',
      'finding',
    ]);
    expect(s.findings.map((f) => f.id)).toEqual([
      LIVE_FINDINGS.nullName.id,
      LIVE_FINDINGS.names.id,
    ]);
    expect(s.overlays.problems).toEqual([
      { ref: 'compose-to', pin: 1 },
      { ref: 'compose-next', pin: 2 },
    ]);
  });

  it('runs faster at 2× and 4×', () => {
    engine.setSpeed(2);
    engine.loadAudit(DEMO_CHAT, 'ask-unsure');
    advance(10_000);
    expect(run().elapsedMs).toBe(20_000);
    expect(run().findings).toHaveLength(2);
    engine.setSpeed(4);
    advance(1_000);
    expect(run().elapsedMs).toBe(24_000);
  });

  it('notifies subscribers until they unsubscribe', () => {
    const fn = vi.fn();
    engine.loadAudit(DEMO_CHAT, 'ask-unsure');
    const off = engine.subscribe(DEMO_CHAT, fn);
    advance(1_000);
    expect(fn).toHaveBeenCalled();
    off();
    fn.mockClear();
    advance(1_000);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('pause and resume', () => {
  it('freezes the clock and the script', () => {
    engine.loadAudit(DEMO_CHAT, 'ask-unsure');
    advance(5_000);
    engine.pause(DEMO_CHAT);
    expect(run().activity).toBe('paused');
    const frozen = run();
    advance(20_000);
    expect(run().elapsedMs).toBe(frozen.elapsedMs);
    expect(run().chat).toHaveLength(frozen.chat.length);
    engine.resume(DEMO_CHAT);
    expect(run().activity).toBe('acting');
    advance(1_000);
    expect(run().elapsedMs).toBe(6_000);
    expect(findItem(run(), 'steps')).toBeDefined();
  });
});

describe('stopAction', () => {
  it('cancels the step, shows the Stopped card and pauses', () => {
    engine.loadAudit(DEMO_CHAT, 'ask-unsure');
    advance(7_000);
    expect(run().overlays.attention).toBeDefined();
    engine.stopAction(DEMO_CHAT);
    const s = run();
    expect(s.activity).toBe('paused');
    expect(s.nowText).toBeUndefined();
    expect(s.overlays.attention).toBeUndefined();
    const card = last(s);
    expect(card).toMatchObject({ type: 'state', stateKind: 'stopped' });
  });

  it('"Skip this step" skips the next beat and resumes', () => {
    engine.loadAudit(DEMO_CHAT, 'ask-unsure');
    advance(7_000);
    engine.stopAction(DEMO_CHAT);
    const card = findItem(run(), 'state');
    engine.answerQuestion(DEMO_CHAT, card?.id ?? '', 'skip');
    expect(run().activity).toBe('acting');
    expect(messages(run())).toContain(copy.fitts.skipped);
    advance(5_000);
    expect(findItem(run(), 'fitts.thinking')).toBeUndefined();
  });

  it('"Resume" carries on', () => {
    engine.loadAudit(DEMO_CHAT, 'ask-unsure');
    advance(7_000);
    engine.stopAction(DEMO_CHAT);
    const card = findItem(run(), 'state');
    engine.answerQuestion(DEMO_CHAT, card?.id ?? '', 'resume');
    advance(4_000);
    expect(findItem(run(), 'fitts.thinking')).toBeDefined();
  });
});

describe('gating', () => {
  it('a non-blocking question lets the run continue', () => {
    engine.loadAudit(DEMO_CHAT, 'ask-unsure');
    advance(31_000);
    const q = findItem(run(), 'question');
    expect(q).toMatchObject({ blocking: false });
    expect(run().findings.map((f) => f.id)).toContain(LIVE_FINDINGS.confirm.id);
    engine.answerQuestion(DEMO_CHAT, q?.id ?? '', 'Yes');
    expect(run().routes.map((r) => r.path)).toContain('/admin');
  });

  it('holds on the approval batch until fixes are approved', () => {
    engine.loadAudit(DEMO_CHAT, 'ask-unsure');
    advance(35_000);
    let s = run();
    expect(s.waitingFor).toBe('approval');
    expect(s.activity).toBe('waiting-on-user');
    expect(last(s)).toMatchObject({ type: 'approval.batch', serious: 3 });
    advance(30_000);
    expect(run().elapsedMs).toBe(s.elapsedMs);

    engine.approveFixes(DEMO_CHAT, [
      LIVE_FINDINGS.nullName.id,
      LIVE_FINDINGS.names.id,
      LIVE_FINDINGS.confirm.id,
    ]);
    s = run();
    expect(s.waitingFor).toBeUndefined();
    expect(s.activity).toBe('acting');
    expect(s.fixingCount).toBe(2);
    expect(s.findings.find((f) => f.id === LIVE_FINDINGS.confirm.id)?.status).toBe('fixing');

    advance(10_000);
    s = run();
    const result = findItem(s, 'fix.result');
    const change = s.changes.find((c) => c.id === result?.changeId);
    expect(change).toMatchObject({
      title: "Show 'Sent' confirmation",
      prNumber: 13,
      status: 'verified',
    });
    expect(s.findings.find((f) => f.id === LIVE_FINDINGS.confirm.id)?.status).toBe('pr-opened');
  });

  it('"Only the serious ones" fixes just the approved findings', () => {
    engine.loadAudit(DEMO_CHAT, 'ask-unsure');
    advance(35_000);
    engine.approveFixes(DEMO_CHAT, [LIVE_FINDINGS.confirm.id]);
    expect(run().fixingCount).toBe(1);
    expect(run().findings.find((f) => f.id === LIVE_FINDINGS.names.id)?.status).toBe('open');
  });

  it('holds on the destructive gate until the user decides', () => {
    engine.jumpToBeat(DEMO_CHAT, beatIndex('gate'));
    let s = run();
    expect(s.gate?.action).toBe('Delete conversation');
    expect(s.waitingFor).toBe('gate');
    advance(20_000);
    expect(run().findings.map((f) => f.id)).not.toContain(LIVE_FINDINGS.target.id);

    engine.respondGate(DEMO_CHAT, 'wrong-id', 'allow');
    expect(run().gate).toBeDefined();
    engine.respondGate(DEMO_CHAT, s.gate?.id ?? '', 'deny');
    s = run();
    expect(s.gate).toBeUndefined();
    expect(messages(s).at(-1)).toBe(copy.fitts.gateDenied);
    advance(10_000);
    expect(run().findings.map((f) => f.id)).toContain(LIVE_FINDINGS.target.id);
  });

  it('a blocking question holds until answered', () => {
    engine.loadAudit(HARTWELL, 'ask-unsure');
    engine.askOn(HARTWELL, 'Can I submit the contact form?', ['Yes', 'No'], true);
    const q = findItem(run(HARTWELL), 'question');
    expect(run(HARTWELL).waitingFor).toBe(`question:${q?.id}`);
    advance(10_000);
    expect(run(HARTWELL).elapsedMs).toBe(0);
    engine.answerQuestion(HARTWELL, q?.id ?? '', 'Yes');
    expect(run(HARTWELL).waitingFor).toBeUndefined();
    advance(1_000);
    expect(run(HARTWELL).elapsedMs).toBe(1_000);
  });
});

describe('mode switching mid-run', () => {
  it('Ask → Autonomous applies the next approval beat without asking', () => {
    engine.loadAudit(DEMO_CHAT, 'ask-unsure');
    advance(30_000);
    engine.setMode(DEMO_CHAT, 'autonomous');
    advance(5_000);
    const s = run();
    expect(findItem(s, 'approval.batch')).toBeUndefined();
    expect(s.waitingFor).toBeUndefined();
    expect(s.fixingCount).toBe(2);
  });

  it('Autonomous → Ask makes an in-flight fix ask before pushing', () => {
    engine.loadAudit(DEMO_CHAT, 'autonomous');
    advance(35_000);
    expect(run().fixingCount).toBe(2);
    engine.setMode(DEMO_CHAT, 'ask-unsure');
    advance(10_000);
    const s = run();
    expect(findItem(s, 'fix.result')).toBeUndefined();
    const ask = findItem(s, 'question');
    expect(ask?.text).toBe(format(copy.fitts.pushReady, { title: "Show 'Sent' confirmation" }));
    engine.answerQuestion(DEMO_CHAT, ask?.id ?? '', copy.fitts.pushYes);
    expect(findItem(run(), 'fix.result')).toBeDefined();
  });

  it('Dangerous mode skips the gate', () => {
    engine.loadAudit(DEMO_CHAT, 'dangerous');
    advance(57_000);
    const s = run();
    expect(s.gate).toBeUndefined();
    expect(s.waitingFor).toBeUndefined();
    expect(messages(s)).toContain(
      format(copy.fitts.gateSkippedDangerous, { action: 'Delete conversation' }),
    );
  });

  it('Ask every action asks before each click', () => {
    engine.loadAudit(DEMO_CHAT, 'ask-every');
    advance(7_000);
    const q = findItem(run(), 'question');
    expect(q?.text).toBe(format(copy.fitts.askToAct, { action: 'tap Compose' }));
    expect(run().waitingFor).toBe(`question:${q?.id}`);
    advance(5_000);
    expect(findItem(run(), 'fitts.thinking')).toBeUndefined();
    engine.answerQuestion(DEMO_CHAT, q?.id ?? '', copy.fitts.goAhead);
    advance(4_000);
    expect(findItem(run(), 'fitts.thinking')).toBeDefined();
  });

  it('Plan only proposes fixes without making them', () => {
    engine.loadAudit(DEMO_CHAT, 'plan');
    advance(35_000);
    const s = run();
    expect(findItem(s, 'approval.batch')).toBeUndefined();
    expect(s.fixingCount).toBe(0);
    expect(messages(s)).toContain(format(copy.fitts.planOnlyFixes, { n: 3 }));
  });
});

describe('undo and retry', () => {
  beforeEach(() => engine.jumpToBeat(DEMO_CHAT, beatIndex('done')));

  it('undo marks the change and its findings undone', () => {
    const change = run().changes.find((c) => c.status === 'verified');
    engine.undoChange(DEMO_CHAT, change?.id ?? '');
    const s = run();
    expect(s.changes.find((c) => c.id === change?.id)?.status).toBe('undone');
    for (const id of change?.findingIds ?? []) {
      expect(s.findings.find((f) => f.id === id)?.status).toBe('undone');
    }
  });

  it('try again resolves to verified after 3s', () => {
    const rolled = run().changes.find((c) => c.status === 'rolled-back');
    engine.retryChange(DEMO_CHAT, rolled?.id ?? '');
    expect(run().changes.find((c) => c.id === rolled?.id)?.status).toBe('retrying');
    advance(RETRY_MS - 1);
    expect(run().changes.find((c) => c.id === rolled?.id)?.status).toBe('retrying');
    advance(1);
    expect(run().changes.find((c) => c.id === rolled?.id)?.status).toBe('verified');
  });

  it('redo after undo restores the change', () => {
    const change = run().changes.find((c) => c.status === 'verified');
    engine.undoChange(DEMO_CHAT, change?.id ?? '');
    engine.retryChange(DEMO_CHAT, change?.id ?? '');
    advance(RETRY_MS);
    expect(run().changes.find((c) => c.id === change?.id)?.status).toBe('verified');
  });
});

describe('interjecting (§7.2)', () => {
  it('queues a mid-action message and delivers it after the current step', () => {
    engine.loadAudit(DEMO_CHAT, 'ask-unsure');
    advance(3_000);
    engine.sendMessage(DEMO_CHAT, 'check search next');
    let s = run();
    expect(s.queued).toEqual(['check search next']);
    expect(last(s)).toMatchObject({ type: 'user.message', text: 'check search next' });
    advance(3_000);
    s = run();
    expect(s.queued).toEqual([]);
    const ack = s.chat.findIndex((c) => c.type === 'fitts.message' && c.text === copy.fitts.ack);
    expect(ack).toBeGreaterThan(-1);
    expect(ack).toBeLessThan(s.chat.findIndex((c) => c.type === 'steps'));
  });

  it('"Interrupt now" stops the action and replies at once', () => {
    engine.loadAudit(DEMO_CHAT, 'ask-unsure');
    advance(3_000);
    engine.sendMessage(DEMO_CHAT, 'check search next');
    engine.interruptNow(DEMO_CHAT);
    let s = run();
    expect(s.queued).toEqual([]);
    expect(s.nowText).toBeUndefined();
    expect(s.fittsTyping).toBe(true);
    advance(REPLY_MS);
    s = run();
    expect(s.fittsTyping).toBe(false);
    expect(messages(s).at(-1)).toBe(copy.fitts.ack);
  });

  it('replies after 900ms when Fitts is not mid-action', () => {
    engine.loadAudit(DEMO_CHAT, 'ask-unsure');
    engine.pause(DEMO_CHAT);
    engine.sendMessage(DEMO_CHAT, 'This part feels cramped.', { pointingAt: 'compose-form' });
    expect(last(run())).toMatchObject({ type: 'user.message', pointingAt: 'compose-form' });
    expect(run().queued).toEqual([]);
    advance(REPLY_MS);
    expect(messages(run()).at(-1)).toBe(copy.fitts.ack);
  });
});

describe('take the wheel (§7.3)', () => {
  it('logs clicks and asks to test the path on hand-back', () => {
    engine.loadAudit(DEMO_CHAT, 'ask-unsure');
    advance(7_000);
    engine.takeWheel(DEMO_CHAT);
    let s = run();
    expect(s.activity).toBe('user-driving');
    expect(s.overlays.attention).toBeUndefined();
    expect(last(s)?.type).toBe('driving');

    engine.recordUserClick(DEMO_CHAT, 'Compose');
    engine.recordUserClick(DEMO_CHAT, 'Grandma');
    advance(10_000);
    expect(run().elapsedMs).toBe(7_000);

    engine.handBack(DEMO_CHAT);
    s = run();
    expect(s.activity).toBe('acting');
    expect(findItem(s, 'steps')?.steps.map((x) => x.label)).toEqual([
      'You clicked Compose',
      'You clicked Grandma',
    ]);
    const q = findItem(s, 'question');
    expect(q?.text).toBe(format(copy.fitts.handBack, { path: 'Compose → Grandma' }));
    engine.answerQuestion(DEMO_CHAT, q?.id ?? '', copy.fitts.pathYes);
    expect(findItem(run(), 'progress')?.title).toBe(copy.fitts.testingPath);
  });
});

describe('stop run (§7.2)', () => {
  it('asks first; "Keep going" resumes', () => {
    engine.loadAudit(DEMO_CHAT, 'ask-unsure');
    advance(20_000);
    engine.stopRun(DEMO_CHAT);
    expect(run().activity).toBe('paused');
    const card = last(run());
    expect(card).toMatchObject({ type: 'state', stateKind: 'stop-run-confirm' });
    engine.answerQuestion(DEMO_CHAT, card?.id ?? '', 'keep');
    expect(run().activity).toBe('acting');
  });

  it('"Stop run" ends at Done with partial results', () => {
    engine.loadAudit(DEMO_CHAT, 'ask-unsure');
    advance(20_000);
    engine.stopRun(DEMO_CHAT);
    engine.answerQuestion(DEMO_CHAT, last(run())?.id ?? '', 'stop');
    const s = run();
    expect(s.phase).toBe('done');
    expect(s.activity).toBe('idle');
    expect(s.findings).toHaveLength(2);
    expect(messages(s).at(-1)).toBe(format(copy.fitts.stoppedRun, { n: 2 }));
    advance(30_000);
    expect(run().elapsedMs).toBe(s.elapsedMs);
  });
});

describe('interview (§6.3)', () => {
  it('fills the brief one answer at a time with the typing indicator', () => {
    engine.startInterview(DEMO_CHAT);
    let s = run();
    expect(s.phase).toBe('interview');
    expect(messages(s)[0]).toBe(format(copy.fitts.interviewOpener, { name: 'Allen' }));
    expect(findItem(s, 'brief')).toBeDefined();
    expect(isBriefReady(s.brief)).toBe(false);

    engine.answerInterview(DEMO_CHAT, 'A messaging app so my grandparents can text the family.');
    s = run();
    expect(s.brief).toMatchObject({
      for: 'Family messaging',
      who: 'Older adults, some with low vision',
    });
    expect(isBriefReady(s.brief)).toBe(true);
    expect(s.fittsTyping).toBe(true);
    advance(REPLY_MS - 1);
    expect(run().fittsTyping).toBe(true);
    advance(1);
    expect(messages(run()).at(-1)).toBe(
      format(copy.fitts.interviewFollowUp, { screen: 'compose' }),
    );

    engine.answerInterview(DEMO_CHAT, 'They never know if a message sent.');
    advance(REPLY_MS);
    s = run();
    expect(s.brief.pain).toBe('No send confirmation · mixed labels');
    expect(messages(s).at(-1)).toBe(copy.fitts.interviewTieBack);
    expect(findItem(s, 'quick-replies')?.options).toEqual([
      'Calm and simple',
      'Bright and friendly',
      'Match our brand',
    ]);

    engine.answerInterview(DEMO_CHAT, 'Calm and simple');
    s = run();
    expect(s.brief.feel).toBe('Calm and simple');
    expect(findItem(s, 'quick-replies')?.used).toBe(true);
  });

  it('maps each answer to the next field for other projects', () => {
    engine.startInterview(PORTFOLIO);
    engine.answerInterview(PORTFOLIO, 'My design portfolio');
    expect(isBriefReady(run(PORTFOLIO).brief)).toBe(false);
    advance(REPLY_MS);
    engine.answerInterview(PORTFOLIO, 'Hiring managers');
    expect(run(PORTFOLIO).brief).toEqual({ for: 'My design portfolio', who: 'Hiring managers' });
    expect(isBriefReady(run(PORTFOLIO).brief)).toBe(true);
  });

  it('"Start the audit" switches to the audit phase', () => {
    engine.startInterview(DEMO_CHAT);
    engine.startAudit(DEMO_CHAT);
    expect(run().phase).toBe('audit');
    expect(run().activity).toBe('acting');
    expect(run().routes).toHaveLength(8);
  });

  it('a new run keeps the brief and asks what changed', () => {
    engine.jumpToBeat(DEMO_CHAT, beatIndex('done'));
    const brief = run().brief;
    engine.startInterview(DEMO_CHAT);
    const s = run();
    expect(s.runId).toBe('run-8');
    expect(s.brief).toEqual(brief);
    expect(messages(s)[0]).toBe(copy.fitts.interviewAgain);
  });
});

describe('background projects', () => {
  it('keeps ticking runs that are not on screen', () => {
    engine.loadAudit(DEMO_CHAT, 'ask-unsure');
    engine.loadAudit(HARTWELL, 'autonomous');
    advance(3_000);
    expect(run(DEMO_CHAT).elapsedMs).toBe(3_000);
    expect(run(HARTWELL).elapsedMs).toBe(3_000);
  });
});

describe('scenarios end to end', () => {
  it('Scenario A reaches Done with the fixture totals', () => {
    engine.loadAudit(DEMO_CHAT, 'ask-unsure');
    advance(35_000);
    engine.approveFixes(DEMO_CHAT, [
      LIVE_FINDINGS.nullName.id,
      LIVE_FINDINGS.names.id,
      LIVE_FINDINGS.confirm.id,
    ]);
    advance(22_000);
    engine.respondGate(DEMO_CHAT, run().gate?.id ?? '', 'deny');
    advance(40_000);
    const s = run();
    expect(s.phase).toBe('done');
    expect(s.findings).toHaveLength(31);
    const statuses = s.findings.map((f) => f.status);
    expect(statuses.filter((x) => x === 'pr-opened')).toHaveLength(24);
    expect(statuses.filter((x) => x === 'rolled-back')).toHaveLength(2);
    expect(statuses.filter((x) => x === 'dismissed')).toHaveLength(3);
    expect(statuses.filter((x) => x === 'open')).toHaveLength(2);
    expect(s.changes).toHaveLength(26);
    expect(new Set(s.changes.flatMap((c) => (c.prNumber ? [c.prNumber] : []))).size).toBe(9);
    expect(s.cost.spentUsd).toBe(13.92);
    const fixes = s.changes.reduce((sum, c) => sum + c.costUsd, 0);
    expect(Math.round(fixes * 100) / 100).toBe(s.cost.byPhase.fixes);
    const phases = Object.values(s.cost.byPhase).reduce((a, b) => a + b, 0);
    expect(Math.round(phases * 100) / 100).toBe(13.92);
    expect(messages(s).at(-1)).toBe(copy.fitts.done);
  });

  it('Scenario B auto-applies in Autonomous', () => {
    engine.loadAudit(HARTWELL, 'autonomous');
    advance(40_000);
    const s = run(HARTWELL);
    expect(findItem(s, 'lookfeel')?.text).toBe(copy.fitts.redesign);
    expect(findItem(s, 'directions')?.selectedId).toBe('quiet');
    expect(findItem(s, 'wording')).toMatchObject({ from: 'Party packages', to: 'Service options' });
    expect(s.changes.find((c) => c.kind === 'redesign')).toMatchObject({ prNumber: 22 });
    expect(findItem(s, 'progress')?.items.every((i) => i.state === 'done')).toBe(true);
    expect(s.phase).toBe('done');
  });

  it('Scenario B waits for a pick in Ask modes', () => {
    engine.loadAudit(HARTWELL, 'ask-unsure');
    advance(10_000);
    expect(run(HARTWELL).waitingFor).toBe('approval');
    advance(20_000);
    expect(findItem(run(HARTWELL), 'progress')).toBeUndefined();
    engine.pickDirection(HARTWELL, 'warm');
    const s = run(HARTWELL);
    expect(findItem(s, 'directions')?.selectedId).toBe('warm');
    expect(findItem(s, 'progress')?.title).toBe('Applying the look');
    expect(s.nowText).toBe('Applying Warm & personal to every page');
    expect(s.activity).toBe('redesigning');
  });

  it('decideWording undoes the wording change', () => {
    engine.loadAudit(HARTWELL, 'autonomous');
    advance(40_000);
    const wording = findItem(run(HARTWELL), 'wording');
    engine.decideWording(HARTWELL, wording?.id ?? '', 'undo');
    expect(findItem(run(HARTWELL), 'wording')?.decision).toBe('undo');
    expect(run(HARTWELL).changes.find((c) => c.kind === 'wording')?.status).toBe('undone');
  });
});

describe('Scenario panel controls', () => {
  it('jumpToBeat plays through earlier holds and stops on the target', () => {
    engine.jumpToBeat(DEMO_CHAT, beatIndex('gate'));
    const s = run();
    expect(s.waitingFor).toBe('gate');
    expect(findItem(s, 'approval.batch')?.answer).toBeDefined();
    expect(s.fixingCount).toBeGreaterThan(0);
    expect(engine.getScript(DEMO_CHAT).cursor).toBe(beatIndex('gate') + 1);
  });

  it('every edge state posts its card', () => {
    const kinds = [
      'stop-run-confirm',
      'stopped',
      'uncommitted',
      'login-wall',
      'site-down',
      'budget',
      'api-trouble',
      'reopen',
      'nothing-found',
    ] as const;
    for (const kind of kinds) {
      engine.reset();
      engine.loadAudit(DEMO_CHAT, 'ask-unsure');
      engine.showEdgeState(DEMO_CHAT, kind);
      expect(findItem(run(), 'state')?.stateKind).toBe(kind);
    }
  });

  it('API trouble retries on its own after 12s', () => {
    engine.loadAudit(DEMO_CHAT, 'ask-unsure');
    engine.showEdgeState(DEMO_CHAT, 'api-trouble');
    expect(run().waitingFor).toMatch(/^question:/);
    advance(12_000);
    expect(run().waitingFor).toBeUndefined();
    expect(messages(run())).toContain(copy.fitts.apiRecovered);
  });
});

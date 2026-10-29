// Scenario A: demo/chat in Ask when unsure, about 100s at 1× (SPEC §9.5).
import type { Finding, RunState } from '@fitts/schema';
import { copy } from '../../copy';
import { format } from '../../lib/format';
import { round2 } from '../../state/mock-engine';
import type { BeatContext, Scenario } from '../../state/script';
import { DEMO_ROUTES, LIVE_FINDINGS, demoChatDoneState } from '../fixtures/demo-chat';

const S = 1000;

function setRoute(
  s: RunState,
  path: string,
  status: RunState['routes'][number]['status'],
  issues?: number,
) {
  const route = s.routes.find((r) => r.path === path);
  if (!route) return;
  route.status = status;
  if (issues !== undefined) route.issues = issues;
}

function act(s: RunState, nowText: string, ref?: string, label?: string) {
  s.nowText = nowText;
  // Plan only observes: the ghost cursor looks rather than taps (§7.1).
  const shown = s.mode === 'plan' ? label?.replace(/tapping|typing in/, 'looking at') : label;
  s.overlays.attention = ref && shown ? { ref, label: shown } : undefined;
}

/** Ask every action: Fitts asks before each ordinary click or keystroke (§7.1). */
function askFirst(ctx: BeatContext, action: string) {
  if (ctx.mode !== 'ask-every') return;
  ctx.ask(
    {
      text: format(copy.fitts.askToAct, { action }),
      options: [copy.fitts.goAhead, copy.fitts.skipIt],
      blocking: true,
    },
    (answer, _s, c) => {
      if (answer === copy.fitts.skipIt) c.say(copy.fitts.skippedAction);
    },
  );
}

function spend(s: RunState, phase: keyof RunState['cost']['byPhase'], usd: number) {
  s.cost.byPhase[phase] = round2(s.cost.byPhase[phase] + usd);
  s.cost.spentUsd = round2(s.cost.spentUsd + usd);
}

/** Adds a finding, its chat card and its numbered coral pin. */
export function report(s: RunState, ctx: BeatContext, finding: Finding) {
  s.findings.push({ ...finding, status: 'open' });
  if (finding.elementRef) {
    s.overlays.problems.push({ ref: finding.elementRef, pin: s.overlays.problems.length + 1 });
  }
  ctx.post({ type: 'finding', findingId: finding.id });
  spend(s, 'reviewers', 0.35);
}

const F = LIVE_FINDINGS;

export const demoChatAudit: Scenario = {
  id: 'demo-chat',
  label: 'demo/chat · Ask when unsure',
  beats: [
    {
      id: 'seed',
      atMs: 0,
      label: '0s · Site map seeds 8 routes',
      apply: (s) => {
        s.routes = DEMO_ROUTES.map((r) => ({ ...r }));
        setRoute(s, '/', 'testing');
        act(s, 'Opening the inbox');
      },
    },
    {
      id: 'start',
      atMs: 2 * S,
      label: '2s · Starting with compose',
      apply: (s, ctx) => {
        ctx.say("Starting with the compose flow, since that's where you said people get stuck.");
        setRoute(s, '/', 'done', 1);
        setRoute(s, '/contacts', 'done', 4);
        setRoute(s, '/search', 'done', 2);
        setRoute(s, '/compose', 'testing');
      },
    },
    {
      id: 'steps',
      atMs: 6 * S,
      label: '6s · Steps and attention on Compose',
      apply: (s, ctx) => {
        ctx.post({
          type: 'steps',
          steps: [
            { label: 'open /', costUsd: 0.02 },
            { label: 'read inbox list', costUsd: 0.03 },
            { label: 'hover Compose', costUsd: 0.01 },
            { label: 'tap Compose', costUsd: 0.02 },
            { label: 'wait for /compose (420 ms)', costUsd: 0.01 },
          ],
        });
        spend(s, 'crawling', 0.09);
        act(s, 'Tapping Compose', 'inbox-compose', 'Fitts · tapping Compose');
        askFirst(ctx, 'tap Compose');
      },
    },
    {
      id: 'thinking',
      atMs: 10 * S,
      label: '10s · Thinking about H6 recall',
      apply: (s, ctx) => {
        ctx.think(
          "the contact chosen on step 1 isn't visible here, so people have to remember it (H6).",
        );
        setRoute(s, '/compose/recipient', 'testing');
        act(s, 'Checking the To field', 'compose-to', 'Fitts · reading To');
      },
    },
    {
      id: 'finding-null',
      atMs: 14 * S,
      label: '14s · Finding: "(null)" shown as a name',
      apply: (s, ctx) => {
        report(s, ctx, F.nullName);
        setRoute(s, '/compose/recipient', 'testing', 1);
        act(s, 'Tapping NEXT and timing the response', 'compose-next', 'Fitts · tapping NEXT');
        askFirst(ctx, 'tap NEXT');
      },
    },
    {
      id: 'first-findings',
      atMs: 18 * S,
      label: '18s · Finding: One action, three names',
      apply: (s, ctx) => {
        ctx.say(copy.fitts.firstFindings);
        report(s, ctx, F.names);
        setRoute(s, '/compose', 'testing', 3);
      },
    },
    {
      id: 'admin-question',
      atMs: 24 * S,
      label: '24s · Question: test /admin too?',
      apply: (s, ctx) => {
        ctx.ask(
          {
            text: "There's an /admin page. Should I test it too?",
            options: ['Yes', 'Not now'],
            blocking: false,
          },
          (answer, s2) => {
            if (answer !== 'Yes') return;
            s2.routes.push({
              path: '/admin',
              depth: 0,
              status: 'queued',
              issues: 0,
              label: 'later',
            });
          },
        );
        act(s, 'Sending a test message to Grandma', 'compose-send', 'Fitts · tapping Send Text');
        askFirst(ctx, 'send a test message to Grandma');
      },
    },
    {
      id: 'finding-confirm',
      atMs: 30 * S,
      label: '30s · Finding: No confirmation after sending',
      apply: (s, ctx) => {
        report(s, ctx, F.confirm);
        setRoute(s, '/compose/confirm', 'testing', 1);
      },
    },
    {
      id: 'approval',
      atMs: 34 * S,
      label: '34s · 3 fixes are ready',
      apply: (_s, ctx) => {
        ctx.requestApproval([F.nullName.id, F.names.id, F.confirm.id], (approved, s2, c) => {
          // Two fixes start now; the recipient fix follows once one finishes (§9.5).
          const now = [F.confirm.id, F.names.id].filter((id) => approved.includes(id));
          c.startFixes(now, {
            doneAtMs: now.map((id) => (id === F.confirm.id ? 44 * S : 72 * S)),
          });
          if (approved.includes(F.nullName.id)) {
            c.at(Math.max(s2.elapsedMs, 46 * S), (_s3, c3) =>
              c3.startFixes([F.nullName.id], { doneAtMs: [86 * S] }),
            );
          }
        });
      },
    },
    {
      id: 'finding-search',
      atMs: 50 * S,
      label: '50s · Finding: Search refetches every keystroke',
      apply: (s, ctx) => {
        setRoute(s, '/compose', 'done');
        setRoute(s, '/compose/recipient', 'done');
        setRoute(s, '/compose/confirm', 'done');
        setRoute(s, '/search', 'testing');
        act(s, 'Typing "grandma" into search', 'search-input', 'Fitts · typing in search');
        askFirst(ctx, 'type "grandma" into search');
        report(s, ctx, F.search);
      },
    },
    {
      id: 'gate',
      atMs: 56 * S,
      label: '56s · Gate: Delete conversation',
      apply: (s, ctx) => {
        setRoute(s, '/search', 'done', 3);
        setRoute(s, '/contacts/grandma', 'testing');
        act(s, 'Looking at Delete conversation', 'thread-delete', 'Fitts · about to tap Delete');
        ctx.requestGate({
          id: 'gate-delete-conversation',
          action: 'Delete conversation',
          route: '/contacts/grandma',
          heldRequest: 'DELETE /api/conversations/12',
          testing: 'H3 user control and H5 error prevention',
        });
      },
    },
    {
      id: 'finding-target',
      atMs: 66 * S,
      label: '66s · Finding: Send target is 28 × 20 px',
      apply: (s, ctx) => {
        setRoute(s, '/contacts/grandma', 'done', 1);
        setRoute(s, '/compose', 'testing');
        act(s, 'Measuring tap targets', 'compose-send', 'Fitts · measuring Send');
        report(s, ctx, F.target);
      },
    },
    {
      id: 'rolled-back',
      atMs: 80 * S,
      label: '80s · Rolled back: spacing on /settings',
      apply: (s, ctx) => {
        setRoute(s, '/compose', 'done', 4);
        setRoute(s, '/settings', 'testing', 1);
        act(s, 'Re-checking /settings at phone width', 'settings-list', 'Fitts · checking spacing');
        s.findings.push({ ...F.spacing, status: 'rolled-back' });
        s.changes.push({
          id: `change-${F.spacing.id}`,
          findingIds: [F.spacing.id],
          kind: 'fix',
          title: 'Roomier settings rows',
          severity: F.spacing.severity,
          costUsd: 0.21,
          status: 'rolled-back',
          reason: 'Broke the phone layout on /settings',
        });
        ctx.say(
          'I rolled back the spacing change on /settings. It broke the layout at phone width, so nothing was pushed.',
        );
      },
    },
    {
      id: 'done',
      atMs: 90 * S,
      label: '90s · Done',
      apply: (s, ctx) => {
        ctx.finish();
        Object.assign(s, demoChatDoneState());
        s.overlays.problems = [];
        s.step = s.stepEstimate;
        s.controlsTried.done = s.controlsTried.total;
        ctx.say(copy.fitts.done);
      },
    },
  ],
};

// Journeys (SPEC-phase4 §6.1): one goal from the App Model, tried the way a person would. Each
// step, Spark sees the screenshot, the goal and plan, the steps so far and the page's controls,
// and picks one action; the loop performs it through the same `perform` the crawl uses (gate,
// modes, probes after each action), up to 15 actions. The outcome is evidence for the reviewers.
import type { AppPage, Journey } from '@fitts/schema';
import prompt from '../../../../../docs/prompts/journey.md?raw';
import {
  isUnusable,
  retryUnusable,
  UnusableAnswer,
  type CallContext,
  type LlmCaller,
} from '../llm/call';
import type { AxSnapshot } from '../protocol';
import { DESTRUCTIVE, routeOf } from './coverage';
import { MARKER, type Action } from './brain';

export const MAX_JOURNEY_ACTIONS = 15;
/** Actions in a row with no visible change before the journey counts as stuck. */
const STUCK_AFTER = 3;

export type JourneyAction =
  | Exclude<Action, { kind: 'done' }>
  | { kind: 'back'; why: string }
  | { kind: 'goal_met'; why: string }
  | { kind: 'blocked'; reason: string };

export interface JourneyStepInput {
  journey: Journey;
  snapshot: AxSnapshot;
  /** The page as it looks now (JPEG, base64), when the site gave one. */
  shot?: string;
  /** The actions so far, oldest first ("tapped NEXT → /compose/recipient"). */
  history: string[];
  signal?: AbortSignal;
}

export interface JourneyBrain {
  next(input: JourneyStepInput): Promise<JourneyAction>;
}

export interface JourneyResult {
  id: string;
  status: 'done' | 'failed' | 'blocked';
  reason?: string;
  /** Actions taken. */
  steps: number;
  /** The route it ended on. */
  route: string;
  /** What happened, one line per action, for the reviewers. */
  trace: string[];
}

export interface JourneyDeps {
  brain: JourneyBrain;
  snapshot(): Promise<AxSnapshot>;
  screenshot(): Promise<string | undefined>;
  /** The crawl's own perform: gate, modes, probes, the trail. Resolves to the page it left on. */
  perform(action: Exclude<Action, { kind: 'done' }>, from: string): Promise<string>;
  back(): Promise<string>;
  /** The run ended or the owner took the wheel: stop now. */
  stopped(): boolean;
  /** Form rules from the App Model for the page the action is on. */
  forms?(route: string): AppPage['forms'];
  signal?: AbortSignal;
}

/** The text to type in a field, from the App Model's rule: a valid value, or an invalid one. */
export function formValue(
  field: { name: string; type: string; required: boolean; rule?: string },
  invalid: boolean,
): string {
  const t = field.type.toLowerCase();
  if (invalid) {
    if (field.required) return '';
    if (t === 'email') return 'not-an-email';
    if (t === 'number' || t === 'tel') return 'abc';
    if (t === 'url') return 'not a url';
    if (field.rule) return '!';
    return '';
  }
  if (t === 'email') return `${MARKER}@example.com`;
  if (t === 'number') return '42';
  if (t === 'tel') return '5550100';
  if (t === 'url') return 'https://example.com';
  // The site window picks the date (a week out, each later date field a day after the last).
  if (t === 'date') return '';
  if (t === 'password') return `${MARKER}-Pass1!`;
  return `${MARKER} ${field.name}`.slice(0, 80);
}

/** A page's form field matching a control, by name (case and spaces don't matter). */
export function fieldFor(
  forms: AppPage['forms'] | undefined,
  name: string,
): { form: string; field: AppPage['forms'][number]['fields'][number] } | undefined {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ');
  const n = norm(name);
  if (!n || !forms) return undefined;
  for (const form of forms)
    for (const field of form.fields)
      if (norm(field.name) === n || n.includes(norm(field.name)) || norm(field.name).includes(n))
        return { form: form.name, field };
  return undefined;
}

/**
 * Runs one journey: at most 15 actions, each chosen by the brain from the page and its
 * screenshot, each performed through the crawl. Typing follows the App Model's form rules:
 * once per form an invalid value (to see the error handling), then valid ones.
 */
export async function runJourney(deps: JourneyDeps, journey: Journey): Promise<JourneyResult> {
  const history: string[] = [];
  const trace: string[] = [];
  const invalidTried = new Set<string>();
  let route = routeOf(journey.start || '/');
  let unchanged = 0;
  let lastKey = '';
  const result = (status: JourneyResult['status'], reason?: string): JourneyResult => ({
    id: journey.id,
    status,
    ...(reason ? { reason } : {}),
    steps: history.length,
    route,
    trace,
  });
  for (let n = 0; n < MAX_JOURNEY_ACTIONS; n++) {
    if (deps.stopped()) return result('blocked', 'the run stopped');
    let snap: AxSnapshot;
    try {
      snap = await deps.snapshot();
    } catch {
      return result('failed', 'the page stopped answering');
    }
    route = routeOf(snap.path);
    // Field values and control names count as change: filling in a form changes nothing else on
    // its screen (Nov 2: the Android order journey "stuck" on checkout after typing two fields).
    const controls = snap.nodes.map((x) => `${x.name}=${x.value ?? ''}`).join('\u0001');
    const key = `${route}|${snap.title}|${snap.headings.join('|')}|${controls}`;
    unchanged = key === lastKey ? unchanged + 1 : 0;
    lastKey = key;
    if (unchanged >= STUCK_AFTER)
      return result('failed', `nothing changed after ${STUCK_AFTER} actions on ${route}`);
    const shot = await deps.screenshot().catch(() => undefined);
    let action: JourneyAction;
    try {
      action = await deps.brain.next({
        journey,
        snapshot: snap,
        ...(shot ? { shot } : {}),
        history,
        ...(deps.signal ? { signal: deps.signal } : {}),
      });
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return result('blocked', 'stopped');
      return result('failed', 'Fitts could not decide the next step');
    }
    if (action.kind === 'goal_met') {
      trace.push(`goal met: ${action.why}`);
      return result('done');
    }
    if (action.kind === 'blocked') {
      trace.push(`blocked: ${action.reason}`);
      return result('blocked', action.reason);
    }
    // A control the page doesn't have, or a destructive one the plan didn't name: refused.
    if (action.kind === 'click' || action.kind === 'type') {
      const ref = action.ref;
      const node = snap.nodes.find((x) => x.ref === ref);
      if (!node) {
        trace.push(`skipped: no ${ref} on the page`);
        history.push(`tried a control that wasn't there`);
        continue;
      }
      // On the way to a payment, "checkout" only opens the form (the control that pays stops it).
      const payment = journey.needs?.includes('payment') === true;
      const risky = payment ? node.name.replace(/\bcheck ?out\b/gi, '') : node.name;
      if (
        action.kind === 'click' &&
        DESTRUCTIVE.test(risky) &&
        !journey.steps.some((s) => s.toLowerCase().includes(node.name.toLowerCase()))
      ) {
        trace.push(`refused: ${node.name} is destructive and not in the plan`);
        return result('blocked', `the plan would need "${node.name}", which deletes or pays`);
      }
      // A journey that needs a payment runs up to it: the control that pays is never tapped,
      // even when the plan names it.
      if (action.kind === 'click' && payment && PAYS.test(node.name)) {
        trace.push(`stopped: ${node.name} pays`);
        return result('blocked', `it got to "${node.name}", and I never pay on a run`);
      }
      if (action.kind === 'type') {
        const match = fieldFor(deps.forms?.(route), node.name);
        if (match) {
          const formKey = `${route}|${match.form}`;
          const invalid = !invalidTried.has(formKey);
          if (invalid) invalidTried.add(formKey);
          action = {
            ...action,
            text: formValue(match.field, invalid),
            why: invalid ? `Trying ${node.name} with a value it should reject` : action.why,
          };
        }
      }
    }
    let after: string;
    try {
      after = action.kind === 'back' ? await deps.back() : await deps.perform(action, snap.path);
    } catch {
      return result('failed', 'an action failed');
    }
    const line =
      action.kind === 'back'
        ? 'went back'
        : action.kind === 'navigate'
          ? `opened ${action.path}`
          : `${action.kind === 'click' ? 'tapped' : 'typed in'} ${action.name}`;
    const moved = routeOf(after) !== route ? ` → ${routeOf(after)}` : '';
    history.push(line + moved);
    trace.push(line + moved);
  }
  return result('failed', `the goal wasn't met in ${MAX_JOURNEY_ACTIONS} actions`);
}

const TOOLS = [
  tool('click', 'Tap an element by its ref.', { ref: { type: 'string' } }, ['ref']),
  tool(
    'type',
    'Type into a field by its ref.',
    { ref: { type: 'string' }, text: { type: 'string' } },
    ['ref', 'text'],
  ),
  tool('navigate', 'Open a path on the same site.', { path: { type: 'string' } }, ['path']),
  tool('back', "The browser's Back button.", {}, []),
  tool('goal_met', 'The goal is visibly done on this page.', {}, []),
  {
    type: 'function',
    name: 'blocked',
    description: "The goal can't be reached from here.",
    parameters: {
      type: 'object',
      properties: { reason: { type: 'string', description: 'One line.' } },
      required: ['reason'],
      additionalProperties: false,
    },
    strict: true,
  },
];

function tool(
  name: string,
  description: string,
  props: Record<string, unknown>,
  required: string[],
) {
  return {
    type: 'function',
    name,
    description,
    parameters: {
      type: 'object',
      properties: { ...props, why: { type: 'string', description: 'Under 10 words.' } },
      required: [...required, 'why'],
      additionalProperties: false,
    },
    strict: true,
  };
}

/** Spark with the screenshot, one tool call per step (`muse-spark-1.3`, low reasoning). */
export class SparkJourneyBrain implements JourneyBrain {
  constructor(
    private readonly caller: LlmCaller,
    private readonly ctx: () => CallContext,
    private readonly model: () => string,
  ) {}

  /** SPEC-phase4 §6C: an unusable answer is asked for once more, then thrown (the fallback takes over). */
  next(input: JourneyStepInput): Promise<JourneyAction> {
    return retryUnusable(() => this.ask(input));
  }

  private async ask(input: JourneyStepInput): Promise<JourneyAction> {
    const { journey, snapshot, shot, history, signal } = input;
    const page = JSON.stringify({
      path: snapshot.path,
      title: snapshot.title,
      headings: snapshot.headings.slice(0, 12),
      controls: snapshot.nodes
        .filter((n) => !n.disabled)
        .slice(0, 80)
        .map((n) => ({
          ref: n.ref,
          role: n.role,
          name: n.name,
          ...(n.value ? { value: n.value } : {}),
        })),
    });
    const res = await this.caller.call(this.ctx(), {
      task: 'crawl',
      model: this.model(),
      instructions: prompt,
      fixture: `journey-${journey.id}-${history.length}`,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text:
                `Goal: ${journey.name}. Done looks like: ${journey.goal}\n` +
                `Plan: ${journey.steps.map((s, i) => `${i + 1}. ${s}`).join(' ')}\n` +
                `So far (${history.length} of ${MAX_JOURNEY_ACTIONS}): ${history.join(' | ') || 'nothing yet'}\n` +
                `<untrusted_page_content>${page}</untrusted_page_content>`,
            },
            ...(shot ? [{ type: 'input_image', image_url: `data:image/jpeg;base64,${shot}` }] : []),
          ],
        },
      ],
      tools: TOOLS,
      reasoning: { effort: 'low' },
      ...(signal ? { signal } : {}),
    });
    const call = res.output.find((o) => o.type === 'function_call');
    if (!call) throw new UnusableAnswer('no step picked');
    const args = JSON.parse(typeof call['arguments'] === 'string' ? call['arguments'] : '{}') as {
      ref?: string;
      text?: string;
      path?: string;
      why?: string;
      reason?: string;
    };
    const why = (args.why ?? '').slice(0, 80);
    const node = args.ref ? snapshot.nodes.find((n) => n.ref === args.ref) : undefined;
    switch (call['name']) {
      case 'click':
        return node
          ? { kind: 'click', ref: node.ref, name: node.name, why: why || `Tapping ${node.name}` }
          : unusable('picked a control that is not on the page');
      case 'type':
        return node
          ? {
              kind: 'type',
              ref: node.ref,
              name: node.name,
              text: (args.text ?? MARKER).slice(0, 200),
              why: why || `Typing in ${node.name}`,
            }
          : unusable('picked a field that is not on the page');
      case 'navigate':
        return args.path && args.path.startsWith('/')
          ? { kind: 'navigate', path: args.path, why: why || `Opening ${args.path}` }
          : unusable('asked for a path off the site');
      case 'back':
        return { kind: 'back', why: why || 'Going back' };
      case 'goal_met':
        return { kind: 'goal_met', why: why || 'The goal is done' };
      case 'blocked':
        return { kind: 'blocked', reason: (args.reason ?? why ?? 'blocked').slice(0, 160) };
      default:
        throw new UnusableAnswer(`unknown tool ${String(call['name'])}`);
    }
  }
}

/** The control that pays or commits the order ("Place pickup order"; a checkout button only opens the form). */
export const PAYS =
  /\b(pay|purchase|buy|(?:place|complete|submit|confirm) (?:\w+ ){0,2}(?:order|purchase|booking))\b/i;

/**
 * The journeys a run tries, in order: enabled, by priority, 1 and 2 before the crawl, 3 after.
 * One that needs a payment runs up to the control that pays (runJourney stops there); one that
 * needs a login or an email can't be run.
 */
export function journeyOrder(journeys: Journey[]): { first: Journey[]; later: Journey[] } {
  const on = journeys.filter(
    (j) => j.enabled !== false && !j.needs?.some((n) => n !== 'data' && n !== 'payment'),
  );
  const by = (p: Journey['priority']) => on.filter((j) => j.priority === p);
  return { first: [...by(1), ...by(2)], later: by(3) };
}

const SUBMITISH = /^(submit|send|save|create|add|continue|next|done|sign up|post|go)\b/i;
const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Without a model (offline, no key): the plan itself, one step at a time. "Tap NEXT" taps the
 * control called NEXT; "Type in Message" types into that field; "Submit the form" taps the
 * submit control; "Open /path" navigates; "Go back" goes back. A step whose control isn't on
 * the page is skipped, and when the plan runs out the goal counts as met. Always makes
 * progress, like the explorer brain does for the crawl.
 */
export class PlanJourneyBrain implements JourneyBrain {
  private at = 0;

  next(input: JourneyStepInput): Promise<JourneyAction> {
    const { journey, snapshot } = input;
    const nodes = snapshot.nodes.filter((n) => !n.disabled);
    const byName = (name: string, roles?: string[]) => {
      const n = norm(name);
      const pool = roles ? nodes.filter((x) => roles.includes(x.role)) : nodes;
      return (
        pool.find((x) => norm(x.name) === n) ??
        pool.find((x) => n && norm(x.name).includes(n)) ??
        pool.find((x) => n && n.includes(norm(x.name)) && norm(x.name).length > 2)
      );
    };
    const fields = ['textbox', 'combobox', 'searchbox', 'textarea'];
    while (this.at < journey.steps.length) {
      const step = journey.steps[this.at]!.trim();
      this.at += 1;
      let m: RegExpExecArray | null;
      if ((m = /^(?:open|go to|visit)\s+(\/\S*)/i.exec(step)))
        return Promise.resolve({ kind: 'navigate', path: m[1]!, why: step });
      if (/^(?:go )?back\b/i.test(step)) return Promise.resolve({ kind: 'back', why: step });
      if (
        (m =
          /^(?:type|enter|fill(?: in)?|write)\b.*?(?:in|into)\s+(?:the\s+)?(.+?)(?: field)?\.?$/i.exec(
            step,
          ))
      ) {
        const field = byName(m[1]!, fields) ?? nodes.find((x) => fields.includes(x.role));
        if (field)
          return Promise.resolve({
            kind: 'type',
            ref: field.ref,
            name: field.name,
            text: `${MARKER} ${field.name}`.slice(0, 80),
            why: step,
          });
        continue;
      }
      if (/^submit\b/i.test(step)) {
        const submit = nodes.find((x) => x.role === 'button' && SUBMITISH.test(x.name.trim()));
        if (submit)
          return Promise.resolve({ kind: 'click', ref: submit.ref, name: submit.name, why: step });
        continue;
      }
      if (
        (m =
          /^(?:tap|click|press|choose|pick|select|open|toggle|check)\s+(?:on\s+|the\s+)?[“"']?(.+?)[”"']?(?: button| link| tab)?\.?$/i.exec(
            step,
          ))
      ) {
        const target =
          byName(m[1]!, ['button', 'link', 'tab', 'menuitem', 'checkbox', 'radio', 'switch']) ??
          byName(m[1]!);
        if (target)
          return Promise.resolve({ kind: 'click', ref: target.ref, name: target.name, why: step });
        continue;
      }
      // A step in other words: a control named like it, else skip it.
      const guess = byName(step.replace(/^\w+\s+/, ''), ['button', 'link']);
      if (guess)
        return Promise.resolve({ kind: 'click', ref: guess.ref, name: guess.name, why: step });
    }
    return Promise.resolve({ kind: 'goal_met', why: 'every step of the plan was done' });
  }
}

const unusable = (what: string): never => {
  throw new UnusableAnswer(what);
};

/**
 * SPEC-phase4 §6C: Spark first; when its answer for a step stays unusable after one retry, the
 * plan itself takes that step. Unreachable models never get here (the caller waits for them).
 */
export class FallbackJourneyBrain implements JourneyBrain {
  constructor(
    private readonly primary: JourneyBrain,
    private readonly fallback: JourneyBrain = new PlanJourneyBrain(),
  ) {}

  async next(input: JourneyStepInput): Promise<JourneyAction> {
    try {
      return await this.primary.next(input);
    } catch (e) {
      if (!isUnusable(e)) throw e;
      return this.fallback.next(input);
    }
  }
}

// The fixer's tool loop: a budget that bends while it's making progress, and a stop when it's
// stuck. No network: a scripted caller stands in for the model.
import { describe, expect, it } from 'vitest';
import type { CallContext, LlmCaller } from '../../src/agent/llm/call';
import { runToolLoop, STUCK_STEPS, type ToolHandler } from '../../src/agent/fix/fixer';

const ctx: CallContext = { runId: 'r', projectId: 'p', contributor: false, allowed: () => true };

/** A model that makes one tool call per step, from `next(step)`. */
function scripted(next: (step: number) => { name: string; args: Record<string, string> }) {
  let step = 0;
  const caller = {
    call: () => {
      const { name, args } = next(step++);
      return Promise.resolve({
        output: [
          { type: 'function_call', name, call_id: `c${step}`, arguments: JSON.stringify(args) },
        ],
        outputText: '',
      });
    },
  } as unknown as LlmCaller;
  return { caller, steps: () => step };
}

const handlers: Record<string, ToolHandler> = {
  read_file: (args) => Promise.resolve({ output: `contents of ${args['path'] ?? ''}` }),
  search: () => Promise.resolve({ output: 'no matches' }),
  apply_patch: () => Promise.resolve({ output: 'patched', patched: true }),
};

const run = (caller: LlmCaller, extra: Partial<Parameters<typeof runToolLoop>[2]> = {}) =>
  runToolLoop(caller, ctx, {
    model: 'm',
    instructions: '',
    input: [],
    tools: [],
    handlers,
    maxSteps: 6,
    hardMax: 30,
    effort: 'low',
    maxOutputTokens: 100,
    findingId: 'f',
    fixture: 'fix',
    ...extra,
  });

describe('the fixer loop', () => {
  it('stops when it keeps repeating itself, and says it got stuck', async () => {
    const { caller, steps } = scripted(() => ({ name: 'read_file', args: { path: 'a.css' } }));
    const out = await run(caller);
    expect(out.end).toBe('stuck');
    expect(steps()).toBe(1 + STUCK_STEPS);
    expect(out.notes).toContain('a.css');
  });

  it('keeps going past its budget while it finds new things, and asks first', async () => {
    const asked: number[] = [];
    const { caller } = scripted((step): { name: string; args: Record<string, string> } =>
      step < 9
        ? { name: 'read_file', args: { path: `file-${step}.css` } }
        : step === 9
          ? { name: 'apply_patch', args: { path: 'file-1.css', find: 'a', replace: 'b' } }
          : { name: 'done', args: { summary: 'Added focus styles.' } },
    );
    const out = await run(caller, {
      more: (n) => {
        asked.push(n);
        return Promise.resolve(true);
      },
    });
    expect(out.end).toBe('done');
    expect(out.patched).toBe(1);
    expect(asked).toEqual([6]);
  });

  it('stops at the budget when the user says no', async () => {
    const { caller } = scripted((step) => ({ name: 'read_file', args: { path: `f${step}` } }));
    const out = await run(caller, { more: () => Promise.resolve(false) });
    expect(out.end).toBe('declined');
  });

  it('never passes the hard limit', async () => {
    const { caller, steps } = scripted((step) => ({
      name: 'read_file',
      args: { path: `f${step}` },
    }));
    const out = await run(caller, { more: () => Promise.resolve(true) });
    expect(out.end).toBe('budget');
    expect(steps()).toBe(30);
  });
});

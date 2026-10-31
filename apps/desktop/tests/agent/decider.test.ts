// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseDecision, SparkDecider, sparkConverse } from '../../src/agent/orchestrator/decider';
import type { Situation } from '../../src/agent/orchestrator/abilities';

const ctx = () => ({ runId: 'run-1', projectId: 'p', contributor: false, allowed: () => true });

/** A caller that answers every call with one response, and keeps the requests. */
function caller(response: { output?: unknown[]; outputText?: string }) {
  const requests: { tools?: unknown[]; input: unknown; instructions?: string }[] = [];
  return {
    requests,
    call: (_c: unknown, req: (typeof requests)[number]) => {
      requests.push(req);
      return Promise.resolve({ output: [], outputText: '', ...response });
    },
  };
}

const situation = { messages: ['skip the blog'], earlier: [] } as unknown as Situation;

describe('the decision step (SPEC-phase3 §1.2)', () => {
  it('turns a tool call into a decision, trimmed', () => {
    expect(
      parseDecision(
        'skip_pages',
        JSON.stringify({ paths: ['/blog'], say: ' Skipping the blog. ' }),
      ),
    ).toEqual({ ability: 'skip_pages', paths: ['/blog'], say: 'Skipping the blog.' });
    expect(parseDecision('explore', JSON.stringify({ route: '', say: '' }))).toEqual({
      ability: 'explore',
    });
  });

  it('an unknown tool, or no tool call, throws (the run falls back)', async () => {
    expect(() => parseDecision('delete_site', '{}')).toThrow();
    const none = new SparkDecider(caller({}) as never, ctx, () => 'spark');
    await expect(none.next(situation)).rejects.toThrow();
  });

  it('sends the situation, the prompt and one tool per ability', async () => {
    const c = caller({
      output: [
        {
          type: 'function_call',
          name: 'explore',
          arguments: JSON.stringify({ route: '/checkout', say: 'Opening checkout.' }),
        },
      ],
    });
    const d = await new SparkDecider(c as never, ctx, () => 'spark').next(situation);
    expect(d).toEqual({ ability: 'explore', route: '/checkout', say: 'Opening checkout.' });
    expect(JSON.stringify(c.requests[0]?.input)).toContain('skip the blog');
    expect(c.requests[0]?.instructions).toContain('The owner steers');
    expect(c.requests[0]?.tools).toHaveLength(13);
  });
});

describe('converse (§1.3)', () => {
  it('returns the reply, and throws on an empty one', async () => {
    const input = {
      brief: {},
      live: false,
      now: 'Tapping Save',
      covered: { pages: 2, controls: { done: 3, total: 9 } },
      findings: [],
      recent: [],
      message: 'what do you think of the nav?',
    };
    const ok = sparkConverse(
      caller({
        outputText: JSON.stringify({ say: 'It’s clear, but the labels are tiny.' }),
      }) as never,
      ctx,
      () => 'spark',
    );
    expect(await ok(input)).toBe('It’s clear, but the labels are tiny.');
    const empty = sparkConverse(
      caller({ outputText: JSON.stringify({ say: ' ' }) }) as never,
      ctx,
      () => 'spark',
    );
    await expect(empty(input)).rejects.toThrow();
  });
});

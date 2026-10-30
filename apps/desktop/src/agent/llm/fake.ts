// Recorded model responses for tests (SPEC-phase2 §18): tests never call the network. A fixture
// is tests/fixtures/llm/<name>.json, recorded once from a real call.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LlmClient, LlmRequest, LlmResponse } from './call';
import { LlmError } from './call';

export interface Fixture {
  name: string;
  model: string;
  recordedAt: string;
  response: LlmResponse;
}

/**
 * Answers each request with the fixture its `fixture` names, or the next unnamed fixture in
 * order. `fail` scripts errors (by status) for the next calls, to test retries.
 */
export class FakeLlmClient implements LlmClient {
  readonly requests: LlmRequest[] = [];
  private cursor = 0;

  constructor(
    private readonly fixtures: Fixture[],
    private readonly fail: number[] = [],
  ) {}

  respond(req: LlmRequest): Promise<LlmResponse> {
    this.requests.push(req);
    const status = this.fail.shift();
    if (status !== undefined)
      return Promise.reject(
        new LlmError(`HTTP ${status}`, status, status === 429 || status >= 500),
      );
    const named = req.fixture ? this.fixtures.find((f) => f.name === req.fixture) : undefined;
    const fixture = named ?? this.fixtures[this.cursor++ % Math.max(1, this.fixtures.length)];
    if (!fixture) return Promise.reject(new LlmError('no fixture', undefined, false));
    return Promise.resolve({ ...fixture.response, model: req.model });
  }
}

/**
 * Dev only (FITTS_RECORD_LLM=<dir>): records each real response as a fixture named by the
 * request's `fixture` (or its task), so tests can replay it. Responses only: no keys, no inputs.
 */
export function recording(client: LlmClient, dir: string): LlmClient {
  return {
    async respond(req) {
      const response = await client.respond(req);
      const name = req.fixture ?? req.task;
      // Reasoning items carry an opaque encrypted blob tests never need.
      const kept = { ...response, output: response.output.filter((o) => o.type !== 'reasoning') };
      const fixture: Fixture = {
        name,
        model: req.model,
        recordedAt: new Date().toISOString(),
        response: kept,
      };
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${name}.json`), JSON.stringify(fixture, null, 2));
      return response;
    },
  };
}

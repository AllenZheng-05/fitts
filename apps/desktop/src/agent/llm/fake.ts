// Recorded model responses for tests (SPEC-phase2 §18): tests never call the network. A fixture
// is tests/fixtures/llm/<name>.json, recorded once from a real call.
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

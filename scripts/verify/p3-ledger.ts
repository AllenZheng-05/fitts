// P3 acceptance: one Spark, one Wonder and one Baseten call through the agent's LlmCaller, each
// landing in the cost ledger. Saves the responses as test fixtures (tests/fixtures/llm/).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CostLedger } from '../../apps/desktop/src/agent/ledger/ledger';
import { basetenClient, LlmCaller, metaClient } from '../../apps/desktop/src/agent/llm/call';
import { SPARK, SPARK_OPEN, WONDER } from '../../apps/desktop/src/agent/llm/router';
import { canSpend, key, log, recordSpend, ROOT } from './_lib';

const meta = key('META_API_KEY');
const baseten = key('BASETEN_API_KEY');
if (!meta || !baseten) {
  log('BLOCKED: needs META_API_KEY and BASETEN_API_KEY');
  process.exit(0);
}
if (!canSpend(0.05)) process.exit(0);

const ledger = new CostLedger();
const caller = new LlmCaller(
  (p) => (p === 'meta' ? metaClient(meta) : basetenClient(baseten)),
  ledger,
);
const ctx = { runId: 'run-p3', projectId: 'demo-chat', contributor: false, allowed: () => true };

const finding = {
  type: 'json_schema',
  name: 'finding',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'At most 8 words.' },
      heuristic: {
        type: 'string',
        enum: ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'H10'],
      },
      severity: { type: 'integer', description: '1 to 4' },
    },
    required: ['title', 'heuristic', 'severity'],
    additionalProperties: false,
  },
};

const outDir = join(ROOT, 'apps', 'desktop', 'tests', 'fixtures', 'llm');
mkdirSync(outDir, { recursive: true });

const jobs = [
  { name: 'p3-spark-finding', model: SPARK, task: 'review' as const, format: finding },
  { name: 'p3-wonder-finding', model: WONDER, task: 'aggregate' as const, format: finding },
  { name: 'p3-baseten-reply', model: SPARK_OPEN, task: 'review' as const },
];
for (const job of jobs) {
  const res = await caller.call(ctx, {
    task: job.task,
    model: job.model,
    input:
      'A message composer shows the recipient as "(null)". Report it as one usability finding.',
    reasoning: { effort: 'low' },
    ...(job.format ? { format: job.format } : {}),
  });
  writeFileSync(
    join(outDir, `${job.name}.json`),
    JSON.stringify(
      { name: job.name, model: job.model, recordedAt: new Date().toISOString(), response: res },
      null,
      2,
    ),
  );
  log(job.name, { text: res.outputText.slice(0, 160), usage: res.usage });
}

const entries = ledger.forRun('run-p3');
for (const e of entries) recordSpend('p3', e.usd, `${e.provider} ${e.model} ${e.task}`);
log(
  'ledger',
  entries.map((e) => ({
    provider: e.provider,
    model: e.model,
    task: e.task,
    phase: e.phase,
    usd: e.usd,
    latencyMs: e.latencyMs,
  })),
);
log('totals', ledger.totals('run-p3'));

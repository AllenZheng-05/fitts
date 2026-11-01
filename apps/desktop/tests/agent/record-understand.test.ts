// @vitest-environment node
// Records Pass 2 of Understand on demo/chat as a fixture (SPEC-phase4 §3.4). It spends money
// (about $0.05 on Spark), so it only runs on purpose:
//   FITTS_RECORD_UNDERSTAND=1 pnpm --filter @fitts/desktop exec vitest run tests/agent/record-understand.test.ts
// The key comes from the repo's .env.local and is never printed. `pnpm test` skips it.
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CostLedger } from '../../src/agent/ledger/ledger';
import { LlmCaller, metaClient } from '../../src/agent/llm/call';
import { recording } from '../../src/agent/llm/fake';
import { buildModel } from '../../src/agent/understand/runner';

const ON = process.env['FITTS_RECORD_UNDERSTAND'] === '1';
const DEMO = resolve(__dirname, '../../../../demo/chat');
const OUT = resolve(__dirname, '../fixtures/llm');

describe('record: understand on demo/chat', () => {
  it.skipIf(!ON)(
    'writes tests/fixtures/llm/understand.json from one real Spark call',
    async () => {
      config({ path: resolve(__dirname, '../../../../.env.local'), quiet: true });
      const key = process.env['META_API_KEY']?.trim();
      expect(key, 'META_API_KEY in .env.local').toBeTruthy();
      const ledger = new CostLedger();
      const caller = new LlmCaller(() => recording(metaClient(key ?? ''), OUT), ledger);
      const built = await buildModel(
        { projectId: 'demo-chat', folder: DEMO, commit: 'fixture', patches: [] },
        {
          online: true,
          caller,
          ctx: { runId: 'run-1', projectId: 'demo-chat', contributor: false, allowed: () => true },
          model: 'muse-spark-1.3',
        },
      );
      const usd = ledger.totals('run-1').spentUsd;
      console.log(
        `\nunderstand: ${built.model.pages.length} pages, ${built.model.journeys.length} journeys, $${usd.toFixed(4)}\n` +
          `summary: ${built.model.summary}\n` +
          `journeys: ${built.model.journeys.map((j) => `${j.name} [${j.priority}]`).join(' · ')}\n` +
          `notes: ${built.model.notes.join(' | ')}\n`,
      );
      expect(built.modeled).toBe(true);
    },
    300_000,
  );
});

// @vitest-environment node
// Records A9's brand check on the real Android screens as fixtures: the planted stock theme and
// the brand theme from PLANTED.md's answer key (tests/fixtures/android/menu-*.png). It spends a
// few cents, so it runs only on purpose:
//   FITTS_RECORD_BRAND=1 pnpm --filter @fitts/desktop exec vitest run tests/agent/record-brand.test.ts
// The key comes from the repo's .env.local and is never printed. `pnpm test` skips it.
import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CostLedger } from '../../src/agent/ledger/ledger';
import { LlmCaller, metaClient } from '../../src/agent/llm/call';
import type { Fixture } from '../../src/agent/llm/fake';
import type { LlmClient } from '../../src/agent/llm/call';
import { brandFit } from '../../src/agent/review/brandfit';

const ON = process.env['FITTS_RECORD_BRAND'] === '1';
const SHOTS = resolve(__dirname, '../fixtures/android');
const OUT = resolve(__dirname, '../fixtures/llm');
const BRIEF = {
  summary:
    'The ordering app for Basil & Ember, our wood-fired pizza place in Maplewood. Warm and rustic, like the restaurant: ember orange, cream and a serif logo.',
};
const TOKENS = [
  'ink',
  'ember',
  'basil',
  'gold',
  'stone',
  'card',
  'cream',
  'muted',
  'display',
  'body',
  'bodyBold',
];

describe('record: the brand check on the Android menu', () => {
  it.skipIf(!ON)(
    'writes brand-fit-stock.json and brand-fit-brand.json from real calls',
    async () => {
      config({ path: resolve(__dirname, '../../../../.env.local'), quiet: true });
      const key = process.env['META_API_KEY']?.trim();
      expect(key, 'META_API_KEY in .env.local').toBeTruthy();
      const ledger = new CostLedger();
      for (const which of ['stock', 'brand'] as const) {
        let saved: Fixture | undefined;
        const real = metaClient(key ?? '');
        const client: LlmClient = {
          async respond(req) {
            const response = await real.respond(req);
            saved = {
              name: 'brand-fit',
              model: req.model,
              recordedAt: new Date().toISOString(),
              response: {
                ...response,
                output: response.output.filter((o) => o.type !== 'reasoning'),
              },
            };
            return response;
          },
        };
        const caller = new LlmCaller(() => client, ledger);
        const shot = readFileSync(join(SHOTS, `menu-${which}.png`)).toString('base64');
        const v = await brandFit(
          caller,
          { runId: 'run-1', projectId: 'demo-android', contributor: false, allowed: () => true },
          'muse-spark-1.3',
          { brief: BRIEF, shots: [shot], tokens: TOKENS },
        );
        console.log(`\n${which}: ${JSON.stringify(v)}\n`);
        if (saved)
          writeFileSync(join(OUT, `brand-fit-${which}.json`), JSON.stringify(saved, null, 2));
      }
      console.log(`spent $${ledger.totals('run-1').spentUsd.toFixed(4)}`);
    },
    300_000,
  );
});

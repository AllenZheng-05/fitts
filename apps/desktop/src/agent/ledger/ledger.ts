// The cost ledger (SPEC-phase2 §11): one entry per model call, rolled up per run into the five
// CostPhase values that Done's cost bar shows, and per finding/change.
import type { CostEvent, CostPhase, CostTask, RunState } from '@fitts/schema';

export const PHASE_OF: Record<CostTask, CostPhase> = {
  interview: 'crawling',
  crawl: 'crawling',
  review: 'reviewers',
  aggregate: 'summing',
  themefit: 'summing',
  fix: 'fixes',
  sam: 'media',
  image: 'media',
  stt: 'media',
  tts: 'media',
};

const round = (n: number) => Math.round(n * 1e6) / 1e6;

export type CostTotals = Pick<RunState['cost'], 'spentUsd' | 'byPhase'>;

export const zeroTotals = (): CostTotals => ({
  spentUsd: 0,
  byPhase: { fixes: 0, reviewers: 0, crawling: 0, summing: 0, media: 0 },
});

export class CostLedger {
  private readonly entries: CostEvent[] = [];
  private readonly listeners = new Set<(e: CostEvent) => void>();

  record(entry: CostEvent): void {
    this.entries.push(entry);
    for (const l of this.listeners) l(entry);
  }

  onEntry(fn: (e: CostEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  forRun(runId: string): CostEvent[] {
    return this.entries.filter((e) => e.runId === runId);
  }

  totals(runId: string): CostTotals {
    const t = zeroTotals();
    for (const e of this.forRun(runId)) {
      t.spentUsd += e.usd;
      t.byPhase[e.phase] += e.usd;
    }
    t.spentUsd = round(t.spentUsd);
    for (const k of Object.keys(t.byPhase) as CostPhase[]) t.byPhase[k] = round(t.byPhase[k]);
    return t;
  }

  /** `costUsd` of a finding or change: the sum of its entries. */
  findingCost(findingId: string): number {
    return round(
      this.entries.filter((e) => e.findingId === findingId).reduce((s, e) => s + e.usd, 0),
    );
  }
}

/** A run's cost as shown: its own (scripted) spend plus what the ledger recorded for it. */
export function withLedger(cost: RunState['cost'], ledger: CostTotals): RunState['cost'] {
  const byPhase = { ...cost.byPhase };
  for (const k of Object.keys(byPhase) as CostPhase[])
    byPhase[k] = round(byPhase[k] + ledger.byPhase[k]);
  return { ...cost, spentUsd: round(cost.spentUsd + ledger.spentUsd), byPhase };
}

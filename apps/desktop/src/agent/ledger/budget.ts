// Budgets (SPEC-phase2 §11): at 80% of the cap, one `budget-warning` card per run (no pause);
// at 100%, the `budget` card pauses the run and new model calls are refused until the cap goes
// up. Raising the cap re-arms the 100% card for the new cap.

export type BudgetAction = 'warn' | 'stop';

/** Spend is a sum of floats; compare with a hair of slack ($0.10 × 0.8 = 0.08000000000000002). */
const EPS = 1e-9;

export class BudgetGuard {
  private readonly warned = new Set<string>();
  /** The cap at which each run was stopped. */
  private readonly stoppedAt = new Map<string, number>();

  /** What to post for a run whose spend is `spent` against `cap`. */
  check(runId: string, spent: number, cap: number): BudgetAction | null {
    if (cap <= 0) return null;
    if (spent >= cap - EPS) {
      if (this.stoppedAt.get(runId) === cap) return null;
      this.stoppedAt.set(runId, cap);
      this.warned.add(runId);
      return 'stop';
    }
    if (spent >= cap * 0.8 - EPS && !this.warned.has(runId)) {
      this.warned.add(runId);
      return 'warn';
    }
    return null;
  }

  /** Model calls are refused while the run is at its cap. */
  allowed(spent: number, cap: number): boolean {
    return cap <= 0 || spent < cap - EPS;
  }
}

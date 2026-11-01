# Phase 4 progress

This log is the working memory for Phase 4. After any context compaction, re-read it, then
CLAUDE.md and the relevant SPEC-phase4 sections, before continuing.

Feature freeze: **Tue Nov 3, 6:00 PM ET (23:00 UTC)**. Schedule and cut order: SPEC-phase4 §13.
Spend cap for this phase: $15 (benches and fixture captures only; tests stay offline).

## Milestones

| #   | Milestone                                          | Status | Commit |
| --- | -------------------------------------------------- | ------ | ------ |
| U0  | Housekeeping (§10)                                 | done   | U0     |
| U1  | Source plugin v2 (§2)                              | done   | U1+U2  |
| U2  | Understand + the understanding card (§3)           | done   | U1+U2  |
| U3  | Owner first + memory (§4)                          | todo   |        |
| U4  | Repro (§5)                                         | todo   |        |
| U5  | Journeys, coverage, device matrix (§6)             | todo   |        |
| U5b | The action log (§6A)                               | todo   |        |
| U5c | Detect more (§6B)                                  | todo   |        |
| U6  | Code-aware fixer (§7)                              | todo   |        |
| U7  | App Map (§8)                                       | todo   |        |
| U8  | Android audit (§9.1–9.3)                           | todo   |        |
| U9  | Android fix (§9.4)                                 | todo   |        |
| U10 | Release polish                                     | todo   |        |

## Current milestone and next step

- **Current:** U3 (owner first + memory).
- **Next step:** plan U3: propose_finish replaces finish, dismiss with a reason, report_issue,
  severity override, project memory (main/store/memory.ts, owner-ok lane), tests.

## Spend

| What | USD |
| ---- | --- |
| U2: record the understand fixture on demo/chat (one Spark call) | 0.03 |

Total so far: **$0.03** of $15.

## Cuts applied

(none yet; each goes here and in docs/ROADMAP.md's last section with its reason)

## Notes for the next context

- Keys for benches are in `.env.local` (never read, log or commit them).
- `pnpm -s` hides typecheck errors; run checks without it. Write edit scripts with Write, not
  heredocs. A `| tail` after `pnpm lint` hides lint's exit code.
- Milestone commits go straight to main.

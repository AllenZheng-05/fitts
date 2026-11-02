# Phase 4 progress

This log is the working memory for Phase 4. After any context compaction, re-read it, then
CLAUDE.md and the relevant SPEC-phase4 sections, before continuing.

Feature freeze: **Tue Nov 3, 6:00 PM ET (23:00 UTC)**. Schedule and cut order: SPEC-phase4 §13.
Spend cap for this phase: $15 (benches and fixture captures only; tests stay offline).

## Milestones

| #   | Milestone                                | Status      | Commit    |
| --- | ---------------------------------------- | ----------- | --------- |
| U0  | Housekeeping (§10)                       | done        | `2c1837c` |
| U1  | Source plugin v2 (§2)                    | done        | `ba8d406` |
| U2  | Understand + the understanding card (§3) | done        | `ba8d406` |
| U3  | Owner first + memory (§4)                | in progress |           |
| U4  | Repro (§5)                               | todo        |           |
| U5  | Journeys, coverage, device matrix (§6)   | todo        |           |
| U5b | The action log (§6A)                     | todo        |           |
| U5c | Detect more (§6B)                        | todo        |           |
| U6  | Code-aware fixer (§7)                    | todo        |           |
| U7  | App Map (§8)                             | todo        |           |
| U8  | Android audit (§9.1–9.3)                 | todo        |           |
| U9  | Android fix (§9.4)                       | todo        |           |
| U10 | Release polish                           | todo        |           |

## Current milestone and next step

**Paused at a checkpoint (Sun Nov 1, 18:07 CST) for Allen's reboot (Windows Hypervisor
Platform).** The working tree holds U3 in progress, uncommitted (31 changed files); the last
green commit is `ba8d406` (U1+U2). On the tree as it stands: typecheck green, lint green except
one react-refresh warning in `DismissMenu.tsx` (the `DISMISS_REASONS` export; move it or ignore
it), and `pnpm test` red exactly where expected: the run tests that waited for `nothing-found`
or `finish` now wait on the `finish-proposal` card (step 1 below).

**U3 done so far (all uncommitted):**

- Schema: `Finding.lane` adds `owner-ok`, `Finding.ownerReason`, `Finding.owner`; `MemoryRule`,
  `ProjectMemory`, `MemoryBridge` (+ IPC `memoryGet/Delete/Clear`); chat item
  `finish-proposal`; `RunEngine.dismissFinding(…, reason?)`; `RunState.journeys?`,
  `RunState.cells?`, `DeviceCell` (for U5; the proposal card reads them).
- Agent: `abilities.ts` (`propose_finish` replaces `finish`, `report_issue`, `Decision.text/why`,
  `Situation.memory`); `decider.ts` tools (+ `why` on every tool); `memory/rules.ts` (rules,
  matching, `applyRules` → owner-ok lane, decider line, reviewer calibration);
  `orchestrator/report.ts` (the owner's words → a finding draft; `docs/prompts/report-issue.md`);
  `run.ts`: `propose()` + `answerProposal()` (finish / fix-rest / continue), `fixesSettled` and
  `crawlComplete` propose instead of finishing (the real run no longer posts `nothing-found`),
  `report_issue`, `dismissFinding(id, reason)` → memory rule, `reopenFinding` forgets the rule,
  `weigh()` for "more/less" via `answerQuestion(findingId, 'more'|'less')`, `applyRules` in
  `review()`, reviewer calibration, tastes from picks/rounds/brief.avoid, the "I remember …" line;
  `agent/index.ts`: `memories` map, `memory` message in, `memoryRule/Forget/Taste` out,
  `reportIssue` dep, dismiss reason passthrough.
- Main: `store/memory.ts` (`MemoryStore`, IPC for Settings), `run-host.ts` (`memory()` out,
  `onMemory` in), `index.ts` wiring, `manager.ts` `onOpen` for every project kind.
- Renderer: `items.tsx` `FinishProposal` card; `FindingPanel` uses `DismissMenu` (a reasons
  menu) + `Weigh` buttons + the reason in the dismissed footer + a "Yours" chip; `review.ts`
  carries reasons through a batch; `ui.ts` `review.reasons`; `DoneLayout` "You said this is
  fine" list; `Settings` › Projects › `Remembers`; `useBackgroundNotifications` notifies on a
  proposal; the mock engine takes a dismiss reason and `more/less`; copy for all of it; prompts
  (`decide.md`, `reviewers/_shared.md`, `converse.md`).

**Also in the tree, uncommitted (Allen's ask, Nov 1):** the GitHub App Client ID
`Iv23liD21TTmPmSLjqPW` and slug `fitts-by-allen` are in `src/main/github/auth.ts`; NEEDS-ALLEN
P4-4 and 4b are marked done. Commit them with U3 (note it in the message).

**U3 still to do (in this order):**

1. `tests/agent/run.test.ts` is already rewritten (a `finished(state, run)` helper answers the
   proposal; `always('propose_finish')`) but NOT yet run. Still to update: `abilities.test.ts`
   (the scripted order ends `propose_finish, propose_finish`; the live-site case too) and
   `decider.test.ts` (tools now carry `why`; `parseDecision` expectations). Then run the three.
2. New unit tests: a hostile decider that only ever returns `propose_finish` or unknown tools
   can't reach `done` without `answerQuestion(…, 'finish')`; `fixesSettled` proposes instead of
   finishing; `report_issue` makes an owner finding (shown, `owner: true`, `who: ['You']`);
   `dismissFinding` with a reason writes a rule and `reopenFinding` forgets it; the owner-ok
   lane is never posted, pinned or offered for fixing (`tests/agent/memory.test.ts` has the
   rule tests already).
3. E2E updates: `site-live.spec.ts` coverage test (poll for `waitingFor === 'finish-proposal'`
   instead of `nothing-found`/"All done", click **Finish**, expect Done; "Keep going" returns
   to acting and a new proposal follows); `finding-gate.spec.ts` ("Not a problem" opens the
   menu: click "Intentional", expect "Noted: intentional…", then "It is a problem" reopens; the
   batch test picks a reason too); `chat.bench.ts` poll adds `waitingFor === 'finish-proposal'`;
   a Settings "What Fitts remembers" check if cheap.
4. Fix the react-refresh warning (move `DISMISS_REASONS` out of the component file or inline).
5. DECISIONS "Phase 4 — U3" section; commit "Phase 4 U3: owner first and memory".

Then U4 (repro). Rule learned on U1/U2: while a milestone's full e2e runs, write only new
files; shared-file edits wait for the commit.

## Spend

| What                                                            | USD  |
| --------------------------------------------------------------- | ---- |
| U2: record the understand fixture on demo/chat (one Spark call) | 0.03 |

Total so far: **$0.03** of $15.

## Cuts applied

(none yet; each goes here and in docs/ROADMAP.md's last section with its reason)

## Notes for the next context

- **Muse Code (Allen, Nov 1):** 1.4.14 in WSL is installed and has `--api-key-stdin` (no login).
  It also has `--disable-web-tools`, `--disable-request-user-input`, `--no-session-log` (use all
  three on every Fitts `muse exec`), `--output-schema <file>` (use it for Understand's
  app-model.json), and `--worktree existing --worktree-existing <path>` (use them instead of cd
  when they fit the run worktree better). Log the choices in DECISIONS (U6, and U2's Muse path).

- Keys for benches are in `.env.local` (never read, log or commit them).
- `pnpm -s` hides typecheck errors; run checks without it. Write edit scripts with Write, not
  heredocs. A `| tail` after `pnpm lint` hides lint's exit code. Run `pnpm lint` from the repo
  root (from apps/desktop it says "lint not found").
- `cross-env … electron-vite build` from apps/desktop needs `npx cross-env`; check
  `out/main/agent.js`'s timestamp after a build you depend on.
- Full e2e takes about 9 minutes; the demo/chat crawl spec alone about 1.6 minutes.
- Milestone commits go straight to main.
- The recorded Pass 2 fixture: `apps/desktop/tests/fixtures/llm/understand.json`; recorder:
  `FITTS_RECORD_UNDERSTAND=1 pnpm --filter @fitts/desktop exec vitest run tests/agent/record-understand.test.ts`.

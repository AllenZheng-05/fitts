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
| U3  | Owner first + memory (§4)                | done        | `bad28a3` |
| U4  | Repro (§5)                               | done        | `4105a5a` |
| U5  | Journeys, coverage, device matrix (§6)   | done        | see git   |
| U5b | The action log (§6A)                     | todo        |           |
| U5c | Detect more (§6B)                        | todo        |           |
| U6  | Code-aware fixer (§7)                    | todo        |           |
| U7  | App Map (§8)                             | todo        |           |
| U8  | Android audit (§9.1–9.3)                 | todo        |           |
| U9  | Android fix (§9.4)                       | todo        |           |
| U10 | Release polish                           | todo        |           |

## Current milestone and next step

**U5 (journeys, coverage, device matrix; §6): built; the crawl e2e passes; the full e2e and
unit suites are running for the commit.** Everything in the
plan below is in the tree: matrix + journeys (new files), the three scripts' shared edits
(schema/probes/protocol/site/manager, abilities/decider/prompt/coverage/probes/aggregate/run/
index/copy, renderer/demo/bench/check/e2e). Typecheck and lint green; unit and the demo/chat
e2e were running at the last note. Then: DECISIONS U5 is written; commit "Phase 4 U5: journeys,
coverage and the device matrix"; next U5b (the action log, §6A).

## U5 plan (journeys, coverage, device matrix; §6)

Order of work, each step a new file where possible, shared edits applied together:

1. **Schema/events**: `RunState.coverage?` (§6.2 shape), `Journey` statuses already in
   `RunState.journeys`; events `journey.updated` and `coverage.changed` (or `run.patch`).
   `ProbeName` + `text-spacing`, `resize-text`, `orientation`; templates in aggregate;
   standards rows (1.4.12, 1.4.4, 1.3.4) already in the table.
2. **Matrix** (`agent/devices/matrix.ts`, pure): cells from detected breakpoints + model
   breakpoints/media; the seven rules, cap 10, dedupe within 8px. Unit tests.
3. **Site ops**: `cell` op (width/height/mobile/touch + zoom via `setZoomFactor`, text-spacing
   via `insertCSS`/`removeInsertedCSS`, `Emulation.setEmulatedMedia` for scheme/motion) and
   `breakpoints` op (same-origin `document.styleSheets` media widths + scheme/motion rules) in
   site-window/manager/protocol/site-client. Replayer takes a cell too.
4. **device_pass** replaces `phone_pass` in abilities (keep `phone_pass` name as alias? No:
   rename; update scripted order, decider tools, tests). Per cell: every reached page gets
   overflow/clipped/target-size/contrast; shots only for journey finals, finding pages, phone.
   `Finding.seenOn` = cell id; device menu lists the run's cells.
5. **Coverage from code**: seed `Coverage` with the model's static routes
   (`discover(route, 'code')`), dynamic → "needs data", `unreached` reasons, `unlinked`
   as a reviewer note. `RunState.coverage` synced in `syncCoverage()`.
6. **Journeys** (`agent/crawler/journey.ts`): one Spark call per step with the screenshot
   (`task: 'journey'`, reasoning low), tools click/type/navigate/back/goal_met/blocked, max 15;
   form rules from the model (valid once, invalid once per form); reuses `perform`. Ability
   `journey` with the decider running P1 → P2 → explore → P3. Fixture-recorded for e2e
   (demo/chat), FakeLlm in unit tests. Failed journeys → reviewer evidence.
7. **Saved test login** (§6.2) is cut #10 if time is short (the card keeps "coming").
8. **Planted #26**: a 320px overflow on demo/chat (a fixed-width element, e.g. the settings
   list or inbox header at `min-width: 360px`), PLANTED.md row, check script; e2e finds it in
   the reflow cell.

## Spend

| What                                                            | USD  |
| --------------------------------------------------------------- | ---- |
| U2: record the understand fixture on demo/chat (one Spark call) | 0.03 |

Total so far: **$0.03** of $15.

## Cuts applied

- U4: ddmin (§13 #6). Pruned steps once, full trail once; no halving. In ROADMAP.

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
- Full e2e takes about 10 minutes; the demo/chat crawl spec alone about 3 minutes since U5 (the
  device pass adds a minute).
- Mobile emulation grows `window.innerWidth` to the content width: measure overflow against
  `visualViewport.width` (U5 lesson). A quick Electron probe script in the scratchpad
  (`probe-320.cjs`, load about:blank before attaching the debugger) is the fastest way to see
  what a cell sees.
- U5b's files are parked in the scratchpad's `u5b-hold/` (record.ts, log.test.ts) until U5 is
  committed; move them back to `apps/desktop/src/agent/log/` and `tests/agent/`.
- Milestone commits go straight to main.
- The recorded Pass 2 fixture: `apps/desktop/tests/fixtures/llm/understand.json`; recorder:
  `FITTS_RECORD_UNDERSTAND=1 pnpm --filter @fitts/desktop exec vitest run tests/agent/record-understand.test.ts`.

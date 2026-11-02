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
| U4b | ddmin for repros (§5.2 step 3)           | done        | `c16b554` |
| U5  | Journeys, coverage, device matrix (§6)   | done        | `bb5c828` |
| U5a | Models unreachable: pause (§6C, added)   | done        | `1f18153` |
| U5b | The action log (§6A)                     | done        | `7bc4565` |
| U5c | Detect more (§6B)                        | done        | see git   |
| U6  | Code-aware fixer (§7)                    | in progress |           |
| U7  | App Map (§8)                             | todo        |           |
| U8  | Android audit (§9.1–9.3)                 | todo        |           |
| U9  | Android fix (§9.4)                       | todo        |           |
| U10 | Release polish                           | todo        |           |

## Current milestone and next step

**U6 (code-aware fixer, §7) in progress.** U5c is committed. New U6 files so far: main/fix/allowlist.ts, main/fix/muse.ts, agent/fix/outline.ts, agent/fix/groups.ts (+ tests). Next: wire them (fix-host scope/grant/muse, run-host owner answers, fixer tools and task context, device and trace verification, Checked by review, root-cause groups on the approval card). The paid bench:chat (≤ $2) for U5c recall is still to run.

Lessons: an edit script's "skip if already applied" guard must not be `includes(b)`; insertions
keep their anchor, so a rerun applies them again (revert and apply once instead). TaskStop on a
background e2e can leave its Playwright child running: kill electron.exe before starting
another, or two runs share the demo server and fail each other.

## U5c plan (detect more; §6B)

Never cut here: full axe, keyboard checks, state shots, navigation checks, the deterministic
surprise detector. Cut first if behind (in §13 order): the production build in perf_pass (#3),
the Wonder judge and SAM frames (#4), state_pass's empty and slow cases (#7).

1. **axe** (§6B.1): `page.ts` second axe pass with the WCAG/best-practice tags minus the three
   owned rules; `ProbeName 'axe'` items carry rule id, help, helpUrl, tags, impact; template
   and severity from impact; standards from tags (already in standards.ts `axeStandards`);
   VERIFIABLE gains 'axe'. Planted #27 (avatar alt), #28 (search label).
2. **keyboard** (§6B.2): extend `focusSweep` to record the stop sequence with rects (up to
   200); pure analysis in `packages/probes` (unreached, stuck, hidden, order, skip link);
   dialog checks when a dialog opens. Planted #29's keyboard part.
3. **states** (§6B.3): `agent/crawler/states.ts` state keys; probes + shot per new state;
   RouteEvidence.states; reviewers see up to 5 extra states per route (cap 40/20).
4. **navigation** (§6B.4): expected destination from href / App Model static targets; redirect
   chains (U5b already records hops); Back after redirect; refresh each route at the end of
   check_links; soft 404. Planted #31, #32.
5. **surprise** (§6B.5): isolated-world detector (popped up, jumped, moved before tap, focus
   moved, scrolled, vanished fast, autoplay) feeding observations and probe findings. Judge
   (Wonder) and SAM frames likely cut (#4). Planted #29, #30.
6. **state_pass** (§6B.6): Fetch interception of up to 6 GET endpoints: error first (never
   cut), then empty and slow. Planted #33.
7. **perf_pass** (§6B.7): throttled phone cell on the dev server labeled "dev build" (the
   production build is cut #3 unless time).
8. PLANTED.md/check script/bench list to 33; bench recall over 33 ≥ 80% (one paid bench run).

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

- U5c: the production build in perf_pass (§13 #3). In ROADMAP.
- U5c: the Wonder judge and SAM frames (§13 #4). In ROADMAP.
- (ddmin was cut in U4 and put back in U4b at Allen's request, Nov 2.)

## Notes for the next context

- **demo/android-chat (Allen, Nov 2), for U8:** make it look and feel like a believable real product, not a demo: e.g. a team chat app (or a clinic booking app) with realistic names, content and branding. Plant issues real apps actually ship (an unlabeled icon button, a 36 dp target, low-contrast secondary text, a missing loading state, a delete with no confirmation, an inconsistent label), not obvious ones like "(null)" or "Error 0x3F". Keep PLANTED.md and the bench as SPEC §9 specifies.
- **Android (Allen, Nov 1), for U8:** the emulator is set up and verified. The Fitts_Pixel AVD (API 37, x86_64, 4 GB) runs on WHPX and adb sees it as emulator-5554. ANDROID_HOME and JAVA_HOME are set and the SDK licenses are accepted. A create-expo-app@latest smoke app (C:/Users/Plasm/code/expo-smoke: expo ~58.0.22, react 19.3.0, react-native 0.88.1) built with `npx expo run:android` (Gradle 9.4.1, NDK 27.1, build tools 36/37, compileSdk 37, targetSdk 36) and ran as a development build with Metro on localhost:8081. demo/android-chat uses the same Expo SDK and a development build (expo-dev-client), not Expo Go. Allen will have the emulator running at U8, so the U8 bench runs on the real emulator, not only fake adb.

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
- Milestone commits go straight to main.
- The recorded Pass 2 fixture: `apps/desktop/tests/fixtures/llm/understand.json`; recorder:
  `FITTS_RECORD_UNDERSTAND=1 pnpm --filter @fitts/desktop exec vitest run tests/agent/record-understand.test.ts`.

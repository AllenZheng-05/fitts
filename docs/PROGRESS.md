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
| U5c | Detect more (§6B)                        | done        | `4650f2b` |
| U6  | Code-aware fixer (§7)                    | done        |           |
| U7  | App Map (§8)                             | done        |           |
| U8  | Android audit (§9.1–9.3)                 | done        |           |
| U9  | Android fix (§9.4)                       | done        |           |
| U10 | Release polish                           | todo        |           |

## Current milestone and next step

**Done since U6:** Muse Code by default; navigation and keyboard verifiable; the paid bench:chat runs (numbers below); the Muse Wonder judge (§13 #4); U7 the App Map; U8 the Android audit, with A9's detection and A10; U9 Android fixes (Nov 2).

**U9 (Nov 2):** `BENCH_ANDROID_FIX=1 pnpm bench:android` passed on the fifth paid run:
  - Audit: 6/10 planted issues.
  - Fixes: 3 of 3 verified on fitts/run-run-1:
    - The brand fix (A9), checked by review, with 12/12 color tokens close to PLANTED.md's answer key and the same font families.
    - The cart button's label (A1).
    - The overlapping row and favorite controls (A7).
  - Spent $2.65 (cap $6; each Muse Code pass is about $0.40–1.10, now that its usage is counted).
  - The first four runs failed on plumbing, fixed in U9 (DECISIONS "Phase 4 — U9"):
    - Muse rewrote the worktree's git link to /mnt paths, so commits failed.
    - The crawl started mid-reload.
    - Muse's usage and final answers were never read.
    - The $2 cap.
  - Allen's change (Nov 2): an Android app's fixed version shows as its web build at phone width, marked as an imitation. The emulator stays on the live app. demo/basil-ember-android got a web build for it (`bd9f313`).

**U10 step 1 (Nov 2, 20:30 CST):** bench:android with `BENCH_ANDROID_FIX=1`, the answer keys
hidden and journeys on the model:
- **8/10** planted issues found (A5 and A6 missed), with 6 unplanted findings at severity ≥ 2.
- 3 of 3 fixes verified. The brand fix scored 12/12 colors close to the key without seeing it.
- Cost: $2.10 for the audit, $4.23 in all.
- The order journey placed an order and reached the order status screen, so A8 was found.
- A5 was missed because "Cancel order" wasn't treated as destructive. That's fixed in `5248cb8`
  but not re-run yet (one paid run at a time).
- The emulator "after" switch fell back ("dev-client") and is off. The web imitation is the
  "after".

**U10 step 2, bench:chat (not green).** The number for the README, the site and the video is
one run: **run 4, Nov 2 22:00 CST** (`2026-11-03T04:00:19Z`, commit `fa98f3c`, Economy,
contributor pricing, answer key hidden, $0.14):
- **Recall 27/33 (82%):** S1 18/19, S2 9/14.
- **Precision 66% strict (27/41), 84% at severity ≥ 2 (27/32).**
- **5 unplanted findings at severity ≥ 2,** over the bar of 2. The bench fails on that line.

The four runs that night (one per round of fixes), each its own result:

| Run | Recall | Unplanted at sev ≥ 2 | Cost |
|---|---|---|---|
| 1 (`5248cb8`) | 27/33 | 9 | $0.27 |
| 2 (`6cd00fe`) | 27/33 | 11 | $0.25 |
| 3 (`34da49b`) | 28/33 | 7 | $0.14 |
| 4 (`fa98f3c`) | 27/33 | 5 | $0.14 |

What's left in run 4's five:
- 200% text cutting off the Send button: planted #7's fixed size.
- A text-spacing overlap on /compose that isn't traced yet.
- A reviewer's "empty inbox" opinion.
- Two taps logged "nothing changed on screen" (Grandma on /contacts, a search result) that
  navigate correctly in a browser. That's a Fitts measurement bug, not found yet.

**The earlier numbers below were scored by a matcher that was too generous.** It read the
finding's evidence, which paired findings with the wrong issues. Re-scoring the 06:55 run with
the strict matcher gives 26/33, not 29/33. Read them as history, not results.

**Next:** U10 steps 3–8 (p9.bench, README, spend, release, Muse label), then Allen's
added work below.

**Status across sessions (Allen, Nov 2 evening):**
- **Pushed:** `main` through `fb5873a` (the CI fixture fix). fitts.allenzheng.com is live on
  Cloudflare Pages from `main`. Both Basil & Ember repos are on GitHub with their wiring.
- **The site session** (worktree `C:/Users/Plasm/Projects/fitts-site`): the redesign is done on
  `site-redesign` (7 commits). `evidence` (off it) adds packages/run-report and /runs/ (the run
  report viewable in the browser; written, not yet committed), then the open-source runs
  (Allen picked Bootstrap's examples and TodoMVC's React app) and the README for judges on
  Wednesday. Allen merges after U10.
- **The held-out app:** https://github.com/AllenZheng-05/heldout-app (Loopline Bikes,
  `8c193cf`, port 5180), built by a separate session that never saw Fitts. 16 planted (8 S1,
  8 S2) and 3 traps. The key is sealed outside the repo
  (SHA-256 `61376c3a5dc6ec4dd8c6b097d35dac7231e425affbda8c8bb4d39f510ab33469`). Run Fitts
  Economy and the axe-only arm blind; never open `../heldout-key` until Allen says.
- **Baseline comparison:** pre-registered in `docs/bench/PLAN.md` (uncommitted); budget $25;
  results go in `docs/bench/RESULTS.md`, one run per row.
- **Replay:** the keyless replay was removed earlier and isn't coming back; the site's /runs/
  replaces it for judges.
- **The emulator "after" switch:** one more paid run, then stop if it still fails and keep the
  web imitation; the video switches branches by hand.
- **One paid Fitts run at a time:** the machine is short on memory (background shells were
  killed twice on Nov 2).

  Still owed: p9.bench (U6, on purpose).
  **p9.bench, Nov 3 (build of 4566b16, in-process fixer):** failed by its 55-minute wait. 16 fixes queued: 13 fixed and verified on the run branch (each with Undo), the redesign rolled back ("I got stuck going over the same code"), and 3 still in progress at the deadline (one being checked: "Page scrolls sideways on small screens"). One gate, no repeat taps after "Don't do it". The retry, undo and revert-PR steps were not reached. $0.30. Bench timing, not a fix failure: each fix is verified by a recrawl, about 3 minutes apiece.
  **Baseline comparison (docs/bench/RESULTS.md), demo/chat:** axe alone: 4/33 (S1 4, S2 0) · Fitts probes only: 25/33 (S1 18, S2 7) · Fitts Economy: 28/33 (S1 19, S2 9), $0.16 · Quality 28/33, $1.8 · Open 26–27/33, $1.5 · Economy without the judge 28/33. $8.41 spent.

**Spend (Allen, Nov 2):** Allen has $129 of free Meta credits, so paid runs and paid tests are fine when they give real evidence (the original $15 cap is superseded). **Phase 4 spend, corrected (U10 step 6):** **$28.86 recorded** in `.fitts-dev/agent-spend.ndjson` from U0 (Nov 1, 16:59 CST) through Nov 2, 22:02 CST: muse-wonder-1.0 $17.47, muse-spark-1.3 $11.09 (contributor $0.51 of it), SAM $0.30. That's a floor: **Muse Code's own runs before 12:37 CST Nov 2 weren't recorded.** Fitts didn't read Muse's usage until then (fixed in U9). Those runs include U6–U9's fixes, four bench:android fix phases and every Understand second pass. Meta's billing page has the exact figure. p9.bench, the baseline comparison and the held-out runs come after this. Plan: the judge, then the bench noise fixes, one paid bench for both, then p9.bench.

**bench:chat, Nov 2 03:57 (paid, alone, Economy, contributor pricing, $2 cap): spent $0.076.** Recall **30/33 (91%)**, missing #15 (a validation error clears the whole form), #18 (three date formats) and #33 (Contacts goes blank when its request fails). Shown 57, plus 5 suggestions. Precision: 30 of 57 shown are planted (**53%** strict). Counting only severity ≥ 2, 30 of 44 (**68%**): 14 unplanted findings at severity ≥ 2, over the bench's bar of 2, so the test fails on that line. The 14:
  - 4 on /help, the planted broken link's 404 page: no lang, landmarks, and sideways scroll counted twice. That page shouldn't be audited as a page.
  - 2 duplicates of one /settings phone tap target.
  - 3 from the U5 cells: 200% text on /compose/confirm, text spacing on /compose/recipient, landscape on /search.
  - 4 reviewer or state findings on /compose and /settings/privacy: a failed request breaks /compose, no loading sign, empty contacts with no guidance, Privacy is a dead end. These are plausibly real but unplanted.

  The first two groups (6) are Fitts noise worth fixing.

**bench:android, Nov 2 ~13:00 CST (paid, Fitts_Pixel, Economy, $2 cap): spent $1.07.** Found **6/10** (passes U8's ≥ 6): A1, A2, A3, A7, A9 ("Doesn't match your brand", Brand check) and A10 ("Menu jumps after loading", **judged**, with the moment's frames). Missed A4 (found in the run before, on the menu's quick-add), A5 and A8 (the order status screen wasn't reached: it needs an order placed), and A6. 5 unplanted at severity ≥ 2, mostly plausible: duplicate +/− names, a text field with a content description, no back or cancel on checkout, size options with no feedback, empty orders with no shortcut. The earlier runs that day found 0, 0, 3 and 4 while the Android bugs were being fixed.

**bench:chat, Nov 2 ~06:55 (paid; judge committed, routing fixes in): spent $0.193.** Recall **29/33 (88%)**, missing #15, #18, #21 (14 ungrouped toggles) and #33. Shown 48. Precision: 29/48 (**60%** strict). At severity ≥ 2, 29/37 (**78%**): 8 unplanted. Two of the 8 are the judge's own findings for #29 and #30, duplicates of the probe findings that matched them, so the judge's draft now joins the probe finding for the same moment. The rest are the U5 cells (3), the /settings phone tap target, and two plausible /compose state findings.

**bench:chat, Nov 2 ~04:35 (paid; judge and noise fixes in; recorded fixtures): spent $0.135.** Recall **27/33 (82%)**. Missed #15, #16 (Delete conversation deletes instantly), #18, #25 (no empty state on Contacts), #29 and #33. Shown 48. Precision: 27/48 (**56%** strict). At severity ≥ 2, 27/37 (**73%**): 10 unplanted. The noise fixes worked (no /help findings, one phone tap finding). The judge judged #30 correctly ("a tip box appears above the Send Text link and pushes it 58px down") but filed it under / instead of /compose/confirm, so it counted as a false positive. #29 never showed during the audit: the sheet shows once a session and appeared during the interview. Both are fixed since (events carry their page; the detector is read before the audit's first load). One run varies: #16 and #25 were found in the run before. Next paid run after the judge commit.

**A10 and the Wonder judge on Android (Allen, Nov 2), inside U8, after A9's detection, before U9; it comes before U9 if the freeze is at risk (say so here):**
1. **Plant (own commit):**
   - A "Tonight's special" banner (`menu-special-banner`) on Menu, about 1.2 s after the screen
     opens: a timer, no network.
   - Inserted above the list with no reserved space, so every row jumps about 96 dp.
   - Shown on every visit to Menu.
   - A1–A9 keep measuring the same (A7's overlap, A3's contrast).
   - A10 row in PLANTED.md: content jumps after load, so a tap meant for one pizza lands on
     another; Menu; the Android surprise check plus the judge; severity 2.
   - bench:android counts it.
2. **Android surprise (main/android), from the dumps and shots the audit takes:**
   - "jumped": the same element (testID or resource-id) moves more than 24 dp with no input in
     between, or within 1 s of load.
   - "popped up": a new dialog, sheet or overlay appears with no input for 1 s.
   - The same observation kinds and Noticed lines as the web, under the Android screen.
3. **Frames:**
   - A rolling buffer of screencaps on a screen, about 2–4 a second, capped at 4 s.
   - Up to 8 frames around an event, saved as assets. If the buffer is thin, a before shot plus
     shots at about 0.5, 1.5 and 3 s.
   - No new dependencies.
   - SAM on the first and last frames, with the dump's bounds as the box (and the fallback).
   - The same Wonder call, prompt and rules: 12 per run counted together with the web's, the
     U5a wait, an unreadable answer stays a note, the ledger, the Judge draft joins a probe
     finding for the same element, the See it yourself strip, fixes "Checked by review".
4. **Tests:**
   - The dump-diff detector on fixture dumps: a jump, a pop-up, and a normal tap's response
     that isn't flagged.
   - The frame buffer and its fallback over a fake adb.
   - A recorded judge fixture for A10 in the offline e2e.
   - bench:android finds A10, judged.

Log as "Phase 4: A10 and the Wonder judge on Android". Never call the Android app AI-generated.

**A9, brand drift on the Android demo (Allen, Nov 2), folded into U8 and U9; doesn't interrupt U7:**
1. **Plant (U8), as its own commit after the "as built" commit.**
   - First copy src/lib/theme.ts's brand tokens (ember, basil, gold, cream, ink; Fraunces and
     DM Sans) into PLANTED.md as the answer key.
   - Then theme.ts goes to a stock look: Material 3 baseline, primary #6750A4 and its neutrals,
     and the system sans for every font token. No screen changes.
   - The name, header wordmark, app.json icon and splash colors, photos and copy stay Basil &
     Ember. If the wordmark reads theme.ts, it gets its own brand colors.
   - A1–A8 stay detectable. A3 stays under 3:1 before and after the fix; if the stock palette
     breaks it, adjust and note it in PLANTED.md.
   - Add the A9 row: the in-app theme ignores the brand the logo, splash and photos carry;
     every screen; the theme check plus the reviewers; severity 2. bench:android counts it.
2. **Find (U8).** themefit.ts and check_theme run on the Android phone screenshots.
   - The reference is the brief plus the brand cues in the shots.
   - Not fitting → one finding, "Doesn't match your brand", saying what's on and off brand,
     with the shot evidence and the suspect tokens.
   - No redesign-directions card on Android.
   - Same guards: enough screens first, the U5a pause, cost to the ledger.
3. **Fix (U9), on the owner's ask only.**
   - Scope: theme.ts, plus the wordmark file if touched. No packages.
   - Restore the colors and fonts from the cues and the brief.
   - Reload on the emulator; before and after shots of the same screens for See it yourself.
   - "Checked by review"; goes into the run's one PR.
   - The bench compares with the answer key: close on color, same font families.
4. **Tests:**
   - themefit on a recorded Android screenshot fixture flags A9, and not the fixed theme.
   - The fixer's scope stays inside the theme file.
   - bench:android counts A9.
   - The recorded e2e has the A9 finding and its fix.
5. **If the freeze is at risk,** keep 1 and 2 (U8), drop 3 with U9, and say so here (the video
   has a fallback).

Log as "Phase 4: A9 brand drift on Android".

 (1) Muse Code by default: the fixer whenever museStatus is ready, and Understand Pass 2 the same way; in-process (Spark) is the automatic fallback; FITTS_FIXER=inprocess forces the old path. (2) Right after U6 commits, before U7: navigation and keyboard findings verifiable on the worktree (navigation: fresh load + reload, the made-up address for soft 404, the click and its expected destination; keyboard: the same Tab sweep plus dialog checks); add both to VERIFIABLE with tests; surprise and perf stay "Checked by review". (3) The paid bench:chat (≤ $2) right after; record recall and precision here. (3b, Allen's change of priority) Then, before U7: restore §13 #4, the Wonder judge with SAM frames, as §6B.5 says: a frame ring buffer in main (~8 fps, 4 s), 2 s before and after each popped-up/jumped/scrolled event saved as an asset (≤ 8 JPEGs); one muse-wonder-1.0 call per event (task review, reasoning low; docs/prompts/judge-surprise.md; {expected, why, severity, heuristic}); unexpected → a finding draft citing the event, counting as one reviewer; cap 12 per run, first-load banners once per site; respects U5a (unusable → a note). SAM 3.1 outlines the element in the first and last frames (DOM box fallback); a before/after strip in See it yourself; the Noticed line links to the judge's finding; fixes stay Checked by review unless a detector replay on the worktree is cheap; cost to the ledger (media for SAM, reviewers for Wonder). Tests: a recorded judge fixture, the ring buffer and window, the cap, the U5a pause, an unusable answer; demo/chat #29 and #30 judged in the e2e. Off ROADMAP's cut list; DECISIONS "Phase 4 — the Muse Wonder judge (restored)"; its own commit. If the freeze is at risk, cut U9 before this, and tell Allen. (4) After U10, if time allows before the freeze: (a) state_pass findings verifiable (replay the same Fetch fault); (b) moved up to 3b; (c) restore §13 #3, the production build in perf_pass, with INP and SPA page-change timing. Take each off ROADMAP's cut list when restored and log it in DECISIONS. Anything still not built at the freeze (saved test logins, V8 coverage) goes on ROADMAP's cut list with why.

Lessons: an edit script's "skip if already applied" guard must not be `includes(b)`; insertions
keep their anchor, so a rerun applies them again (revert and apply once instead). TaskStop on a
background e2e can leave its Playwright child running: kill electron.exe before starting
another, or two runs share the demo server and fail each other. Also free the demo port (taskkill /T on its listener) before restarting a bench: a new run reuses an orphaned dev server, and stopping the old task later kills it mid-run (Nov 2, bench:chat). The bench answers a held gate with "Don't do it" and fails fast on the site-down card.

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
| U5c: bench:chat started and stopped mid-crawl (see the note)    | 0.003 |

Total so far: **$0.033** of $15.

## Cuts applied

- U5c: the production build in perf_pass (§13 #3). In ROADMAP.
- U7: the App Map drawer's per-page speed and state screenshots (§8.3); "Checked at" lists every cell, not the cells that visited the page. In ROADMAP.
- U5c: the Wonder judge and SAM frames (§13 #4): restored Nov 2 at Allen's request (off ROADMAP).
- (ddmin was cut in U4 and put back in U4b at Allen's request, Nov 2.)

## Notes for the next context

- **`pnpm bench:chat` runs every file in tests/bench (9 benches, several paid)**, not just
  demo/chat's. Run one bench on purpose: from apps/desktop, after a build,
  `npx playwright test -c playwright.bench.config.ts tests/bench/chat.bench.ts`. The U5c recall
  bench is still to run that way.
- **demo/basil-ember** (Allen, Nov 2) is in: `70d80f2` untouched import, `b105a37` wiring (dev
  port 5176, one-file plugin). No planted issues, not in the bench. Add the Android app (U8) to
  `scripts/demo-mirror.mjs` the same way once it exists.
- **Android demo (Allen, Nov 2, replaces the team-chat note), for U8:** the Android app is Basil & Ember's ordering app in `demo/basil-ember-android` (U8 hadn't started, so it's named that from the start). It matches the website's branding (name, colors, fonts, menu, address) and has these screens: menu, item (sizes and toppings), cart, pickup checkout and order status. Its 8 planted issues, the answer key in PLANTED.md for `bench:android`: an icon-only cart button with no label; a 36 dp Remove; low-contrast descriptions; no "Added to cart" feedback; a Cancel order with no confirmation (a DELETE, so the gate fires); "Add to cart" vs "Add to order"; two clickables with identical bounds; "Ready around undefined". It was built in one quick pass from one written spec (its `prompt.md`); its issues are planted, and it is never called AI-generated (Allen, Nov 2). Its prompt.md stays as it is, "Generated from this prompt" heading included (Allen, Nov 2). Add it to scripts/demo-mirror.mjs like basil-ember. Built Nov 2 (untracked until U8): it was never installed or type-checked, and C:/Users/Plasm/code/expo-smoke no longer exists, so versions beyond expo ~58.0.22, react 19.3.0 and react-native 0.88.1 are guesses. At U8, first commit it as generated, then in the wiring commit: `npx expo install --fix`, typecheck, and mark the A1 badge `importantForAccessibility="no-hide-descendants"` (TalkBack may otherwise read the count as the button name).
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

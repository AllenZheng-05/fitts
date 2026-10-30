# Phase 2 progress

This log is the working memory for Phase 2. After any context compaction, re-read it, then
CLAUDE.md and the relevant SPEC-phase2 sections, before continuing.

## Current milestone and next step

- **Current:** P7 — the real interview and theme-fit (§6.2, §8.3). Acceptance: the real
  interview fills the brief (For and Who from the first answer on demo/chat); on demo/hartwell,
  theme-fit returns `fits: false` with 3 directions.
- **Next concrete step:** `docs/prompts/interview.md` (Fitts's voice rules embedded) and an
  `agent/interview/` module behind `startInterview` and `sendMessage` while the phase is
  interview. Replace the stub interview for live projects. Use structured output to fill brief
  fields, and record its fixtures once with Spark contributor.

## Done

| Milestone | Commit | Acceptance |
|---|---|---|
| Step 0: tag `phase1-prototype`, Phase 2 CLAUDE.md, progress log | 6bfad23 | done |
| P6: reviewers, aggregator, evidence check, suggestions lane | see `git log --grep "P6:"` | `pnpm bench:chat` (real panel, Economy plus contributor, about $0.026 a run): recall 20/25 (80%), 2 false positives at severity ≥2, on two runs. Offline (probes only): 18/25 and 0. The aggregator, evidence check and rubric are unit-tested (`tests/agent/review.test.ts`), and the scorer too (`tests/bench/score.test.ts`). |
| P5: deterministic probes | see `git log --grep "P5:"` | All 18 probe-detectable planted issues on demo/chat are caught by their probe in the live crawl (e2e reads `probe.result` from the run log). Each in-page probe passes and fails on fixture pages in real Chromium (`tests/e2e/probes.spec.ts`). The analyses are unit-tested (`packages/probes/tests`, `tests/agent/probes.test.ts`). |
| P4: crawler + coverage gate + run controls + edge-state triggers | see `git log --grep "P4:"` | The real crawl (explorer brain, offline) reaches all 8 Phase 1 demo/chat routes (plus /help) and tries or skips every primary control, over 30 of them (e2e). Take the wheel stops stepping (e2e and unit). ⌘. aborts the model call in flight (unit). site-down, login-wall, api-trouble and budget fire from real conditions (unit, `tests/agent/run.test.ts`). |
| P3: LLM client, ledger, router, budgets | see `git log --grep "P3:"` | one Spark, one Wonder and one Baseten call each in the ledger (script and in-app); cost events live; the 80% and 100% cards fire with a $0.10 cap (e2e). 117 e2e pass. |
| P2: live site view, CDP queries, detection, dev-server spawner | see `git log --grep "P2:"` | demo/chat streams live in the workspace; overlays align on the canvas (pin within 16px); the Finding panel and gate draw over it (DOM over canvas); the user drives during the interview and after Take the wheel; point returns a real ref; rewind shows stored step shots. 116 e2e pass. |
| P1: events, reducer, IpcRunEngine, agent process, stores, secrets | see `git log --grep "P1:"` | Phase 1 UI runs unchanged on IpcRunEngine with the stub agent; all 113 e2e pass (Scenario panel specs on MockRunEngine); `replay(diff)` is exact over every mock scenario; runs are logged to events.ndjson; projects are files; keys go through safeStorage. |
| P0: demo targets + vite plugin | see `git log --grep "P0:"` | demo/chat 25/25 planted issues reproduce (`pnpm check:demo-chat`); hartwell runs on :3000; the plugin stamps in dev only (unit tests, and a build has no stamps). Mirror repos are exported locally; creating and pushing them is NEEDS-ALLEN 3. |
| V1–V9 verification (`scripts/verify/`) | 290cf81 | V1, V2, V3, V4, V5, V7 and V9 pass live. V6 passes offline (`pnpm verify:v6:echo`); the real-model run waits on `muse login` (NEEDS-ALLEN 1). V8: the flag is confirmed, and the live upload is deferred. |

## Deferred to Allen

See [NEEDS-ALLEN.md](NEEDS-ALLEN.md).

## Spend so far (USD)

About $0.13 of the $25 session cap: `.fitts-dev/spend.json` (scripts) plus `.fitts-dev/agent-spend.ndjson` (the app's own calls, including `bench:chat`).

## Known issues

- Until P9 adds fixes, the Run summary's math line counts every open finding as one of the
  "suggestions without enough evidence" (Phase 1's meaning of open). P9 should count shown,
  unfixed findings separately from the suggestion lane.

- P6 meets the bench bar with no margin (20/25, exactly 2 false positives). Reviewer variance
  decides which plausible unplanted issue shows up. The deferred Wonder aggregator pass, or
  better prompts for #6, #18 and #25, would add margin.

- `muse` in WSL isn't logged in. Fixes use the in-process Wonder fallback until it is.
- Windows paths passed into WSL as arguments lose their backslashes. Convert `C:` paths to
  `/mnt/c/...` in code (see `scripts/verify/v6-muse.ts`), not with `wsl wslpath`.
- A `| tail` after `pnpm lint` hides lint's exit code. Check lint on its own before
  committing.

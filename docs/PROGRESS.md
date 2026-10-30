# Phase 2 progress

This log is the working memory for Phase 2. After any context compaction, re-read it, then
CLAUDE.md and the relevant SPEC-phase2 sections, before continuing.

## Current milestone and next step

- **Current:** P11 — voice (§14).
  - **Already written, not yet wired:** `main/voice/transcribe.ts` (V5 WebSocket),
    `main/voice/tts.ts` (ElevenLabs stream-input) and `renderer/lib/voice-command.ts`
    ("Fitts, …" parsing).
- **Next concrete steps:**
  1. Voice IPC in main (start, audio, end, cancel, speak, stop) and a preload bridge.
  2. Grant mic permission for the app page only.
  3. Renderer: an AudioWorklet capture at 24 kHz s16le, and a real mic toggle (canned
     transcript when there's no key or the run is offline, so Phase 1 e2e stays).
  4. Always-listening wake words, and barge-in on `speechStart`.
  5. `speech.ts` backend: ElevenLabs PCM through Web Audio, falling back to speechSynthesis.
  6. Ledger usage for stt and tts.
  7. Unit tests with a local fake WebSocket server, and a manual script (mic and speakers) in
     NEEDS-ALLEN.

## Done

| Milestone | Commit | Acceptance |
|---|---|---|
| Step 0: tag `phase1-prototype`, Phase 2 CLAUDE.md, progress log | 6bfad23 | done |
| P10: SAM + Muse Image | see `git log --grep "P10:"` | Live (`tests/bench/p10.bench.ts`, about $0.10): demo/chat findings got SAM outlines (11), and the Finding panel showed the outline and a real Muse Image mockup; hartwell's 3 directions got mockups. Screenshots are in `.fitts-dev/bench/p10-*.png`. |
| P9: fix pipeline + verification + PRs + preview + undo/redo/retry | see `git log --grep "P9:"` | Live (`tests/bench/p9.bench.ts`, a mirror clone with a local bare origin, `FITTS_GH_DRY_RUN=1`, Autonomous): 8 verified dry-run PRs without asking. The sabotaged fix rolled back, then the retry verified it (PR #9). Undo closed a PR; undo of a merged PR opened a revert PR. Unit and integration: `tests/agent/fix.test.ts`, `tests/main/fix-host.test.ts` (a real git repo). |
| P8: permission gate + Fetch interception + modes | see `git log --grep "P8:"` | Live (e2e on demo/chat): `DELETE /api/conversations/12` from Fitts tapping "Delete conversation" is held at CDP Fetch; the gate modal shows it; the server hasn't received it; "Don't do it" fails it and conversation 12 survives. Unit: Ask every action asks before each tap; Plan only never clicks or types; Dangerous mode releases on localhost only. |
| P7: real interview + theme-fit | see `git log --grep "P7:"` | Live (`tests/bench/p7.bench.ts`, under $0.01): on demo/chat the first answer filled For ("Family messaging for grandparents") and Who ("Older adults, grandparents"); on demo/hartwell theme-fit said `fits: false` with 3 directions. The recorded fixtures replay in unit tests. |
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

- Fix quality varies. For example, the "(null)" fix reads the right key but shows the contact's
  id, not their name, and the tap-target fix uses an inline style. Every fix passes its probe
  and the regression check; Wonder (the Quality profile) should do better than Spark
  contributor. Trace and reviewer-only findings aren't fixed automatically (see DECISIONS P9).
- The preview branch isn't served on :5180 yet (P12), and after-screenshots aren't captured
  for PRs yet.

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

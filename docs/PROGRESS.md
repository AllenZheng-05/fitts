# Phase 2 progress

This log is the working memory for Phase 2. After any context compaction, re-read it, then
CLAUDE.md and the relevant SPEC-phase2 sections, before continuing.

## Current milestone and next step

- **Current:** P4 — the crawler tool loop and coverage gate, stop/pause/queue, and real
  edge-state triggers (site-down, login-wall, api-trouble).
- **Next concrete step:** `agent/crawler/` — a CDP-backed tool set over main's site window
  (navigate, click, type, press, back, ax_snapshot, screenshot), with a Spark tool loop
  driven by recorded fixtures in tests.

## Done

| Milestone | Commit | Acceptance |
|---|---|---|
| Step 0: tag `phase1-prototype`, Phase 2 CLAUDE.md, progress log | 6bfad23 | done |
| P3: LLM client, ledger, router, budgets | see `git log --grep "P3:"` | one Spark, one Wonder and one Baseten call each in the ledger (script and in-app); cost events live; the 80% and 100% cards fire with a $0.10 cap (e2e). 117 e2e pass. |
| P2: live site view, CDP queries, detection, dev-server spawner | see `git log --grep "P2:"` | demo/chat streams live in the workspace; overlays align on the canvas (pin within 16px); the Finding panel and gate draw over it (DOM over canvas); the user drives during the interview and after Take the wheel; point returns a real ref; rewind shows stored step shots. 116 e2e pass. |
| P1: events, reducer, IpcRunEngine, agent process, stores, secrets | see `git log --grep "P1:"` | Phase 1 UI runs unchanged on IpcRunEngine with the stub agent; all 113 e2e pass (Scenario panel specs on MockRunEngine); `replay(diff)` is exact over every mock scenario; runs are logged to events.ndjson; projects are files; keys go through safeStorage. |
| P0: demo targets + vite plugin | see `git log --grep "P0:"` | demo/chat 25/25 planted issues reproduce (`pnpm check:demo-chat`); hartwell runs on :3000; the plugin stamps in dev only (unit tests, and a build has no stamps). Mirror repos are exported locally; creating and pushing them is NEEDS-ALLEN 3. |
| V1–V9 verification (`scripts/verify/`) | 290cf81 | V1, V2, V3, V4, V5, V7 and V9 pass live. V6 passes offline (`pnpm verify:v6:echo`); the real-model run waits on `muse login` (NEEDS-ALLEN 1). V8: the flag is confirmed, and the live upload is deferred. |

## Deferred to Allen

See [NEEDS-ALLEN.md](NEEDS-ALLEN.md).

## Spend so far (USD)

About $0.08 of the $25 session cap. `.fitts-dev/spend.json` is the source of truth.

## Known issues

- `muse` in WSL isn't logged in. Fixes use the in-process Wonder fallback until it is.
- Windows paths passed into WSL as arguments lose their backslashes. Convert `C:` paths to
  `/mnt/c/...` in code (see `scripts/verify/v6-muse.ts`), not with `wsl wslpath`.
- A `| tail` after `pnpm lint` hides lint's exit code. Check lint on its own before
  committing.

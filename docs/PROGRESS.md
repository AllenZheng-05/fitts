# Phase 2 progress

This log is the working memory for Phase 2. After any context compaction, re-read it, then
CLAUDE.md and the relevant SPEC-phase2 sections, before continuing.

## Current milestone and next step

- **Current:** P0 — demo targets (`demo/chat`, `demo/hartwell`) and `@fitts/vite-plugin`.
- **Next concrete step:** scaffold `demo/chat` as a Vite + React 19 app ported from
  `renderer/mock/sites/DemoChatSite.tsx`, with the 25 planted issues and `PLANTED.md`.

## Done

| Milestone | Commit | Acceptance |
|---|---|---|
| Step 0: tag `phase1-prototype`, Phase 2 CLAUDE.md, progress log | 6bfad23 | done |
| V1–V9 verification (`scripts/verify/`) | 290cf81 | V1, V2, V3, V4, V5, V7 and V9 pass live. V6 passes offline (`pnpm verify:v6:echo`); the real-model run waits on `muse login` (NEEDS-ALLEN 1). V8: the flag is confirmed, and the live upload is deferred. |

## Deferred to Allen

See [NEEDS-ALLEN.md](NEEDS-ALLEN.md).

## Spend so far (USD)

About $0.06 of the $25 session cap. `.fitts-dev/spend.json` is the source of truth.

## Known issues

- `muse` in WSL isn't logged in. Fixes use the in-process Wonder fallback until it is.
- Windows paths passed into WSL as arguments lose their backslashes. Convert `C:` paths to
  `/mnt/c/...` in code (see `scripts/verify/v6-muse.ts`), not with `wsl wslpath`.
- A `| tail` after `pnpm lint` hides lint's exit code. Check lint on its own before
  committing.

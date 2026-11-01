# Fitts — guide for Claude Code

Fitts is a desktop (Electron) AI agent that uses a website the way people do, finds
usability problems (Nielsen's 10 heuristics plus accessibility, performance and
look-and-feel lenses), fixes the code, verifies each fix and opens pull requests.
Users talk to Fitts by chat or voice while it works.

## Current phase: Phase 3 — Fitts decides

Phase 2 (the real engine, SPEC-phase2) is done. Phase 3 turns its fixed script into abilities
that Fitts chooses between, with the owner steering. Spec: docs/SPEC-phase3.md (v0.2, approved
Oct 31). Where it's silent, SPEC-phase2, then docs/DECISIONS.md, then SPEC-phase1 apply.

- Built: Q0 abilities and the scripted decider · Q1 the Spark decider, `converse` and the
  owner's pivots · Q2 style boards · Q3 rounds of looks and the final review · Q4 tabs in the
  mirror.
- Left: Q5, real runs on Allen's portfolio and openteamsheets.com with Allen (a redesign PR
  touches GitHub, and judging boards needs his eyes).
- The guarantees in SPEC-phase3 §1.6 live in the abilities (`orchestrator/run.ts` `use()`),
  never in a decider: a decider may choose badly, never unsafely.
- The `RunEngine` interface still has 22 methods; new behavior goes through `sendMessage`,
  `answerQuestion` and `pickDirection`, not new methods.

Do one milestone at a time, each ending green (typecheck, lint, test, test:e2e) and committed
before the next starts.
Real network calls are allowed only in apps/desktop/src/agent/llm/, apps/desktop/src/main/voice/, apps/desktop/src/main/fonts/ (Fontsource, for redesign and style-board fonts),
apps/desktop/src/agent/verify-site/, apps/desktop/src/main/github/, apps/desktop/src/main/hosts/, and the gh/git spawner. The renderer never makes network
calls, and a style board never does (served with its own CSP, fonts embedded). Never log or
commit API keys. Never run git or gh outside the project's .fitts-worktrees/ except the
read-only checks in SPEC-phase2 §4 and the PR steps in §9.3.
Commit messages and PR bodies: no Co-Authored-By, session links or "Generated with" lines.
Log judgment calls in docs/DECISIONS.md under "Phase 3".

## Commands

```
pnpm install
pnpm dev            # run the Electron app with hot reload
pnpm build          # production build
pnpm typecheck
pnpm lint
pnpm test           # Vitest unit + component tests
pnpm test:e2e       # Playwright (Electron) flow tests + axe accessibility checks
```

## Stack (Phase 1)

pnpm workspaces · Electron (latest stable) via electron-vite · React 19 · TypeScript
(strict) · Tailwind CSS v4 with tokens in `apps/desktop/src/renderer/styles/tokens.css` ·
Zustand · three + @react-three/fiber + @react-three/rapier (background shapes) ·
lucide-react for standard icons · Vitest + Testing Library · Playwright `_electron` ·
@axe-core/playwright. Fonts bundled locally (no CDN): Bricolage Grotesque, Geist,
Geist Mono.

## How to work

1. Do **one milestone at a time** from the current spec (`docs/SPEC-phase3.md` §5). Plan
   first, then implement.
2. A milestone is done only when `typecheck`, `lint`, `test` and `test:e2e` pass and
   its acceptance checks are met. Then commit: `Phase 3 Q4: tabs in the mirror`.
3. Match the design references closely. Use tokens; never hard-code a color, radius or
   shadow that isn't in `tokens.css`.
4. When something in the spec is ambiguous, pick the simplest option consistent with
   the references, note it in `docs/DECISIONS.md`, and continue.

## Conventions

- Components read state only from the run store (`src/renderer/state/`). Never put run
  data inside components. Mock data lives in `src/renderer/mock/`.
- Everything the UI does to a run goes through the `RunEngine` interface (§9). The real
  engine (`IpcRunEngine`) runs in `pnpm dev`; `MockRunEngine` and the Scenario panel are only
  in e2e builds (`FITTS_DEV_TOOLS=1`, `TEST_BUILD`).
- All user-facing text lives in `src/renderer/copy.ts` and follows Fitts's voice (§8).
- Shared types live in `packages/schema` (no React or Electron imports there).
- Accessibility is required: real `<button>`/`<input>`/`<label>`, `aria-*` on icon-only
  controls, visible focus ring, text contrast ≥ 4.5:1.
- The app window never scrolls. Long content scrolls inside its own panel.

## Never

- Make network calls outside the folders listed under "Current phase", or from the renderer.
- Call the network from tests (`pnpm bench:*` spends real money and is run only on purpose).
- Use emoji anywhere in the UI.
- Add dark mode, i18n, a backend, analytics or auth.
- Use red (`--danger`) for anything except destructive actions and stop controls.
- Make "stop" or "wait" voice words trigger anything; voice commands require "Fitts" first.
- Bind Esc to stopping Fitts. Esc only closes the topmost overlay. Stop is ⌘. (Ctrl+. on Windows/Linux).

# Fitts — guide for Claude Code

Fitts is a desktop (Electron) AI agent that uses a website the way people do, finds
usability problems (Nielsen's 10 heuristics plus accessibility, performance and
look-and-feel lenses), fixes the code, verifies each fix and opens pull requests.
Users talk to Fitts by chat or voice while it works.

## Current phase: Phase 1 — clickable front-end prototype

Build the **entire UI** as a real Electron app, driven by **mock data and a scripted
run simulator**. No real AI calls, browser automation, git, GitHub or network calls.
The goal is to click through every user flow and judge the design.

- Full spec: `docs/SPEC-phase1.md` (read it before starting any milestone)
- Visual references: `docs/design-reference/*.html` — static mockups of every screen.
  They use a design-tool runtime and will not run on their own; read them for exact
  layout, spacing, colors, borders, radii and copy. Where the spec and a reference
  disagree, the spec wins.

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

1. Do **one milestone at a time** from `docs/SPEC-phase1.md` §11. Plan first, show the
   plan, then implement.
2. A milestone is done only when `typecheck`, `lint`, `test` and `test:e2e` pass and
   its acceptance checks in §11 are met. Then commit: `M4: workspace shell + interview`.
3. Match the design references closely. Use tokens; never hard-code a color, radius or
   shadow that isn't in `tokens.css`.
4. When something in the spec is ambiguous, pick the simplest option consistent with
   the references, note it in `docs/DECISIONS.md`, and continue.

## Conventions

- Components read state only from the run store (`src/renderer/state/`). Never put run
  data inside components. Mock data lives in `src/renderer/mock/`.
- Everything the UI does to a run goes through the `RunEngine` interface (§9). Phase 1
  implements `MockRunEngine`; Phase 2 swaps in the real engine without UI changes.
- All user-facing text lives in `src/renderer/copy.ts` and follows Fitts's voice (§8).
- Shared types live in `packages/schema` (no React or Electron imports there).
- Accessibility is required: real `<button>`/`<input>`/`<label>`, `aria-*` on icon-only
  controls, visible focus ring, text contrast ≥ 4.5:1.
- The app window never scrolls. Long content scrolls inside its own panel.

## Never

- Add real network or API calls, API-key validation, or git/GitHub operations in Phase 1.
- Use emoji anywhere in the UI.
- Add dark mode, i18n, a backend, analytics or auth.
- Use red (`--danger`) for anything except destructive actions and stop controls.
- Make "stop" or "wait" voice words trigger anything; voice commands require "Fitts" first.
- Bind Esc to stopping Fitts. Esc only closes the topmost overlay. Stop is ⌘. (Ctrl+. on Windows/Linux).

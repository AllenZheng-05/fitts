# Decisions

Claude Code logs judgment calls here: what was ambiguous, what was chosen, and why.

## M0 — Scaffold

**Window sizes are content sizes.** §4 says "default 1440×900, minimum 1200×720". On Windows
and Linux the frame and menu bar take about 50px, so a 1440×900 _window_ would not hold the
1440×900 design frame. The window uses `useContentSize: true`, and the minimum window size is
set to 1200×720 plus the measured frame, so the page area is never below 1200×720. The design
frame, the layout guard (§12) and the window then all mean the same 1440×900.

**The default size shrinks to fit small screens.** On screens whose work area cannot hold
1440×900 plus the frame (for example 1536×960 at 125% scaling), the first-launch window is
clamped to the work area, never below the minimum, and centered. A saved size and position
takes priority once one exists, and is dropped if it no longer lands on a connected display.

**The layout guard uses viewport emulation.** E2E tests check "no window scroll" at exact
1440×900 and 1200×720 viewports with `page.setViewportSize`, so the result does not depend on
the size of the monitor running the tests. Tests that measure the real window allow ±2px for
fractional-DPI rounding.

**Tailwind's default palette, radii, shadows and fonts are removed.** `styles/index.css`
resets `--color-*`, `--radius-*`, `--shadow-*` and `--font-*` and maps only the tokens from
`tokens.css`. Off-token classes such as `bg-red-500` do not exist, which enforces the
"tokens only" rule from CLAUDE.md at build time.

**Extra tokens for spec-named colors.** The spec names a few fixed colors outside the §5.1
table: the diff line colors (`#FF9C90`, `#7FF0C8`, §6.5) and the avatar gradient stops
(`#8A9BFF`, `#2235C4`, §5.4). They are tokens (`--diff-del`, `--diff-add`, `--avatar-hi`,
`--avatar-lo`) so no component hard-codes them. Other off-table colors in the design
references (`#D4D1C9`, `#8A8780`, `#C4463A`…) are triaged in M1: mock-site colors stay in the
mock sites, app colors map to the nearest token.

**Toolchain pins.** TypeScript 6.0 and ESLint 9.39, not the newest majors (TS 7, ESLint 10),
because typescript-eslint requires TS < 6.1 and eslint-plugin-jsx-a11y does not yet support
ESLint 10. jsdom 29, not 30, because jsdom 30 needs Node ≥ 22.22 and the dev machine runs
22.13. All versions are exact (`save-exact`).

**pnpm build-script allowlist.** pnpm 10 skips dependency install scripts by default; root
`package.json` allows `electron` (binary download) and `esbuild`.

**Geist fonts via an alias.** The `geist` package's `exports` map hides its font files, so the
renderer config aliases `@geist-fonts` to `node_modules/geist/dist/fonts`. Bricolage Grotesque
comes from `@fontsource-variable/bricolage-grotesque` (latin + latin-ext subsets). The family
is registered as "Bricolage Grotesque", the name the references use. Fraunces is added in M7.

**Strict CSP, no network.** The renderer's CSP allows only `'self'` (plus `data:`/`blob:`
images and inline styles). Main denies `window.open`, navigation away from the app and every
permission request. Phase 1 simulates mic and notification permission states.

**`ELECTRON_RUN_AS_NODE` is stripped in E2E.** Shells spawned by the VS Code extension host
inherit `ELECTRON_RUN_AS_NODE=1`, which makes Electron start as plain Node. The E2E launcher
removes it. If `pnpm dev` fails with "bad option" from such a shell, unset that variable.

**axe runs in legacy mode.** `@axe-core/playwright`'s default mode opens a second page to
merge results, which Electron does not support. `setLegacyMode(true)` runs axe in the page.

**Dev-only menu.** "Developer → Reset to first launch" appears only when the app is not
packaged. It clears the renderer's localStorage and reloads.

**Prettier skips hand-written docs.** `docs/` and root Markdown files are excluded from
`prettier --check` so the spec and references stay as authored.

**Known follow-up (M8): Alt+Space on Windows.** §7.9 makes Alt+Space hold-to-talk, but
Windows uses it for the window's system menu, and a bare Alt press focuses the menu bar. To
decide when voice UI is built.

## M1 — Design system + gallery

**A sixth button variant, `danger` (solid red).** §5.4 lists five variants, but States.html
uses a red-filled "Stop run" button in the stop-run confirm card. It exists for that and
other confirmed destructive actions only.

**Extra primitives beyond §5.4.** `Tabs`, `Checkbox`, `RadioCard`, `Switch`, `StatusDot`,
`ProgressBar` and `ScrollBody` come straight from the references (Finding tabs, Gate and
AddProject checkboxes, Settings permission rows, site-map dots and progress, scrolling
panels) and are built once here.

**Switch design.** Settings needs on/off toggles ("Fitts speaks out loud", "Floating
shapes", Dangerous mode), but the references only show the Run & permissions tab, which has
none. The switch is a 44×26 pill with a 1.5px ink border, an ink knob when off, and a cobalt
track with a white knob when on, using `role="switch"`.

**Field errors are coral, not red.** CLAUDE.md reserves red for destructive actions and stop
controls. A field error is a problem, so it shows as a coral-tint message with coral-ink text
under an ink-bordered input (`aria-invalid` plus `aria-describedby`).

**Severity 0.** The schema allows 0, which §5.1 does not list. It renders neutral as
"Severity 0 · Not a problem", Nielsen's own wording.

**New tokens.** App colors used in the references but missing from §5.1: `--ink-faint`
`#8A8A93` (dashed borders, hollow dots, never text), `--track` `#E2DFD8` (progress tracks),
`--code-caption` `#B8B8C2` (diff caption on ink), `--disabled-ink` `#6B6B74` (disabled
segment). Also radii `--radius-tag` 6, `--radius-row` 10, `--radius-card` 14 and
`--radius-sheet` 16, which the references use for tags, rows, chat cards and sheets.
Mock-site colors (`#D4D1C9`, `#8A8780`, `#2557D6`, `#4A4843`) stay inside `mock/sites`.

**Hard-coded colors fail lint.** An ESLint rule rejects 6/8-digit hex and `rgb()` strings in
`src/renderer/**` except `mock/**`. "PR #12"-style strings pass.

**Focus ring appears instantly.** Tailwind's `transition-colors` also animates
`outline-color`, which faded the ring in from the text color (white on dark buttons).
Controls use a `transition-tint` utility (color, background, border only).

**Absolutely positioned content can't stretch the window.** `#root` is `position: relative`
and panel bodies are positioned, so `sr-only` labels inside a scrolling panel no longer add
to the document's scroll height.

**Scrolling panels are keyboard-reachable.** A panel body that overflows becomes a focusable
`region` named after the panel (axe `scrollable-region-focusable`). It isn't a tab stop when
nothing overflows.

**Overlays.** One Zustand overlay stack and a `useOverlay` hook handle all of them: Esc
closes only the topmost overlay and does nothing when none is open, Tab is trapped, and
focus returns to the trigger. Modals make `#root` inert. Popovers flip above their trigger
when they don't fit below. No Radix or focus-trap dependency.

**BeforeAfterSlider is a split, not a wipe.** Finding.html shows two side-by-side panes,
each with its own content, so dragging resizes the panes rather than clipping one over the
other. The handle is `role="slider"` with `aria-valuenow` and `aria-valuetext`.

**Dev-tools flag.** `__FITTS_DEV_TOOLS__` is true in `pnpm dev` and in `test:e2e` builds
(`FITTS_DEV_TOOLS=1`), false in `pnpm build`, so the gallery (and the Scenario panel in M2)
is left out of production while e2e can test it. Main shows "Developer → Open component
gallery" when unpackaged.

**Gallery copy stays in the gallery.** Its demo labels are dev-only and never reach users,
so they live in `features/gallery/Gallery.tsx` rather than `copy.ts`. Every string a real
component renders is in `copy.ts`.

**Focus-ring test tolerance.** At 125% scaling Chromium reports a 2px outline as 1.6px (it
snaps to whole device pixels), so the e2e check accepts 1.5–2px solid cobalt.

**Pixel values stay literal.** The editor suggests rewriting `gap-[3px]` as `gap-0.75`. The
literal pixel values are kept because they read 1:1 against the references.

## M2 — Schema, engine, scenarios, Scenario panel

**RunEngine lives in `@fitts/schema`.** §9.2 places the interface in `state/engine.ts`. It is
defined in the schema package (and re-exported from `state/engine.ts`) so Phase 2's main
process and preload can implement the same contract without importing renderer code.

**Additions to `RunState` (§9.1).** The flows need state the type doesn't carry:
- `brief`: the brief as the interview fills it in. The brief card, ready bar and Brief
  popover read it; the project store saves it back to the `Project` (M3).
- `fittsTyping`: the three-dot indicator shown for 900ms before each reply (§6.3).
- `waitingFor`: the gating beat the script is held on (`question:<id>`, `gate`,
  `approval`), so the UI and tests can see why a run isn't moving.
- `driverClicks`: "You clicked …" lines while the user has the wheel (§7.3).

**Additions to `ChatItem`.** `state` and `approval.batch` items get an optional `answer`, so
a card shows which button was pressed and can't be answered twice.

**Confirm-style cards answer through `answerQuestion`.** `stopRun()` *asks*: it posts the
"Stop this run?" card and pauses. The card's buttons call `answerQuestion` with a stable key
(`stop` / `keep`), and every §7.7 card works the same way. The keys are shared in
`EDGE_STATE_ANSWERS` in the schema; the UI maps each to its label. This keeps the Phase 2
contract to the 21 methods in §9.2.

**Opening a PR on a `fitts/` branch counts as part of the fix.** §7.1 says Push/PR "asks" in
every mode except Dangerous, but §6.5's Autonomous footer shows a PR opened without asking,
and Scenario A opens PRs right after the batch approval. Approving a fix (or Autonomous)
covers opening its PR; merging and pushing to the user's branch are what always ask. A fix
started in Autonomous whose mode has since changed asks before opening its PR (§7.1).

**Run time vs real time.** The run clock (`elapsedMs`) advances only while Fitts is acting or
redesigning; it stops while paused, waiting on the user or while the user drives. Fix
completions run on run time. Chat replies (900ms), "Try again" (3s) and the API retry (12s)
run on real time, scaled by the Scenario panel speed.

**Interview activity is `idle`.** During the interview the user drives the site, but
`user-driving` means "took the wheel mid-run" (it shows the driving card), so the interview
uses `idle` and the UI shows the "You're driving" chip for the interview phase.

**Interview mapping.** demo/chat follows Interview.html: the first answer fills For and Who,
the second Pain, the third Feel, with Fitts's summaries as values ("Family messaging",
"Older adults, some with low vision"). Other projects fill one field per answer, in the
order For, Who, Pain, Feel, using the user's text.

**Scenario narration lives with the scenario.** The §8 canonical strings and every generic
line the engine says are in `copy.ts`. Lines specific to one scenario (finding text, "I
mocked up three calmer directions…") are mock data in `mock/scenarios`, standing in for what
the real agent writes in Phase 2.

**Scenario A's Done numbers come from a fixture.** The live run reports six findings; the
final beat loads the full run (31 found = 24 fixed + 2 rolled back + 3 not a problem + 2
suggestions; 26 changes over 9 PRs; $13.92 by phase) from `mock/fixtures/demo-chat.ts`. One
change is marked merged to show the "Revert PR opened" undo (§7.6).

**`fixingCount` follows §9.5.** Approving the three fixes starts two at once; the recipient
fix starts when the first one finishes.

**No immer.** Each change applies to a `structuredClone` of the run, then subscribers get the
new object. Runs are small, and this keeps the dependency list to the spec's.

**Scenario panel.**
- Entries that only set up a run are enabled now (the debug view shows them). Screen-only
  entries (Welcome, Welcome back, Settings, Project menu, Add project) are disabled with the
  milestone that builds them.
- Esc doesn't close it: it's a dev tool outside the overlay stack, so Esc behaves exactly as
  users get it. ⌘⇧D / Ctrl+Shift+D or its close button toggles it.
- It uses dev controls on `MockRunEngine` (`loadAudit`, `jumpToBeat`, `setSpeed`,
  `showEdgeState`, `askOn`, `recordUserClick`) that are not part of RunEngine.
- "Jump to beat" replays the scenario from the start, answering earlier holds with their
  defaults (approve all, deny the gate, first option), and stops on the chosen beat with its
  own hold open.

**`recordUserClick` is mock-only.** While the user has the wheel the mock site reports clicks
to the mock engine. The real engine will observe clicks itself through CDP, so this is not a
RunEngine method.

**Dev builds open the run debug view.** Until the M3 router exists, `pnpm dev` and e2e builds
show `RunState` as JSON with buttons that drive the engine. Production shows the scaffold page.

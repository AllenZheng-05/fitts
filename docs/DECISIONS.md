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

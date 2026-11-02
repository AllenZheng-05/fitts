# Site decisions

Judgment calls for the fitts.allenzheng.com redesign (docs/SPEC-site.md), newest last.

## Step 1 — Home, Download, the field, the shell

- **Lockfile.** `pnpm add` also re-resolved three unrelated snapshots (typescript-eslint's parser
  peer, @types/estree). Only the `apps/site` importer block was kept; `pnpm install
  --frozen-lockfile` passes with it.
- **Words and meta in one place.** Page titles, descriptions and nav names live in
  `src/content/site.ts` (`pages`). A small plugin in `vite.config.ts` writes `<title>`, the
  description, canonical and Open Graph tags into each HTML file from it, and emits
  `sitemap.xml`, so nothing is typed twice. The 404 page gets `noindex` and no canonical.
- **Nav.** The wordmark is the Home link (named "Fitts, home"); the other four pages are listed,
  Download as the app's primary button. Below 1024 px they fold into a Menu button
  (`aria-expanded`, Esc closes it and returns focus). `aria-current="page"` marks the page.
- **The still image (method).** An SVG drawn at runtime by `src/field/StillField.tsx` from the
  same `layout()` the 3D field uses: each shape at its place, size and token color, shaded with
  the scene's upper-left light (a highlight and an edge shade). No script step or image file, so
  it can never drift from the layout, and it costs a few kB. Phones, reduced motion, Save-Data
  and no WebGL get `layout('still')` (the app's still layout: shapes at the edges); desktops see
  `layout(mode)` as SVG until the 3D field has drawn its first frame, then the canvas replaces
  it at the same positions.
- **What "phone" means.** Still when `(pointer: coarse)`, `(max-width: 767.98px)`,
  `(prefers-reduced-motion: reduce)`, `navigator.connection.saveData`, or no WebGL context. The
  queries are watched, so narrowing a window below 768 px drops the canvas.
- **Pausing.** The app pauses on window blur and while a before/after divider is dragged; the
  site pauses when the tab is hidden or the field is off screen (IntersectionObserver), and
  never runs in still mode. Frame cap 30 fps as in the app.
- **Field copies.** `seeThrough.ts` is copied unchanged; `shapes.ts` without the severity colors;
  `ShapeField.tsx` without the run-store drops, the run-end push, the speaking pulse and the dev
  stats. `tests/unit/drift.test.ts` compares tokens.css, `layout()`, seeThrough, the mark's
  paths and ShapeField's physics constants with the app's, so drift fails the site's tests.
- **Readability over shapes.** Text on the paper (not in a card) has a paper-colored halo
  (`text-shadow` on `main`), so a shape drifting behind a line never lowers its contrast.
  Buttons and chips opt out.
- **Platform buttons.** Detected from `userAgentData.platform` or the user agent. An unknown
  computer gets Windows as the filled button. Phones and tablets get a note that Fitts is a
  desktop app. macOS's button goes to Apple silicon; Intel is on /download.
- **Caching.** `/assets/*` (hashed) a year, immutable. `/media/*` 30 days, not immutable: media
  names aren't hashed, and a clip may be replaced in place on Wednesday.
- **Favicon.** `icon.png` carried over; `favicon.svg` added (the mark on a paper tile). The SVG
  holds tokens.css's hex values, since a favicon can't read CSS variables.
- **Open Graph image.** `public/og.png`, rendered by `pnpm og` (scripts/og.mjs) from the real
  mark, tokens.css and Bricolage 800, using the tagline from `content/home.ts`.
- **Privacy, corrected.** The old FAQ said "Your code stays on your machine". Since Phase 4,
  Muse Code and the fixer read and change files (in a worktree), and Understand's second pass
  reads the repo, so the parts of the code they read go to Meta's models. The site now says so.
- **Tooling.** The site has its own `lint` (`eslint.config.mjs`: the repo's rules plus jsx-a11y
  strict, React hooks and the no-raw-color rule, as the app's renderer has), `test` (Vitest) and
  `test:e2e` (Playwright). Playwright uses the system Edge (`channel: 'msedge'`), since no
  Playwright browsers are installed here. The root `pnpm test` isn't changed on this branch
  (the spec limits changes to apps/site); the merge note says the one line to add.

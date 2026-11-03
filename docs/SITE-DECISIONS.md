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

## Step 2 — What Fitts checks

- **Where each list comes from.** Imported from packages/*: the probe names (`ProbeName`, so a new
  probe fails the catalog test until it's listed), WCAG criteria per probe (`PROBE_STANDARDS`,
  `WCAG`), the speed limits and throttling (`LIMITS`, `SLOW_4G`, `CPU_SLOWDOWN`) and
  `PAGE_PROBES`. Copied from apps/desktop, each with a comparison in
  `tests/unit/catalog.test.ts`:
  - each probe check's title and heuristic: the test runs the app's `template()` (aggregate.ts)
    on the check's sample measurement and compares;
  - how fixes are checked: `VERIFIABLE`, `RECHECKED` and `TRACE` from fix/pipeline.ts (read from
    the source text, since they aren't exported);
  - the screen-size cells every run starts from: the test calls the app's `chooseCells()`;
  - axe's tags (`AXE_TAGS` in packages/probes/src/page.ts, not exported) and Android's 48 dp.
  The prose (what each check looks at, how it's measured) is written for the site from the code
  and SPEC-phase4 §6B and §9.3.
- **Groups.** The spec's lenses, plus "Feedback and flow" for the trace checks (feedback timing,
  back mid-flow, error messages, labels, placeholder leaks) and the five reviewers, which fit no
  other lens. Broken links sit under Navigation, request checks under Speed, fonts and spacing
  under Brand and look, target size under Fitts's law.
- **Evidence labels.** Probe checks are Measured. The popped-up, jumped and scrolled-by-itself
  moments (web and Android) are Judged by Muse Wonder. Tab order, focus moved by itself, the
  empty state, the theme check, the Android brand check and the five reviewers are Reviewers.
- **After a fix.** From the pipeline's `checkedBy`: measured again, the check run again, or the
  steps replayed. A probe finding in none of those sets (surprises, states, speed, text spacing,
  200% text, orientation, Fitts's law, requests) has no way to be checked, so the code leaves it
  to the owner: "Reported for you to fix". Reviewer and judge findings are fixed only when the
  owner asks, "Checked by review". PROGRESS says surprise and perf fixes "stay Checked by
  review"; the code says a probe finding Fitts can't re-check isn't fixable, so the site follows
  the code.
- **States.** All three state_pass cases are built (error, empty, slow). Error and slow give
  measured findings; empty runs the probes (placeholder leaks) and gives the reviewers the shot,
  so it's listed as Reviewers.
- **Speed.** The perf pass measures LCP, CLS, TBT and file sizes on the dev server. INP and
  page-change timing exist in the thresholds but aren't measured yet, so they aren't listed.
- **Benches.** No bench:chat run on Nov 2 passed every line: all three were over the bench's bar
  of 2 unplanted findings at severity 2 or more. The site names the latest run (06:55: 29/33,
  29/48, 29/37, $0.19) and says it missed that line, rather than picking the best recall (03:57,
  30/33). Android: the 13:00 CST audit (6/10, $1.07) with what it found and missed. Fixes: the
  U9 fix run (3 of 3, $2.65), saying which two were verified by measuring and that the brand fix
  was checked by review; its audit's 6/10 is from the same run. Numbers aren't rounded up:
  88%, 60%, 78% are PROGRESS's.

## Step 3 — How it works

- **The loop** is six buttons (`aria-expanded`, `aria-controls`) over one panel region; one step
  is open at a time. Each panel lists what Fitts does, which models, which checks (linking to
  that group on /checks) and a clip slot. Two columns on phones, so the panel stays near.
- **Model jobs, checked against the code.** Spark, Wonder, SAM, Muse Code and Spark Open as the
  spec says. Two corrections:
  - **Muse Image** doesn't draw redesign mockups any more: Phase 3 replaced them with style
    boards built by code, and `run.ts` `heroArt()` uses Muse Image for one thing, the hero
    illustration on each direction's board. The site says that.
  - **SAM 3.1** outlines the element in each finding's screenshot as well as in a moment's
    first and last frames (`run.ts`).
- **Profiles table.** `PROFILE_ROWS` in content/how.ts, shown as a table on wide screens and as
  cards below 768 px (one is `display: none`, so screen readers get one). Routed rows are
  compared with `modelFor()` and `reviewerRoster()` (with a Baseten key) in
  `tests/unit/profiles.test.ts`. Three rows aren't routed (Muse Code, the Wonder judge and review
  check, SAM): they're the same in every profile, by the code (`WONDER` is fixed for the judge
  and the review check). A note says Open without a Baseten key falls back to Spark.
- **Android's fixed version.** The spec says Fitts "shows the fixed app on the emulator". Allen's
  Nov 2 change (PROGRESS, U9) keeps the emulator on the live app and shows the fixed version as
  its web build at phone width, marked as an imitation; fixes are still checked on the device.
  The site says what the code does.
- **Rails lead.** Not every rail is a §14 guarantee (severity isn't), so the lead says the rules
  that keep you in charge are in code, not a prompt. "Verified" also requires the project's own
  tests to pass (§14), now in the rail.
- **Device previews** come straight from `DEVICES` in @fitts/schema, so the list can't drift.
- **Presentation mode** (a Showcase card) isn't in the code on this branch or on main as of
  Nov 2, probably U10. Its slot shows "Clip coming" until a real clip exists; check the caption
  against the feature when it lands.
- **media.ts** was written in this step (the loop and the PR block need slots); step 4 adds the
  Showcase page over it.

## Step 4 — Showcase and the media manifest

- **One card per feature**, all 14 from the spec, from `SHOWCASE_MEDIA` in src/media.ts, each with
  a clip slot, a one-line caption and its honesty label. Every slot is empty today, so each shows
  "Clip coming". Filling one in is `src` and `poster` in media.ts and the files in public/media/.
- **Honesty labels by project.** Basil & Ember (built by Muse Code from one prompt, never
  changed by hand) is "Real AI-built site, untouched": the understanding card, presentation mode,
  the 2:45 AM pickup (a reviewer finding on Basil & Ember's checkout, docs/basil-ember-preview.md),
  the App Map, a redesign, talking to Fitts, the PR. The chat app and the Android app are "Our
  test app, planted issues": Noticed lines, See it yourself, a verified fix, the menu jump, the
  emulator's fixed version, the brand fix, the Cancel order gate (A5), the pause. Allen can
  change any label in media.ts if a clip is recorded on another project.
- **The portfolio before/after** renders only when both `PORTFOLIO.before` and `.after` are set,
  and the "Real site, merged" legend appears with it. It reuses BeforeAfter.tsx (labels now passed
  in) with a text description for screen readers (`PORTFOLIO.alt`) and the merged PR's link.
  The 2007 images and copy are gone.
- **Clips** load only near the screen (`preload="none"`, `src` set by an IntersectionObserver),
  play muted, looping and inline, pause off screen, don't autoplay with reduced motion, and keep
  a visible Pause/Play button (WCAG 2.2.2) named with the clip's title.

## Step 5 — Checks and the Fitts audit

- **Browsers for tests.** Playwright runs the system Edge (`PW_CHANNEL=chrome` for Chrome);
  no browser download. CI doesn't run the site's e2e yet (see the merge note).
- **The preview and dev servers answer like Cloudflare Pages** (`pagesLikeCloudflare` in
  vite.config.ts, and `appType: 'mpa'`): a page folder without its slash gets a 308 to it, and
  an unknown address gets 404.html with status 404. Without it, the dev server served the home
  page for `/download`, which Fitts (rightly) reported as a page that breaks on refresh.
- **No smooth scrolling.** It moved focused controls out of view for a moment and made controls
  move between Fitts choosing and tapping them. Anchors now jump.
- **No visually hidden text inside controls.** Controls are named with `aria-label` (the visible
  text stays inside the name, WCAG 2.5.3); the Home video and Showcase legend headings are
  visible. The skip link no longer switches from `sr-only` to fixed: it sits at the top left,
  transparent and click-through until it has focus. The profiles table keeps its `sr-only`
  caption (a caption isn't a control, and Fitts didn't flag it).
- **Quoted placeholder values are `<code>`** (`Tokens.tsx`) on /checks: "(null)", "undefined"
  and the rest are literal values. Fitts's placeholder probe skips code, so the examples stop
  reading as leaks; nothing else about the page changed.
- **Fonts preloaded.** Bricolage and Geist (the text fonts) are preloaded from each page's HTML;
  Geist Mono isn't (it's small print).
- **The footer's audit line** says what the run found and how it was answered, and links to the
  audit section here.
- **What wasn't changed**: the download and outside links (Fitts's site window doesn't follow
  them), the keyboard reach finding (doesn't reproduce; tested), the 11 font sizes (the app's type
  scale) and the shapes behind text (the design; the halo keeps contrast). Each is in
  SITE-PROGRESS with the reason.

## Branch `evidence` — E1, the run report

- **A package, not app code.** packages/run-report has no Electron or React; apps/desktop isn't
  touched on this branch (the U10 session works there). An "Export as web page" item in the
  app's Done menu is a small follow-up (SITE-PROGRESS, "For the app").
- **Plain HTML strings, no framework, no scripts.** A report has to open from a zip or any static
  host and keep working; every value is escaped in one place (`esc`).
- **One page per run**, with an "On this page" list. 48 findings is long, but a single page is
  what you send someone, and Ctrl+F works on it.
- **Screens are inline SVG** (the shot as `<image>`, the outline or box drawn over it): a close
  up around the element and the whole page, like the app's Evidence tab. Each SVG sits in a
  clipping frame; without it the zoomed image widened the page at 320 px. Visually hidden text
  inside the scrolling tables and code had the same effect until those got `position: relative`.
- **SAM outlines are checked, not trusted.** Path data is validated (only path commands and
  numbers) before it's inlined, and moved onto its box when it plainly sits in the box's own
  pixels (the app bug in SITE-PROGRESS). Otherwise the DOM box is drawn.
- **What "Verified" says** is what pipeline.ts checks: the finding's check ran again on the fix
  branch's dev server and the finding is gone, no new problems at severity 2+ appeared, and the
  project's tests and CI, where it has them, passed. "Checked by review" says it wasn't measured.
  Rollbacks quote Fitts's reason.
- **The repro's device is the run's own word** ("desktop"), not a device cell's label: matching
  it to a cell showed "1440×900" beside an environment of 1536×960.
- **Model names** come from the ledger's ids (words.ts); an unknown id shows as itself. Muse
  Code's calls are logged as muse-wonder-1.0 with task "fix", so the report says "Muse Wonder
  1.0 · writing fixes" rather than guessing which path ran.
- **No chat transcript.** It isn't asked for, and it's where voice transcripts and anything the
  owner typed would be. The brief (one paragraph the owner wrote for the run) is shown.
- **A scrubbed route can look wrong**: a site route like `/home/<x>/<y>` would read as "[local
  path]". Erring that way is the safe side.
- **Tokens are a copy** (packages/run-report/src/tokens.css), held to the app's by a test, like
  the site's; a second test keeps hex colors, rgb() and raw radii and shadows out of report.css.
- **On the site** a published export gets a thin bar (the mark, "All runs") and may be indexed; a
  plain export says `noindex`. The site has no "For judges" section, so the README's (E3) gets
  that link; Home and Showcase link now.
- **The featured run is the demo/chat run until Wednesday**, labeled "Our test app, planted
  issues" everywhere it shows. "See a real run" still holds: real models on a real (planted) app,
  and the report says the run ended before any fixes were approved.
- **runs.json is written by the CLI**, never by hand; a unit test fails if it and the folders in
  public/runs disagree.
- **"Try it without keys" is /runs/** (Allen): the replay feature no longer exists. On the site
  it sits on Download under What you need, where the Meta key is listed; Home and Showcase link
  the featured run directly.
- **Landmarks** (axe, on the published page): the site bar is a labelled <nav> ("Fitts site"), not a
  second <header>; the brief's caption is a paragraph (a <footer> in a blockquote counts as a
  page footer); each scrolling table region has its own name, apart from its section's heading.
- **runs.json is imported `with { type: 'json' }`** so Playwright (plain Node ESM) can load the
  content module the e2e tests share with the pages.
- **A git-ignored fixture** (`apps/desktop/tests/fixtures/repos/next-app/.env.local`, a
  placeholder the understand test expects) doesn't come with a worktree; it was copied in locally, not committed.

## Branch `evidence` — E2, open-source apps

- **Each app runs as its own repo with a local `origin`.** Fitts fixes only a project at its git
  root, and even its dry run pushes. TodoMVC's `examples/react` was split out with `git subtree
  split`; Bootstrap was cloned at `v5.3.8`. Both point `origin` at a bare repo on this machine.
- **One local commit on Bootstrap** adds `"fitts": {"startPath": "/docs/5.3/examples/"}` (a field
  Fitts reads) so the run starts on the examples. The write-up names it beside the upstream sha.
- **Bootstrap ran audit only.** TodoMVC showed that a non-Vite fix server can't be moved to its
  port, so every fix fails to verify and the retries spend the cap. Astro's script has a fixed
  port too. An audit-only run was cheaper and showed the same findings.
- **The harness stops at the budget question.** TodoMVC's first harness waited 25 minutes on it.
  The copy now ends there. It never says yes to more spend.
- **Verdicts are by measurement, not by Fitts's evidence.** Each finding was reproduced (or not)
  in a separate browser, against the dev server and, where the project has one, its production
  build. "Unsure" means not reproduced, or not measured in that device cell. Where a WCAG rule
  has an exception (inline targets, spacing), the exception counts.
- **Third-party and dev-only problems are called that.** DocSearch is Algolia's widget, and the
  Astro toolbar exists only in development. They're confirmed or false by what users would
  meet, and they aren't drafted as Bootstrap issues.
- **One issue text, not two.** Only TodoMVC's placeholder contrast is confirmed, unreported and
  owned by the project. The keyboard gap is already tastejs/todomvc#1017, and Bootstrap's dark
  secondary color is twbs/bootstrap#39484 (fixed in v6).

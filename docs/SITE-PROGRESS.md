# Site progress

Working log for the fitts.allenzheng.com redesign (docs/SPEC-site.md), on branch
`site-redesign`. Judgment calls are in docs/SITE-DECISIONS.md.

## Steps

| #   | Step                                                          | Status |
| --- | ------------------------------------------------------------- | ------ |
| 0   | Save the spec                                                 | done   |
| 1   | Home, Download, the field, still image, shell, 404, claims    | done   |
| 2   | What Fitts checks, from the code, drift test, How well it works | done |
| 3   | How it works                                                  | done   |
| 4   | Showcase scaffold and the media manifest                      | done   |
| 5   | Checks, e2e, and the Fitts audit                              | done   |

## Step 1

- Pages: `/` and `/download/`, plus `404.html`. Shared `Nav`, `Footer`, `Page` shell.
- The 3D field (`src/field/`), lively on Home and calm elsewhere; the SVG still image for phones,
  reduced motion, Save-Data and no WebGL.
- Claim fixes: every Meta model in the footer; the gate (network on the web, the held tap on
  Android); speed on a dev build; no "Watch a recorded run"; the 2007 portfolio and its images
  removed; privacy now says which code reaches Meta's models.

### Build sizes (vite build, Nov 2)

| File                         | Raw      | Gzip     | When                                  |
| ---------------------------- | -------- | -------- | ------------------------------------- |
| `index.html`                 | 1.9 kB   | 0.7 kB   | first load                            |
| `Page-*.css`                 | 23.7 kB  | 5.9 kB   | first load                            |
| `Page-*.js` (React, shell)   | 243 kB   | 77 kB    | first load                            |
| `home-*.js`                  | 5.7 kB   | 2.4 kB   | first load                            |
| Fonts (3 woff2, as used)     | 41–71 kB | (woff2)  | first load, `font-display: swap`      |
| `ShapeField-*.js`            | 3,182 kB | 1,096 kB | lazily, after idle, desktops only     |

The field's chunk is mostly Rapier's WebAssembly, inlined by @react-three/rapier. Measured
transfer sizes from the browser are recorded in step 5.

## Step 2

- `/checks/`: Paul Fitts and the formula, Nielsen's 10 corrected for Phase 4, the catalog (67
  checks in 11 groups; filter buttons with `aria-pressed`, the count in a `role="status"`
  region), the evidence rule, and How well it works (three bench runs from PROGRESS).
- `tests/unit/catalog.test.ts`: 8 tests holding the catalog to the code. Every check's title and
  heuristic matched the app's `template()` on the first run.
- The checks chunk is 41 kB (13 kB gzip).

## Steps 3 and 4

- `/how-it-works/` (the loop, models, profiles, talking, rails, devices, Android, redesigns, the
  PR block, what's next) and `/showcase/` (14 feature cards, all "Clip coming" until the clips
  are recorded; the portfolio section hidden until its images exist). `src/media.ts` holds
  every slot. `tests/unit/profiles.test.ts` compares the profiles table with the router.

## Step 5

### Checks (Nov 2)

- `pnpm typecheck`, `pnpm lint` (site config and the root's), `prettier --check`: clean.
- `pnpm test`: 15 unit tests (drift, catalog, profiles).
- `pnpm test:e2e`: 29 Playwright tests on the production build, system Edge:
  - every page at 1440 and 390 px: h1, title, description, OG image, `aria-current`, no
    sideways scroll, axe clean (WCAG 2.0–2.2 A/AA + best practice), no page errors;
  - every page and the 404 at 320 px: no sideways scroll;
  - keyboard: skip link first, phone menu with Esc, the loop, the filters and their count;
  - the field: phones (two pages), reduced motion, Save-Data and a 760 px window get the still
    image and never request the `ShapeField` chunk; a desktop gets it after load, lively on
    Home and calm elsewhere, and it never takes a click.

### Transferred sizes, Home (vite preview, gzip, Edge, Nov 2)

| Visitor       | Before `load`         | After `load`                 | Load event |
| ------------- | --------------------- | ---------------------------- | ---------- |
| Desktop 1440  | 87 kB (HTML, JS, CSS) | 109 kB fonts + 1,059 kB field | 142 ms     |
| Phone 390     | 87 kB (HTML, JS, CSS) | 109 kB fonts, no field        | 102 ms     |

The field's chunk (three.js, @react-three/fiber, drei and Rapier's WebAssembly) is fetched only
on desktops, after first paint and when the browser is idle. Phones never fetch it.

## The Fitts audit

**Run:** Nov 2, 2026, about 16:20–16:59 CST. Fitts's dev build from this worktree (`bench:audit`'s
harness, audit only, Economy profile, a $2 cap) on apps/site's own dev server, with Allen's
`.env.local` keys (copied as a file, git-ignored, never read or printed). The brief: the site for
Fitts, for developers and designers deciding whether to try it, warm, playful and trustworthy,
keep the current look.

**Cost: $0.97** (within the $2 cap and `FITTS_DEV_SPEND_CAP_USD`).

**Result:** 5 pages, 21 findings and 2 suggestions; the theme check said the look fits. The run
ended at Fitts's "I think I'm done" card. Fitts made no changes: apps/site isn't its own git
repo, so the fixes below are mine, as normal commits.

Notes on the run itself:
- Two earlier starts stopped at the harness's own check before any model call ($0): it looks for
  the package name on Welcome, which shows the framework line instead. The run used an untracked
  copy of `audit.bench.ts` with that one line changed, deleted afterwards.
- Claude Code stopped the harness's shell for low memory partway through; the app ran on and
  finished. The harness never reported because it waits for the approval card or Done, not the
  finish proposal, so the findings come from replaying the run's own `events.ndjson` with
  `replay()`, and the stuck processes were stopped afterwards.

### Findings and what changed

| #   | Finding (severity, page)                                                   | What it was                                                                                                                                                                                                                          | Change                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | A control moves just as you reach for it (4, /)                            | The skip link jumped 61 px as it appeared (from `sr-only` to fixed). Other controls moved 85–655 px between Fitts choosing and tapping: smooth scrolling still in motion, and the hero re-centering when the fonts swapped in.          | Fixed: the skip link sits where it shows (transparent and click-through until focused); no smooth scrolling; the two text fonts are preloaded.                                   |
| 2   | Refreshing a page breaks it (4, /download)                                 | Real on the dev server: Vite answered `/download` (no slash) with the home page. Fitts audited /how-it-works and /showcase as Home for the same reason. Cloudflare Pages redirects to the slash, so production wasn't affected.     | Fixed: the dev and preview servers answer like Cloudflare Pages (308 to the slash; 404.html with status 404). Tested.                                                           |
| 3   | The focused control is hidden (3, /)                                       | Cards and footer links measured 0% visible while focused: the smooth scroll to them hadn't arrived yet.                                                                                                                             | Fixed: no smooth scrolling.                                                                                                                                                    |
| 4   | Tap target is too small (3, /)                                             | Footer links 40×19 px, the hidden skip link 32×16.                                                                                                                                                                                   | Fixed: standalone links are at least 24 px tall; the skip link is 44 px.                                                                                                       |
| 5–8 | Tap target is too small at 200% text, with text spacing, and on a phone    | The same links (and Download's "Release notes", 302×21 px).                                                                                                                                                                          | Fixed, as 4.                                                                                                                                                                   |
| 9–13 | Text gets cut off at 320, 360, 639, 640 and 767 px (1)                    | Visually hidden text inside controls (the skip link, the Menu button's label, "Download for" in the platform buttons, the video's heading) counts as clipped.                                                                        | Fixed: controls are named with `aria-label`; the video and Showcase headings are visible.                                                                                      |
| 14  | Page breaks at 200% text (3, /)                                            | The same hidden text.                                                                                                                                                                                                                | Fixed, as 9–13.                                                                                                                                                                |
| 15  | Text breaks with wider spacing (3, /)                                      | The same hidden text.                                                                                                                                                                                                                | Fixed, as 9–13.                                                                                                                                                                |
| 16  | Suggestion: text clipped on zoom and mobile (3)                            | The reviewers' reading of 9–15.                                                                                                                                                                                                      | Fixed, as 9–13.                                                                                                                                                                |
| 17–20 | Page shows "(null)" / "undefined" instead of real content (3, /checks)    | /checks quotes these values as examples of what the placeholder check looks for.                                                                                                                                                     | Fixed: the quoted values are marked up as `<code>`, which they are; the probe skips code.                                                                                     |
| 21  | A link goes to the wrong page (4, /)                                       | Not a site problem: the download links (files on GitHub Releases) and links to GitHub and the W3C don't navigate inside Fitts's site window, so it saw them "go to" the same page.                                                  | None. For the app: a download, or a link off the site, isn't a wrong destination.                                                                                              |
| 22  | A control can't be reached with the keyboard (4, /download)                | Doesn't reproduce: Tab reaches the skip link, the logo, every nav link, Download and GitHub in order on /download and /checks (new e2e test). The sweep began partway down the page (and on the dev server's wrong page).             | None. For the app: start the Tab sweep from the top of the page.                                                                                                              |
| 23  | Too many font families (3, /)                                              | The evidence is 2 families and 11 sizes. The sizes are the app's own type scale (tokens.css and the app's components), from 13 px labels to the 168 px wordmark.                                                                    | Kept, as a deliberate choice. For the app: the title says "font families" when the measurement is sizes.                                                                       |
| (s) | Suggestion: decorations overlap text (2, /checks)                          | The calm field's shapes drift behind headings.                                                                                                                                                                                      | Kept: the shapes sit behind the text, which keeps a paper halo so its contrast never drops; cards paint their own surface.                                                     |

19 fixed (rows 1–20), 4 kept with the reason (21–23 and the decorations suggestion). The fixes
are checked by the site's own tests (32 e2e, axe clean on every page at 1440 and 390 px); Fitts
hasn't re-audited the site since. Re-running `bench:audit` on apps/site (about $1) would confirm
them in Fitts's own words.

### For the app (found while auditing the site; not changed here, apps/desktop is off limits)

- `bench:audit` waits for the approval card, Done or "nothing found", but runs now end at the
  finish proposal (U3), so an audit with nothing fixable never reports.
- `bench:audit` checks Welcome for the package name, which Welcome no longer shows.
- External and download links are reported as "went to the wrong page".
- The keyboard sweep can start partway down a page and call everything above it unreachable.
- `font-inventory`'s template titles a size count "Too many font families".
- Vite projects whose config doesn't set `appType: 'mpa'` serve the home page for unknown
  addresses in dev, so a multi-page Vite site's "refresh breaks it" findings can be the dev
  server's, not the site's.

# Branch `evidence` (off site-redesign)

Three jobs, in order: a shareable run report, real open-source apps, the README for judges.

| #   | Job                                                          | Status                            |
| --- | ------------------------------------------------------------ | --------------------------------- |
| E1  | Run report: packages/run-report, the CLI, /runs/ on the site | done                              |
| E2  | Open-source apps: Bootstrap's examples and TodoMVC React     | picked; runs after the other paid run |
| E3  | README for judges                                            | Wednesday, once the numbers exist |

## E1 — The run report

- **packages/run-report** reads a run folder (events.ndjson, shots/, assets/) through the shared
  reducer (`replay` from @fitts/schema) and writes a static folder: index.html, report.css (the
  app's tokens plus the report's styles), the three fonts, the screens it shows, and meta.json.
  No scripts, nothing loaded from outside the folder.
- **What it shows**: a summary (found, fixed and verified, rolled back, spent, the math line, the
  owner's brief); what Fitts understood (the App Model summary and commit, journeys, the screens
  checked); the App Map as a static tree (each page's features, its findings linked, what was
  fixed); every shown finding with its screen and outline (close up and whole page), who flagged
  it, the Noticed lines that led to it, the evidence, the repro (start, steps with step shots,
  expected, actual, environment, WCAG, "Replayed and seen again"), the generated Playwright test,
  and the fix (Verified / Checked by review / Rolled back, with the evidence, attempts, branch,
  PR and diff); suggestions and "You said this is fine" separately; which models did what; and
  the cost of every model call.
- **Privacy**: every string goes through one scrubber (keys and tokens of the providers Fitts
  touches, labelled secrets, opaque key-like strings, absolute paths on Windows, macOS and Linux,
  file: URLs). Only the project's name, framework and brief are read from project.json (it also
  holds the folder path and could hold a saved login). The chat transcript isn't in the report.
  After writing, the folder is scanned again; any hit deletes the folder and fails the export.
  Tests plant keys, a saved login and paths in the brief, a diff, the Playwright test, a rollback
  reason, an observation, the chat and project.json, then scan every output file
  (packages/run-report/tests/export.test.ts). The site's unit tests scan every published run
  again (apps/site/tests/unit/runs.test.ts). Screenshots are images and can't be scanned: a key
  visible on the page itself would show.
- **CLI**:
  - `pnpm --filter @fitts/run-report export <run dir> <out dir> [--label "…"]`
  - `pnpm --filter @fitts/run-report site (<run dir> | --latest <project id>) --id <id> [--label "…"] [--featured]`
    exports into apps/site/public/runs/<id>/ and updates apps/site/src/content/runs.json.
- **Built against** the paid `bench:chat` run of Nov 2 (~06:55 CST, $0.193, recall 29/33),
  copied from its e2e temp profile into `.fitts-dev/runs/demo-chat/` (git-ignored, laid out like
  Fitts's data folder so the App Model and project name are found). It stopped before fixes, so
  the fix sections were also checked against Allen's Nov 1 portfolio run, exported to a scratch
  folder only (5 verified, 4 rolled back, a redesign, real diffs). That one isn't published.
- **On the site**: /runs/ lists published runs; /runs/demo-chat-nov-2/ is the export, labeled
  "Our test app, planted issues", with a bar back to the site. Home (beside the GitHub button)
  and Showcase link to the featured run: "See a real run. No install, no keys." The dev and
  preview servers serve run folders like Cloudflare Pages (308 to the slash; unknown ids 404),
  and the sitemap lists them. E2E: /runs/ and each run at 1440, 390 and 320 px, axe clean, no
  sideways scroll, no request outside the run's folder; links back; the redirect and the 404.
- **Wednesday's swap, one command** (after Allen records the Basil & Ember run on Tuesday):

  ```
  pnpm --filter @fitts/run-report site --latest basil-ember --id basil-ember --label "Real AI-built site, untouched" --featured
  ```

  `--latest` takes the project's newest run from Fitts's data folder (%APPDATA%\Fitts on
  Windows). Then `pnpm --filter @fitts/site test && pnpm --filter @fitts/site test:e2e`, look at
  /runs/basil-ember/ once, and commit. The demo run stays listed. If the project id isn't
  `basil-ember`, the folder names are under %APPDATA%\Fitts\projects\.

### For the app (found while building the report; not changed here, apps/desktop is off limits)

- **SAM outlines are saved in the box's own pixels.** Every mask in the Nov 2 run starts at 0,0
  with the box's size (f4: the box is at 571,126; the outline spans 0–80 × 0–32), so
  `outlineSvg` draws it at the page's top-left. The Finding panel hides this because it draws
  the DOM box when there is one and the mask only when there isn't. The report moves an outline
  onto its box when it fits the box but sits at the corner (`outlinePath`, tested). The fix in
  the app: offset `decodeMaskToSVGPath`'s path by the prompt box (or the mask's own origin).
- **"Export as web page"** in the Done screen's menu is a small follow-up: call `exportRun` from
  main with the run folder and a folder the user picks.
- **The bundled replay is gone** (removed in "Walkthrough feedback, round 1"). Allen: "Try it
  without keys" points at /runs/, not a replay. The README's Try it section now does, and
  Download links to /runs/ under What you need ("No key yet? See a real run."), with an e2e check.

## E2 — Open-source apps: candidates for Allen

Checked Nov 2, 2026 (GitHub API for stars, license and last push; each repo's CONTRIBUTING and
AI-related files read for an AI policy). **No paid run until Allen picks two.**

1. **Bootstrap's examples** (twbs/bootstrap, the docs site's examples: checkout, sign-in,
   sign-up, dashboard and more).
   - 175k stars, MIT, pushed Nov 2, 2026 (v6 alpha on `main`, v5 on `v5-dev`).
   - One dev server: `npm start` (watch + Astro on port 9001). No secrets or accounts. The
     install is heavy (the whole docs toolchain).
   - Real forms (checkout with validation, sign-in), but static demos: submitting does nothing
     by design.
   - AI policy: no ban. `.github/CONTRIBUTING.md` has no AI rule. The repo ships `AGENTS.md`,
     "Guidance for AI coding agents working in this repository", which asks for "ASD-STE100
     Simplified Technical English for all prose: … commit messages, and PR text" and "PR
     descriptions: direct bulleted lists, minimal fluff". Bug reports: "isolate the problem",
     check against the latest `main`, "a live example".
2. **TodoMVC's React app** (tastejs/todomvc, `examples/react`).
   - 29k stars, MIT ("Everything in this repo is MIT License unless otherwise specified"); repo
     pushed Jun 6, 2026, examples/react last changed May 3, 2026.
   - One dev server: `npm install && npm run dev` in examples/react. localStorage, no backend.
   - One input and a list: add, edit (double-click), toggle, filter, clear completed. Real
     flows, thin forms.
   - AI policy: no ban. `contributing.md`: "We're happy to accept contributions in the form of
     new apps, bug fixes, issues and so on." Nothing on AI.
3. **RealWorld Conduit, Angular** (realworld-apps/angular-realworld-example-app). The React
   Conduit (gothinkster/react-redux-realworld-example-app) is archived.
   - 5.6k stars, MIT, pushed Nov 2, 2026.
   - **Fails "no external accounts", strictly.** One dev server (`bun run setup && bun run
     start`, needs Bun), but it talks to the public demo API (api.realworld.show): signing up,
     posting and commenting write to a shared public server and need an account there. Logged
     out it's a read-only blog.
   - The richest flows: sign up, sign in, settings, editor, comments, follow, favorite, pages.
   - AI policy: no CONTRIBUTING in the repo and no AI rule; the org's realworld-apps/realworld
     CONTRIBUTING has none either. Both repos ship a `CLAUDE.md`.

**Allen's pick (Nov 2): Bootstrap's examples and TodoMVC's React app**, not RealWorld (it writes
to a shared public API). Runs start only once the other session's paid run has ended and memory
has room.

**My recommendation was the same: Bootstrap's examples and TodoMVC's React app.** Both meet every criterion
as written. Conduit has the best flows, but only with an account on a public server, and Fitts
would be writing test content there (its gate holds writes, so the logged-in half would mostly go
untested). If Allen wants Conduit anyway, I'd run it logged out and say so in the report. For
Bootstrap I'd clone at the latest v5 tag (what people use) unless Allen prefers v6 `main`.

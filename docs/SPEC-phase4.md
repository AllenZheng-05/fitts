# Fitts — Phase 4 build spec: Fitts understands

Version 1.2 · Nov 1, 2026 (1.1: §6A action log, §6B detect more; 1.2: Muse Code without login) · Owner: Allen Zheng
Builds on `docs/SPEC-phase3.md` (as built through commit `f0104f3`: one run branch, one PR,
self-repairing fixes), `docs/SPEC-phase2.md` and `docs/DECISIONS.md`. Where this spec is silent,
Phase 3, then Phase 2, then DECISIONS, then Phase 1 apply. Where they disagree, this spec wins.

Deadline: submissions close **Wed Nov 4, 9:00 PM ET**. Feature freeze **Tue Nov 3, 6:00 PM ET**
so the video can be recorded. Milestones are ordered by demo value; if time runs out, cut from
the top of §13's cut list, never from its "never cut" list.

---

## 0. Goal, what already exists, definition of done

### 0.1 Goal

Phase 3 made Fitts decide. Phase 4 makes Fitts **understand** the project and **defer to its
owner**:

1. **It reads the code, not just the screen.** Before and while it crawls, Fitts builds an
   *App Model* of the project from its source: pages, features, user journeys, forms, API calls,
   auth gates, design tokens, tests, and which file renders what. The crawl, the review, the
   repro and the fixer all use it.
2. **It tests journeys, not just controls.** Coverage is measured against what the code says
   exists (pages, features, journeys), at every screen size the site's own CSS cares about.
3. **Every finding can be reproduced by a person.** Start state, numbered minimal steps,
   expected vs actual, environment, the file and line, a WCAG/axe link, and a copyable
   Playwright test.
4. **The owner decides.** Fitts proposes when it thinks it's done; only the owner ends a run.
   The owner's judgment of what is and isn't a problem outranks Fitts's, and is remembered.
5. **The App Map.** Done (and the audit's site map) shows the whole app as a tree: every page,
   what it does, what Fitts found there, and what it fixed or proposes.
6. **Android.** Fitts audits and fixes an Android app (Expo/React Native on the emulator) with
   the same loop: understand, explore, probe, review, repro, fix, verify, PR.
7. **Fitts says what it notices, as it notices it.** Every action in the chat shows how long
   the site took to respond and what Fitts noticed ("Tapped NEXT · nothing on screen for 1.2 s",
   "Noticed the banner jumped 180 px with no tap", "Noticed the timestamp is hard to read").
   The same log feeds Fitts's own decisions, the reviewers and the repros.
8. **It detects much more.** Every WCAG A/AA rule axe can check, keyboard access, every state of
   a page (not just its first load), wrong destinations and redirects, things that pop up or
   move unprompted, empty/error/slow states forced through the site's own API, and load times
   measured like a real phone on a real network.

### 0.2 What already exists (build on it, don't rebuild it)

| Capability | Where it is today | What Phase 4 changes |
|---|---|---|
| Source stamping `data-fitts-src="file:line:col"` on host JSX, dev only | `packages/vite-plugin/src/index.ts`; injected without touching the repo by `main/projects/fitts-config.ts` (wrapper config in `node_modules/.fitts/`) | U1: stamps HTML/SVG only (today it also stamps R3F/three.js lowercase tags), adds call-site stamps for components, a component chain, non-Vite and non-React fallbacks |
| Finding → source (`source.confidence: 'plugin'`) | `agent/review/aggregate.ts` `sourceOf()` (probe items only); probe reads `closest('[data-fitts-src]')` in `packages/probes/src/page.ts` | U1/U2: every finding gets a source, including reviewer-only ones (`'search'` and `'model'` confidence), plus the component chain |
| Project detection: framework, dev command, port, git remote, gh auth, plugin | `main/projects/detect.ts` | U2: becomes the first half of the App Model |
| The project's CI checks and tests | `main/fix/ci.ts`, `pipeline.ts` `baselineChecks()` | U2: listed in the App Model; unchanged otherwise |
| Brief with `flows` and `outOfScope` | `agent/interview/interview.ts`, `Brief` in schema | U3: `flows` picks journeys, `outOfScope` skips them (today both are only passed as JSON text) |
| Control-coverage crawl (every primary control per page), template dedupe (`/team/:id`), stall rules | `agent/crawler/coverage.ts`, `brain.ts` (`SparkBrain` picks one untried control, no screenshot, minimal reasoning) | U3: seeded from the App Model; journeys run first; control coverage mops up |
| Site map list with status dots and issue counts | `renderer/features/audit/SiteMap.tsx`, `RunState.routes` | U7: becomes a tree that includes pages known from code but not reached |
| Device sizes: `DEVICES` (1440, 1280, 820, 390, 360), `site.device()`, `viewportSweep()` at 360/768/1280, one phone pass on up to 8 pages | `packages/schema` `DEVICES`, `main/site/site-window.ts`, `run.ts` `phonePass()` | U5: a device matrix from the site's own breakpoints plus WCAG reflow, zoom, text spacing, orientation and media preferences |
| Phone-only findings are **not** fixable (`fixable()` excludes `check.device`) | `agent/fix/pipeline.ts` | U6: verified at their device, so they're fixable |
| Trace findings (feedback timing, back mid-flow, errors, network, labels) are **not** fixable | `pipeline.ts` `VERIFIABLE` | U6: verified by replaying their repro steps |
| Replay: up to 8 crawl step labels with step shots; "Show me on the site"; Finding panel tabs Preview / How I found it / Evidence; SAM outline and zoom | `run.ts` `withReplay()`, `renderer/features/finding-panel/*` | U4: a real repro (start state, minimal steps, expected/actual, environment, WCAG, file:line, Playwright test) |
| PR body "Repro" line: "Open {route} and find the element `{ref}`" | `pipeline.ts` `fixSection()` | U4: the full repro |
| Exported report | `renderer/lib/report.ts` | U4/U7: repro per finding, the App Map as nested lists, the coverage report |
| Decider, abilities, guarantees in `use()`; `finish` ends the run when coverage and checks are done; fixes settling end the run (`fixesSettled()`); "nothing found" card | `orchestrator/run.ts`, `abilities.ts`, `decider.ts`, `docs/prompts/decide.md` | U3: `finish` becomes `propose_finish`; only the owner ends a run |
| Dismiss / reopen a finding; `dismiss` ability on "that's not a problem" while pointing | `run.ts`, `RunEngine.dismissFinding/reopenFinding` | U3: dismiss with a reason, remembered per project and applied to later runs |
| Owner's look always wins: rounds of style boards, final review, "Send it back" | Phase 3 Q2/Q3 | unchanged; the memory records liked/disliked directions |
| Fixer: in-process Muse tool loop with `read_file`, `search`, `apply_patch`, `run_check`; up to 3 repair passes; one branch; one PR | `agent/fix/fixer.ts`, `pipeline.ts`, `main/fix/fix-host.ts` | U6: App Model context, more tools, an edit allowlist enforced in main, Muse Code as the primary fixer when logged in |
| Muse Code `muse exec` checked (V6) but not wired for fixes | `scripts/verify/v6-muse.ts`, NEEDS-ALLEN 8 | U6: wired, with the in-process fixer as fallback |
| Tabs in the mirror; the gate (CDP Fetch); modes; budget; voice; replay mode; live-site verification | Phase 2/3 | unchanged |
| GitHub sign-in (device flow, token API PRs, `gh` fallback) | `main/github/*`; `GITHUB_CLIENT_ID = ''` | U0: nothing to build; registering the app is NEEDS-ALLEN |
| Per-action feedback trace: `firstChangeMs`, `busyMs`, text added, live-region text, `moved` (scroll/focus/dialog), generic error text; requests with timing, status, bytes | `packages/probes/src/analyze.ts` `Feedback`, `RequestRecord`, `ActionTrace`; `agent/protocol.ts` `OpTrace` | U5b: shown in the chat for every action, and fed to the brain, decider and reviewers (today only `feedbackTiming()` reads it, and the chat shows "Tapped X") |
| Chat "steps" group: one label per action, grouped, last 200 | `run.ts` `logAction()`, `ChatItem` `steps` | U5b: timings, "Noticed …" lines, links to findings, a detail setting |
| axe-core | `packages/probes/src/page.ts` `AXE_RULES = ['color-contrast', 'button-name', 'link-name']` (3 rules) | U5c: every WCAG 2.0/2.1/2.2 A and AA rule plus best practices |
| Keyboard | `focusSweep()` (focus indication only) | U5c: reachability, traps, order, dialogs, obscured focus |
| What the reviewers see | one screenshot per route, taken on the first visit (`run.ts` `remember()`) | U5c: every distinct state (dialog open, error shown, each journey step) |
| Load and responsiveness | `web-vitals` probe: LCP and CLS on first load only, on the local dev server; slow requests after a click without a loading indicator | U5c: throttled, production-build measurement; INP; page-change time; long tasks; page weight; layout-shift sources |
| Links and navigation | `links` probe: HEAD status of same-origin links; off-site links open in tabs | U5c: expected vs actual destination, redirect chains and loops, unexpected login redirects, refresh/deep-link checks, soft 404s, Back after a redirect |
| Unprompted changes | none (CLS ignores shifts after input; nothing watches for overlays, focus theft, moving targets) | U5c: the surprise detector |
| Empty, error and loading states | only when the crawl happens to hit them | U5c: forced through CDP Fetch on the site's own GET requests (localhost only) |
| Console errors | not captured | U5b: captured per action and shown |
| "Allow microphone" chip | `renderer/features/welcome/Welcome.tsx` only sets `settings.micAllowed`; no OS prompt; `electron-builder.yml` has no `NSMicrophoneUsageDescription` | U0: a real permission request |
| Folder access | `dialog.showOpenDialog` in `main/bridge.ts`; nothing explains that Fitts will read the code | U0: a consent line and macOS usage strings |

### 0.3 Phase 4 is done when

1. **demo/chat:** a run in Ask-when-unsure shows the App Model card before the audit (8 pages,
   the features of each, at least 4 journeys including "Send a message to Grandma");
   `pnpm bench:chat` recall ≥ Phase 3's and ≤ 2 false positives at severity ≥ 2; journey
   coverage is printed and is 100% of reachable journeys.
2. **Every shown finding** on demo/chat has a source file and line, numbered steps, expected and
   actual, an environment, and (for probe and trace findings) steps that were replayed and
   confirmed. Each copied Playwright test runs green against the *fixed* branch and red against
   `main` for at least 5 findings (checked by hand once, recorded in DECISIONS).
3. **The owner ends runs.** No path but the owner's Finish (or Stop, or the budget card's Stop)
   ends a run; a hostile-decider test proves it. A dismissal with "Intentional" on run 1 keeps
   that finding out of run 2's shown lane (it's listed under "You said this is fine").
4. **Device matrix:** on demo/chat the matrix includes the site's own breakpoints, 320px reflow,
   200% text and text spacing; a phone-only finding is fixed and verified at phone size.
5. **App Map:** Done shows the tree; every page node opens to its features, journeys, findings
   and fixes; pages known from code but never reached show why. Keyboard and axe checks pass.
6. **Android:** on `demo/android-chat` (Expo) in the emulator, Fitts finds ≥ 6 of its 8 planted
   issues, shows them on the phone canvas, and verifies at least 2 fixes on the run branch.
7. **The action log:** on demo/chat every action line in the chat shows its response time; the
   planted slow search (#13) shows "nothing on screen for 1.5 s" on the step that caused it;
   each shown finding links back to the "Noticed" lines that support it.
8. **Detection breadth:** demo/chat gains planted issues #26–#33 (§6B.8) and Fitts finds at least
   6 of the 8, with `bench:chat` recall over all 33 ≥ 80%.
9. Typecheck, lint, unit and e2e are green; the bundled replay is re-recorded with Phase 4.

---

## 1. The new run, end to end

```
Open project ──► UNDERSTAND (background, starts at open; cached by commit)
                     │  App Model + project summary
Interview ◄──────────┘  (Fitts asks smarter questions from the App Model)
   │
   ▼
CONFIRM MAP  (card: "Here's what I understand": pages, features, journeys; owner edits)
   │
   ▼
loop: decider picks ──► journey(id) · explore(route?) · device_pass · check_links ·
      state_pass · perf_pass · review · check_theme · looks · fix · report_issue ·
      skip_pages · … · propose_finish
   │      every action → an ActionRecord (timings, requests, console, observations)
   │      → the chat's "steps" lines + "Noticed …" lines, the brain, the decider, the reviewers
   │      the surprise detector and navigation checks run during every action
   │
   ▼
REPRO (per shown finding: minimize, replay, confirm, write Playwright)   ← runs in background
   │
   ▼
TRIAGE (approval card grouped by root cause; dismiss with reason → memory)
   │
   ▼
FIX (code-aware fixer, allowlist, device/trace verification, ≤3 repairs)
   │
   ▼
PROPOSE FINISH (card: coverage, unreached + why, open/unfixed, the PR draft)
   │  owner: Finish ──► FINALIZE (the run's PR) ──► DONE (App Map)
   └─ owner: Keep going / Fix the rest / says what next ──► back to the loop
```

What's new in the loop vs Phase 3: `understand` (runs before the loop, see §3), `journey`,
`device_pass` (replaces `phone_pass`), `state_pass` and `perf_pass` (§6B), `report_issue`,
`propose_finish` (replaces `finish`). `propose_finish` also requires `state_pass` and
`perf_pass` to have run on a local project (`perf_pass` only on a live site).

---

## 2. U1 — The source plugin, v2

### 2.1 Problems with v1 (all in `packages/vite-plugin/src/index.ts`)

1. **It stamps any lowercase JSX tag.** `<mesh>`, `<boxGeometry>` and other
   react-three-fiber elements get `data-fitts-src`; R3F treats dashed props as pierced paths
   (`data.fitts.src`) on THREE objects. Allen's portfolio has a three.js hero.
2. **Only host elements.** A `<button>` inside `components/Button.tsx` says
   `Button.tsx:12` for every button on the site. The fixer needs the *call site* (`Compose.tsx:118`
   where `<Button>` was used) and the chain between them.
3. **Vite + React only.** Next.js (the most common framework), SvelteKit, Vue and Astro get
   nothing, and the aggregator has no lower-confidence fallback for them.
4. **Only probe items carry `src`.** Reviewer-only findings have no source at all.

### 2.2 What v2 does

**Build-time stamps (Vite + React, as today, plus):**
- Stamp only known HTML and SVG element names (a static allowlist exported as
  `HTML_TAGS`/`SVG_TAGS` in the plugin; no new dependency). Unknown lowercase tags are skipped.
- Also stamp **component elements** (capitalized and member-expression tags like `<Button>`,
  `<motion.div>`, `<Foo.Bar>`) with the same `data-fitts-src` prop. It reaches the DOM only when
  the component forwards props, which is fine; it's always present in the component fiber's
  `memoizedProps`, which is what §2.3 reads.
- Skip any element inside a JSX subtree whose root is `<Canvas>` imported from
  `@react-three/fiber` (track the import's local name per file).
- Skip a component element when the file opts out with a `// fitts-ignore-file` comment.
- Keep `apply: 'serve'` and `enforce: 'pre'`; a build must contain no stamps (existing test).

**Runtime component chain (new, main world, read-only):** `SiteWindow.sourceOf(ref)` runs one
function in the page's *main* world with `Runtime.callFunctionOn` on the node (isolated worlds
can't see React's expando properties). It returns, nearest first, at most 8 entries:

```ts
interface SourceFrame { component?: string; src?: string; kind: 'host' | 'call' | 'debug' }
```

- React: find the `__reactFiber$*` key on the node, walk `fiber.return`. For each function or
  class component fiber, take its name (`type.displayName ?? type.name`) and
  `memoizedProps['data-fitts-src']` (the call site). Without the plugin, use the React 19
  `_debugStack` string's first frame that isn't `node_modules` (`kind: 'debug'`, a URL:line; main
  maps the URL to a project file by its path after the dev server's origin, best effort).
- Svelte 5 dev: `node.__svelte_meta.loc` (`{ file, line, column }`).
- Vue 3 dev: `node.__vueParentComponent?.type.__file` (file only).
- Anything returned is untrusted page data: it's a hint, never a command, and the fixer
  re-reads the file before using it.

**Confidence ladder** on `Finding.source` (schema: add `'model'` and keep the others):
`plugin` (a `data-fitts-src` from build time) > `source-map` (`_debugStack`/Svelte/Vue
runtime) > `search` (text search) > `model` (the App Model's route → component map, §3).
The Finding panel shows it as today ("High · Fitts plugin", "Medium · code search", and
"Low · from the code map").

**Every finding gets a source.** After aggregation, `run.ts` resolves sources for findings
without one: element ref → `sourceOf` → chain; no element → the route's component file from the
App Model; then text search through fix-host's `search` (visible text, aria-label, the finding's
quoted evidence). Store the chain on the finding: `Finding.sourceChain?: SourceFrame[]`.

### 2.3 Non-Vite projects

- Next.js / webpack / Turbopack: no build-time injection in Phase 4 (the wrapper trick doesn't
  apply). The runtime chain (`_debugStack`) plus the App Model's route map gives `source-map` or
  `model` confidence. Record that in DECISIONS.
- Expo / React Native (§9): the Metro equivalent is out of scope; Android findings use `testID`
  → search, then the App Model.

### 2.4 Tests

Plugin unit tests: R3F subtree untouched; `<mesh>` outside a Canvas untouched (not in the
allowlist); `<Button>` gets a call-site stamp; `<motion.div>` gets one; a file with
`fitts-ignore-file` is untouched; build output has no stamps. Probe fixture test (real Chromium,
`tests/e2e/probes.spec.ts`): a React fixture page returns a chain `[host Button.tsx:12, call
Compose.tsx:118, call ComposePage …]`.

---

## 3. U2 — Understand: the App Model

### 3.1 What it is

One JSON document per project per commit, in `packages/schema` as `AppModel`:

```ts
interface AppModel {
  version: 1;
  projectId: string;
  commit: string;               // HEAD sha; "+dirty" when the tree has changes
  kind: 'web' | 'android';
  stack: {
    framework: string;           // from detect.ts
    language: 'ts' | 'js' | 'mixed';
    styling: string[];           // 'tailwind' | 'css-modules' | 'styled-components' | 'css' | …
    router: string;              // 'next-app' | 'next-pages' | 'react-router' | 'tanstack' | 'sveltekit' | 'astro' | 'expo-router' | 'react-navigation' | 'unknown'
    ui: string[];                // component libraries found (shadcn, MUI, Chakra, …)
    tests: string[];             // test runners; CI checks come from ci.ts
  };
  summary: string;               // 3–6 sentences: what the app is and how it's built
  pages: AppPage[];
  journeys: Journey[];
  tokens: { file: string; kind: 'css-vars' | 'tailwind' | 'theme-object'; names: string[] }[];
  apis: { method: string; path: string; file: string; line: number; usedBy: string[] }[];
  breakpoints: number[];         // from tailwind screens / CSS media queries in source (U5 adds runtime ones)
  media: { darkMode: boolean; reducedMotion: boolean };
  sensitive: string[];           // files the fixer may not touch without asking (§7.3)
  notes: string[];               // anything the model wants the owner to confirm
}

interface AppPage {
  route: string;                 // "/compose", "/team/:id"
  file?: string;                 // the route/screen component file
  source: 'code' | 'crawl' | 'both';
  title?: string;
  features: { id: string; name: string; description: string; files: string[] }[];
  forms: { name: string; fields: { name: string; type: string; required: boolean; rule?: string }[]; submit?: string; file: string; line: number }[];
  gate?: 'login' | 'role' | 'flag' | 'data';   // why a crawler might not reach it
  dynamic?: { param: string; example?: string };
  layout?: string;               // the layout file(s) wrapping it
}

interface Journey {
  id: string;
  name: string;                  // "Send a message to Grandma"
  goal: string;                  // what done looks like, checkable on the page
  start: string;                 // route
  steps: string[];               // plain-language plan, 2–10 steps
  pages: string[];               // routes it passes through
  priority: 1 | 2 | 3;           // 1 = from the brief's flows or the app's core purpose
  needs?: ('login' | 'data' | 'payment' | 'email')[];
  source: 'code' | 'brief' | 'owner' | 'crawl';
}
```

### 3.2 How it's built (two passes, both in the background when a project opens)

**Pass 1 — deterministic extractor** (`main/understand/extract.ts`, no network, ≤ 5 s on a
1,000-file repo; uses `@babel/parser`, already a dependency of the plugin, and `fast-glob`):
- Routes: Next `app/**/page.{tsx,jsx,ts,js}` and `pages/**` (skip `_app`, `_document`, `api/`);
  SvelteKit `src/routes/**/+page.svelte`; Astro `src/pages/**`; Expo Router `app/**`;
  react-router: `createBrowserRouter([...])`, `<Route path element>`, `useRoutes`, resolving
  `element`/`Component`/`lazy` imports to files; TanStack file routes `src/routes/**`.
- Forms: JSX `<form>`, inputs inside it (name, type, required, pattern, min/max), `onSubmit`
  handler name; `useForm` + zod schema field names when in the same file.
- API calls: `fetch(`, `axios.*(`, `useQuery`, `ky`, tRPC procedure names; Next `route.ts`,
  SvelteKit `+server.ts`, Vite middleware in `vite.config` (`configureServer`).
- Gates: `middleware.ts` matchers, `redirect('/login')`, `<Navigate to="/login">`,
  `if (!session)` patterns near returns → `gate: 'login'`.
- Tokens: `:root { --x: … }` files, `tailwind.config.*` `theme`/`extend`, `@theme` blocks
  (Tailwind 4), a `theme.ts` exporting colors.
- Breakpoints and media: Tailwind `screens` (defaults when not overridden), `@media
  (min|max-width: Npx)` in source CSS, `prefers-color-scheme`, `prefers-reduced-motion`.
- Sensitive files: lockfiles, `.env*`, `.github/**`, `middleware.ts`, auth and API handler
  files found above, `package.json` (dependency edits).

**Pass 2 — the model** (`agent/understand/understand.ts`, task `understand`, cost phase
`crawling`): given Pass 1's JSON, the README, the package.json, a repo map (below) and the files
of each route component (up to a token cap), it writes `summary`, each page's `features`, the
`journeys`, `title`s and `notes`. One structured-output call on `muse-spark-1.3` with
reasoning `medium` (Spark's 1M context makes this one call for any repo under the cap), with a
JSON schema. When Muse Code is ready (§7.4: installed; it authenticates with the owner's Meta
key through `--api-key-stdin`, no `muse login`), run it instead as
`muse exec --json --approval-mode never --sandbox-network restricted --max-model-steps 30
--api-key-stdin --prompt-file understand.md` in a read-only worktree, told to write `app-model.json`; parse,
then validate the same way.

- **Repo map** (`main/understand/repomap.ts`): every source file's exports, its default export's
  name, and its imports, ranked by in-degree (imported-by count) — a small PageRank over the
  import graph is fine, 20 iterations. Render the top files under a 6k-token budget. No
  tree-sitter dependency: Babel parses TS/JS; Svelte/Vue/Astro get file names only.
- **Token cap**: 250k input tokens (≈ $0.31 on Spark). Over it, send the repo map plus route
  files only. The pre-run estimate (Phase 2 §11) includes this call.
- **Validation** (deterministic, in the agent): drop features whose `files` don't exist; mark
  pages the model invented (not in Pass 1) `source: 'code'` only if their file exists, else
  drop; journeys may only reference known routes; at least one journey per page with a form.
  Anything dropped goes into `notes` as "I couldn't confirm …".
- **Cache**: `userData/projects/<id>/app-model/<commit>.json`. A dirty tree re-runs Pass 1
  always and Pass 2 only for changed route files (merge by route).
- **Never written into the user's repo.** The project summary is also kept as
  `userData/projects/<id>/FITTS.md` and passed to Muse Code via the prompt file.

### 3.3 The owner sees it and corrects it

- **During the interview** the model gets the App Model's summary, page list and journeys
  (`docs/prompts/interview.md` gains a section). It asks better questions ("I can see a
  checkout and an admin area. Which matters most?") and offers the journeys as quick replies
  for `flows`. Interview latency: if Pass 2 isn't done, it uses Pass 1 alone.
- **Before the audit starts** a new chat item `{ type: 'understanding' }` shows: the summary,
  "N pages · M features · K journeys", the journeys in priority order (each with a checkbox,
  on by default except priority 3), pages with gates ("needs a login"), and the notes. Buttons:
  "Looks right" and "Change something" (prefills the composer). Answers go through
  `answerQuestion` and `sendMessage`. An owner message here edits the model: the `converse`
  call returns a patch (`{ addJourney?, dropJourney?, outOfScope?, priority? }`) applied in the
  agent and saved with `source: 'owner'`. Owner edits survive cache refreshes.
- Journeys the owner unchecks become `outOfScope` in the brief.

### 3.4 Tests

Extractor unit tests on fixture repos in `apps/desktop/tests/fixtures/repos/`:
`react-router-vite` (demo/chat itself), `next-app`, `sveltekit`, `expo-router` (minimal, a few
files each). Validation unit tests (invented files dropped, invented routes dropped). The Pass 2
call is a recorded fixture (`tests/fixtures/llm/understand-demo-chat.json`).

---

## 4. U3 — Owner first: proposing, not finishing; memory

### 4.1 `propose_finish` replaces `finish`

- `AbilityName`: remove `finish`, add `propose_finish`. The decider prompt and the scripted
  order change accordingly.
- `propose_finish` keeps today's `finish` preconditions (crawl ended or coverage complete;
  `device_pass`, `check_links`, `review` have run; no fix running or awaiting approval). When they
  hold, it posts a `{ type: 'finish-proposal' }` chat item and sets
  `waitingFor: 'finish-proposal'`, `activity: 'waiting-on-user'`. It never calls `finish()`.
- The card shows: pages reached / known from code; journeys done / planned (failed ones with
  why); device cells run; findings shown, fixed, rolled back, open; what's *not* covered and
  why (login, needs data, out of scope, owner skipped, unreachable from any link); the PR title
  and how many commits are on the branch. Buttons: **Finish** (primary), **Fix the rest**
  (only when open fixable findings remain), **Keep going** (prefills "Keep going: ").
- **Finish** → `finish()` → `pipeline.finalize()` (opens the PR) → `end()`. This is the only
  path to Done other than Stop (`stopRun` → confirm) and the budget card's Stop.
- **Fix the rest** → `approveFixes(all open fixable)`.
- **Keep going** or any message → the decider gets it (as today) and the card closes
  (`answer: 'continue'`).
- `fixesSettled()` no longer calls `finish()`; it calls `propose_finish` through the loop
  (a nudge). `crawlComplete()`'s "nothing found" card merges into the proposal ("I didn't find
  anything worth showing" + the same buttons).
- In Autonomous and Dangerous, the proposal still waits. Fitts sends the existing OS
  notification ("Fitts thinks it's done. Have a look?"). Runs never end unattended.
- Fix `run.ts`'s Autonomous line: "Each one is checked before its pull request opens" →
  "Each one is checked before it goes on the run's branch."
- **Guarantee test**: a hostile decider that only ever returns `propose_finish` or unknown tools
  can't reach `phase: 'done'` without an `answerQuestion(…, 'finish')`.

### 4.2 The owner's judgment outranks Fitts's

- **Dismiss with a reason.** `RunEngine.dismissFinding(projectId, findingId, reason?)` (an
  optional parameter, not a new method). The Finding panel's Dismiss becomes a menu:
  "Intentional", "Not a problem for my audience", "Won't fix", "Fitts got it wrong", or a typed
  reason. Saying "that's not a problem" while pointing still works (`dismiss` ability, reason
  "Fitts got it wrong").
- **Report an issue.** New ability `report_issue({ ref?, route, text })`: the owner says
  "this is a problem" or "the checkout is confusing" (pointing or not). Fitts creates a finding
  with `agreement.who: ['You']`, lane `shown`, severity from the owner's words (default 3),
  investigates it (screenshot, the element's source chain, the reviewers' opinion as *notes*,
  never a veto) and builds a repro (§5). Owner findings are always shown and always offered for
  fixing.
- **Severity override.** "This matters more/less" in the Finding panel (two small buttons) sets
  `severity` ±1 and records it.
- **Disagreeing.** When Fitts thinks the owner is wrong (a dismissed WCAG failure, for example),
  it may say so once, in one sentence, with the reason ("This fails WCAG 1.4.3, which matters
  for low-vision users. I'll leave it as you said."), then does what the owner said.

### 4.3 Project memory

`userData/projects/<id>/memory.json`, written by main (`main/store/memory.ts`), read by the
agent at run start, and shown in Settings › Projects › "What Fitts remembers" (list, delete one,
clear all):

```ts
interface ProjectMemory {
  rules: {
    id: string;
    kind: 'not-a-problem' | 'is-a-problem' | 'severity';
    match: { probe?: ProbeName; titleKey?: string; route?: string; src?: string; text?: string };
    reason: string;                // the owner's words or the menu choice
    delta?: 1 | -1;                // severity rules
    at: string; runId: string;
  }[];
  likes: string[];                 // design and wording preferences in the owner's words
  dislikes: string[];              // "Nothing cutesy" from the brief's avoid, picked/rejected looks
}
```

- A dismissal makes a `not-a-problem` rule matching the finding's `probe|title` key (and
  `route`/`src` when the finding is element-specific). An owner finding makes `is-a-problem`.
- **Applying it:** the aggregator moves matching findings to a new lane `owner-ok`
  (`Finding.lane` gains `'owner-ok'`): not posted, not pinned, not fixed, counted on Done and
  listed under "You said this is fine" with the reason, one click to reopen. Reviewer prompts
  get the rules as calibration ("The owner has said these are not problems here: …; the owner
  cares about: …"). The decider sees a one-line summary.
- **Never silent:** the run's first message says how many remembered rules apply ("I remember
  3 things you told me last time.").

### 4.4 Ask less, at the right moments

Questions are batched at three checkpoints: the understanding card, the triage (approval)
card, and the finish proposal. Between them Fitts acts on anything reversible (crawl, probe,
review, draft fixes on the run branch in Autonomous). The existing per-action questions (Ask
every action, the gate, budget, login) stay.

### 4.5 Tests

Unit: propose_finish preconditions; hostile decider; fixesSettled proposes instead of
finishing; memory rule matching (probe key, route, src); owner-ok lane; owner findings always
shown. E2E: the proposal card renders, Finish leads to Done, Keep going returns to acting;
Dismiss menu writes a rule and run 2 (recorded fixtures) lists it under "You said this is fine".

---

## 5. U4 — Findings anyone can reproduce

### 5.1 The repro on every shown finding

Schema (`Finding.repro?`):

```ts
interface Repro {
  start: { url: string; device: string; auth?: 'logged-in'; data?: string };
  steps: { n: number; text: string; route: string; target?: { role: string; name: string; testId?: string }; shot?: number }[];
  expected: string;
  actual: string;
  environment: string;            // "Chromium 140 · 390×844 · touch · light · 100%"
  confirmed: 'replayed' | 'observed' | 'owner';   // replayed = steps re-run and the problem seen again
  wcag?: { sc: string; name: string; url: string }[];
  rule?: { id: string; url: string };             // axe rule, when an axe probe found it
  playwright?: string;            // a runnable test (web), or maestro?: string (Android)
}
```

- **Steps** come from the journey or crawl trail (`run.ts` `trail`, now with `target` role,
  name and `data-testid`), not from step labels alone. Text is imperative and names what a person
  sees: "Tap **NEXT**", "Type anything in **Message**", "Go back with the browser's Back button".
- **Expected / actual**: probe templates in `aggregate.ts` gain both lines (contrast:
  "Text contrast of at least 4.5:1" / "2.6:1 (#BBB on #FFF)"). Reviewer drafts gain `expected`,
  `actual` and `steps` fields (`FINDING_DRAFTS_FORMAT`, `docs/prompts/reviewers/_shared.md`).
- **WCAG and axe links**: a static table in `packages/probes/src/standards.ts` mapping each
  probe and axe rule id to success criteria (e.g. contrast → 1.4.3; target-size → 2.5.8;
  focus-visible → 2.4.7; button-name → 4.1.2; viewport-sweep → 1.4.10; text-spacing → 1.4.12;
  resize-text → 1.4.4; orientation → 1.3.4) with w3.org Understanding URLs and Deque rule URLs.
- **Environment**: from the device cell (§6) and the site window's UA.

### 5.2 Minimizing and confirming

A background job after review (`agent/repro/repro.ts`, top 20 shown findings by severity,
re-run for owner findings when created):
1. **Prune**: start from the last navigation to the finding's route when that route loads
   directly (no gate, not dynamic); drop steps on other pages before it; drop steps on the same
   page that touched none of the finding's element, its form, or a field it depends on.
2. **Replay** on a hidden *replayer* window (a second offscreen `SiteWindow` on the same dev
   server, same partition as the project's site so logins carry, no frames streamed), at the
   finding's device cell, then run the finding's oracle: its probe (and item key), or for trace
   findings the trace check (feedback timing, back-mid-flow state, error text). Seen again →
   `confirmed: 'replayed'`.
3. **ddmin** (one pass, ≤ 8 replays): if pruned steps don't reproduce, fall back to the full
   trail; if they do, try removing halves, then single steps.
4. Reviewer-only findings can't be replayed without an oracle: `confirmed: 'observed'`, steps
   are the pruned trail. Owner findings: `'owner'`.
- The replayer never touches the live view, holds destructive writes like the main window
  (the gate), and is closed after the job.

### 5.3 The Playwright test

`agent/repro/playwright.ts` writes a self-contained `@playwright/test` file per finding:
- Locators: `getByTestId` when there's a test id; else `getByRole(role, { name })`; else
  `getByText`; else a CSS selector from the probe item.
- Viewport, `isMobile`, `hasTouch`, `colorScheme`, `reducedMotion` from the device cell.
- An assertion where the oracle has one: contrast via `evaluate` of computed colors (helper
  inlined), bounding box ≥ 24×24, text not matching `/\(null\)|undefined|NaN/`, response
  status < 400 for links, `aria-label` present, a visible status within 1 s after submit. Else a
  `// Expected: … Actual: …` comment and `test.fixme`.
- Fitts doesn't run Playwright (no bundled browsers). The file is copyable and goes into the
  report. Android gets a Maestro YAML flow instead (§9).

### 5.4 Where it shows

- **Finding panel**: a new first tab **"See it yourself"**: start (URL + device chip),
  numbered steps with each step's shot thumbnail (from `runs/<runId>/shots`), expected vs actual
  side by side, the environment, the source (file:line, the component chain collapsed, "Open in
  editor" via `vscode://file/<abs path>:<line>` through `shell.openExternal`), WCAG/axe links,
  "Copy steps", "Copy Playwright test", and the existing "Show me on the site". A "Replayed and
  seen again" chip when `confirmed: 'replayed'`.
- **"How I found it"** stays (the full trail).
- **PR body** (`fixSection`): Repro becomes the numbered steps, expected/actual, environment,
  and the Playwright test in a collapsed `<details>`.
- **Report** (`lib/report.ts`): the same per finding.

### 5.5 Tests

Unit: pruning (navigation-aware), ddmin with a fake oracle, Playwright text for each oracle
kind (snapshot tests), standards table coverage (every `ProbeName` mapped or explicitly
`null`). E2E: the "See it yourself" tab on a fixture finding; replay on demo/chat confirms the
"(null)" finding in ≤ 3 steps from `/compose/recipient`.

---

## 6. U5 — Journeys, complete coverage and the device matrix

### 6.1 Journeys (new ability `journey(id)`)

- The decider (and the scripted order) runs priority-1 journeys first, then priority 2, then
  `explore` for control coverage, then priority 3 if budget allows.
- `agent/crawler/journey.ts` runs one journey: each step, Spark (`muse-spark-1.3`, reasoning
  `low`, **with the screenshot**) gets the journey's goal and plan, the steps so far, the
  page's AX snapshot (untrusted-wrapped) and returns one action (click/type/navigate/back) or
  `goal_met` / `blocked(reason)`. Max 15 actions. The coverage gate, the gate, modes,
  `mayAct`, `perform()` and probes after each action are the same as explore's (reuse
  `perform`). Typing uses form rules from the App Model: one valid value per field, and once per
  form an invalid value (`required` empty, wrong `type`, pattern miss) to test error handling.
- Journey outcome event `journey.updated { id, status: 'running' | 'done' | 'failed' | 'blocked', reason?, steps }`.
  A failed journey (goal not met in 15 actions, an error, a dead end) is itself evidence for
  the reviewers ("Fitts couldn't send a message in 15 steps") and becomes a finding when the
  panel agrees or a probe measured something on the way.
- Journey traces are the preferred source of repro steps (§5).

### 6.2 Coverage from the code

- `Coverage` is seeded with the App Model's static routes at run start (`discover` with
  `source: 'code'`). Dynamic routes (`/team/:id`) wait for a real link; if none appears by the
  end, they're "needs data".
- Gated routes (`gate: 'login'`) use a **saved test login** when the project has one
  (`login-wall` card's "Add a login" now works: username and password fields in a small form,
  stored with `Secrets` per project, typed by Fitts into the login form the App Model found;
  never logged, never shown in the trail — `[password entered]`).
- `RunState.coverage?` (new, optional):
  `{ pages: { known, reached }, journeys: { planned, done, failed, blocked }, controls: {done,total}, cells: { planned, run }, unreached: { route, why: 'login'|'data'|'out-of-scope'|'skipped'|'unlinked'|'error' }[] }`.
  A page known from code that no link reaches is `unlinked`, which is itself a finding
  candidate for the reviewers (an orphan page).
- `explore` keeps today's control coverage, stall rules and ceiling.
- **Code coverage (stretch, cut first):** CDP `Profiler.startPreciseCoverage` on the site window
  during the audit; map script URLs to project files; list components never rendered in the
  App Map. Only if U1–U8 are done.

### 6.3 The device matrix (`device_pass` replaces `phone_pass`)

- **Detect** at the first page (`site-window.ts` isolated-world probe): every
  `@media`/`@container` width condition from `document.styleSheets` (same-origin), plus whether
  any `prefers-color-scheme` or `prefers-reduced-motion` rule exists; merge with the App Model's
  `breakpoints` and `media`.
- **Cells** (`DeviceCell { id, label, width, height, mobile, touch, zoom?, textSpacing?,
  orientation?, scheme?, motion? }`, schema), chosen by `matrix.ts`:
  1. 320×640 reflow (WCAG 1.4.10)
  2. phone 390×844 touch, and phone landscape 844×390 (1.3.4)
  3. for each breakpoint B (≤ 4, the most used): B−1 and B
  4. 1280×800 and 1440×900
  5. 200% text: 1280 wide with `webContents.setZoomFactor(2)` (1.4.4)
  6. text spacing: CSS injected with `insertCSS` (line-height 1.5, paragraph spacing 2em,
     letter 0.12em, word 0.16em) at 1280 (1.4.12)
  7. dark and reduced motion, only when the site has those rules
  Cap 10 cells; dedupe widths within 8px.
- **Cost control:** every reached page gets the deterministic probes (viewport overflow, clipped
  text, target size, contrast) in every cell (cheap). Screenshots for the reviewers only for
  (a) each journey's final page and (b) pages with a finding, in the cells where something
  failed, plus the phone cell. Media emulation: `Emulation.setEmulatedMedia`.
- New probes in `packages/probes`: `text-spacing` (clipping/overlap after injection), `resize-text`
  (overflow/clipping at 200%), `orientation` (content locked or hidden in landscape). Each has a
  template, a standards mapping and a verification path.
- `Finding.seenOn` becomes the cell id; the Finding panel and "Show me on the site" switch to
  that cell (the device menu gains the cells used by the run).

### 6.4 Tests

Unit: matrix selection (breakpoints, caps, dedupe, media gating); coverage seeding and
`unreached` reasons; journey step contract with a fake model (goal met, blocked, max steps).
E2E: demo/chat journeys run (recorded fixtures); a planted 320px overflow on demo/chat (add one
to PLANTED as #26) is found in the reflow cell.

---

## 6A. U5b — Fitts notices: the action log

### 6A.1 Why

The data is already measured and thrown away: `Feedback` has the first change, the loading
indicator time, the text that appeared, live-region text and error text for every action, and
`RequestRecord` has every request's timing and status. The chat shows "Tapped NEXT". Showing what
Fitts measured makes the run legible to the owner, and giving it back to the models makes
Fitts's own choices, reviews and repros better. **No model calls are added for this: every line is
a template over measurements.**

### 6A.2 The record (`packages/schema`)

```ts
interface ActionRecord {
  step: number;
  at: number;                     // run clock ms
  kind: 'click' | 'type' | 'navigate' | 'back' | 'key' | 'load';
  target?: { name: string; role: string; ref: string; src?: string };
  from: string; to: string;       // routes
  ms: {
    firstChange: number | null;   // first DOM change after the action
    busy: number | null;          // a loading indicator appeared
    settled: number | null;       // no DOM mutations or requests for 300 ms
    navigation: number | null;    // URL changed → main content settled
  };
  requests: { count: number; failed: number; slowest?: { method: string; path: string; ms: number; status: number } };
  console: { errors: number; first?: string };   // untrusted page text, trimmed to 120 chars
  redirects?: string[];           // hops, when the action caused a redirect chain (§6B.4)
  observations: string[];         // Observation ids
}

interface Observation {
  id: string;                     // also an evidence id reviewers may cite: "obs-<n>"
  step: number;
  route: string;
  cell?: string;                  // the device cell, when not the default
  kind:
    | 'slow' | 'no-feedback' | 'silent-save' | 'nothing-happened'
    | 'jumped' | 'popped-up' | 'focus-moved' | 'moved-before-tap' | 'scrolled-by-itself' | 'vanished-fast' | 'autoplay'
    | 'hard-to-read' | 'too-small' | 'missing-name' | 'missing-detail' | 'leaked' | 'error-text'
    | 'wrong-place' | 'redirect' | 'refresh-breaks' | 'not-found' | 'broken-link'
    | 'console-error' | 'request-failed' | 'keyboard' | 'state' | 'perf';
  text: string;                   // the chat line, from a template in copy.ts
  ref?: string;
  evidenceId?: string;            // the probe result or surprise event it came from
  severityHint: 1 | 2 | 3 | 4;
  findingId?: string;             // set when the review turns it into (part of) a finding
}
```

- `RealRun.perform()`, `journey.ts` and every pass (§6B) build one `ActionRecord` per action from
  the `OpTrace` (extended in main with `settled`, `navigation`, console errors and redirects), and
  emit `action.recorded` and `observation.added` events. The existing `trail` and `history`
  become views of the records.
- **Observations come from**: the action's own trace (slow, no feedback, saved silently, nothing
  happened, request failed, console error); probe results the moment they're measured (each
  failing item → one observation, deduped per route by probe and item key); the surprise detector
  and navigation checks (§6B); state and perf passes. Each source has a template in
  `copy.ts` (`copy.noticed.*`) in Fitts's voice, for example:
  - "Tapped **NEXT** · the page changed in 1.8 s, with nothing on screen for the first 1.2 s"
  - "Noticed the timestamp is hard to read: 2.6:1 on white, 4.5:1 needed"
  - "Noticed the banner jumped 180 px down 2.1 s after the page loaded, with no tap"
  - "Noticed a dialog popped up 4 s after loading without anything prompting it"
  - "Noticed **Send** moved 40 px just before I tapped it"
  - "Noticed this button has no name a screen reader can say"
  - "Noticed the recipient shows “(null)”"
  - "Noticed **Contacts** went to /settings"
  - "Noticed refreshing /compose/confirm shows a blank page"
  - "Noticed 2 errors in the page's console after tapping **Search**"
  Observations are notes, not verdicts: the wording is always "noticed", never "problem", until
  the review makes a finding.

### 6A.3 In the chat

- The `steps` item's entries gain optional `ms` (the response time to show), `slow` (boolean),
  `noticed` (observation ids) and `findingIds`. Each line: the action, a timing chip ("1.8 s";
  shown with the warning tone when it's slow or had no feedback), then its "Noticed …" lines
  indented with an eye icon (lucide `Eye`, `aria-hidden`; the text carries the meaning).
- Collapsed, the group shows the latest action and "N things noticed". Expanded, all of them.
- Selecting a noticed line puts the attention box on its element on the canvas (or switches to
  its device cell first). When the review links it to a finding, the line gains "Finding 4" which
  opens the Finding panel; the Finding panel's "See it yourself" tab lists its supporting
  observations.
- Observations that never become findings stay visible as notes, and are listed per page in the
  App Map drawer ("What I noticed here").
- **Detail setting** (Settings › General › "How much Fitts shows while it works"):
  - *Highlights*: actions grouped as today, timing chips only when slow, noticed lines with
    `severityHint ≥ 3`.
  - *Everything I notice* (default): every action's timing, every noticed line.
  - *Every detail*: also requests (count, slowest), console errors, each decision as a
    "Thinking: …" line (the decider's chosen ability and a new short `why` field on every tool),
    and each pass's start and end.
  The setting changes rendering only; the log is always recorded.
- Noticed lines are not spoken (voice keeps Phase 2's rules). They never interrupt the owner:
  they append to the current steps group.

### 6A.4 Fitts uses its own log

- **Brain and journey runner**: instead of `history` strings, the last 8 records as compact
  lines ("tapped NEXT → /compose/recipient · 1.8 s · no loading indicator · noticed: '(null)'").
- **Decider** (`situation()`): counts of observations by kind and the latest 5 lines, so it can
  say "Search is slow everywhere; I'll check the network next" and choose `perf_pass`.
- **Reviewers**: each route/state's records and observations with their ids, citable as
  evidence (`obs-<n>` joins `validIds()`), so a reviewer's "Search gives no sign it's working"
  rests on a measured 1.5 s wait.
- **Repro** (§5): steps carry timings ("Wait about 2 s; nothing changes").
- **converse**: answers "what are you doing?" or "what did you see on that page?" from the log.
- **Persistence and replay**: the new events go in `events.ndjson`; replay plays them; the
  report gets an "Activity" section per page (in `<details>`).

### 6A.5 Tests

Unit: record building from fixture `OpTrace`s (timings, settled, slow flag); observation templates
for every kind (snapshot); dedupe per route; reducer handling; detail-setting filters. Component:
steps group with timing chips and noticed lines, keyboard, links to findings. E2E on demo/chat:
the search step shows the 1.5 s line; a noticed line opens its finding.

---

## 6B. U5c — Detect more

Each detector is a probe (or a pass) with a `ProbeName`, a template with expected/actual, a
standards mapping (§5.1), observations (§6A) and, where noted, a verification path so its
findings can be fixed (§7.5).

### 6B.1 Every axe rule

- `page.ts`: run axe with `runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a',
  'wcag21aa', 'wcag22aa', 'best-practice'] }`, once per page state (§6B.3), excluding the three
  rules the existing probes already own (`color-contrast`, `button-name`, `link-name`), so those
  keep their templates and verification.
- New `ProbeName` `'axe'`: each violation node is an item with the rule id, axe's `help` text,
  the target selector and the nearest `data-fitts-src`. Template: title from `help`, finding
  from axe's description in plain language, fix from the rule's summary; severity from axe
  impact (critical 4, serious 3, moderate 2, minor 1; best-practice rules capped at 2).
- WCAG links come straight from the rule's tags (`wcag143` → 1.4.3), and the Deque rule URL
  from `helpUrl`.
- Verification: re-run axe for that one rule on the route/state (`VERIFIABLE` gains `'axe'`).
- This adds image alt text, form labels, `autocomplete`, heading order, landmarks, ARIA validity,
  `lang`, duplicate ids, nested interactive controls, list markup, frame titles, `meta viewport`
  zoom blocking and more.

### 6B.2 Keyboard (`'keyboard'`, extends `focusSweep()`)

Tab through each page state (up to 200 stops), recording the focused element and its rect:
- An interactive element in the AX snapshot that Tab never reaches (2.1.1, severity 3).
- Focus stuck: the same element after 3 Tabs, or a cycle that never leaves a region (2.1.2,
  severity 4).
- Focus hidden behind a sticky header or offscreen for ≥ 50% of its box (2.4.11, severity 2).
- Order: visual reading order (top-to-bottom, left-to-right by rect) vs Tab order; a jump back
  of more than one row counts; three or more on one page becomes an observation for the
  reviewers, not a finding on its own (2.4.3).
- Dialogs: when one opens (`role=dialog|alertdialog` or `aria-modal`), focus must move inside;
  Tab must stay inside; Esc must close it; focus must return to the control that opened it
  (2.4.3, 2.1.2; severity 3 each).
- Skip link: pages with ≥ 6 nav links and no skip link (2.4.1, best practice, severity 1).
Verification: re-run the sweep on that route/state.

### 6B.3 Every state, not just every page

- `agent/crawler/states.ts`: an abstract state key = route + a hash of the sorted
  `role:name` of interactive nodes + open dialog names + headings. A new key is a new state.
- On a new state: screenshot, element rects, the page probes (axe, contrast, target size,
  placeholder leak, keyboard) and a perceptual hash of the shot (8×8 average hash).
  `RouteEvidence` gains `states: { key, label, shot, probes, records, stepIndex }[]`; the label
  says how it was reached ("after tapping NEXT with the form empty").
- Reviewers review states: each route's first state plus up to 5 more, chosen in this order:
  dialogs, error states (`Feedback.errors` or `aria-invalid`), journey steps, journey end
  states, states whose perceptual hash differs most from those already chosen. Evidence ids
  become `<route>#state-<n>`. Run caps: 40 reviewed states in Quality, 20 in Economy; states
  with a near-identical hash to one already reviewed are skipped.
- The theme check and the App Map use the states too ("Compose has 4 states").

### 6B.4 Navigation and redirects (`'navigation'`)

Main records every main-frame navigation with CDP (`Network.requestWillBeSent` with
`redirectResponse`, `Page.frameNavigated`, `Page.navigatedWithinDocument`), and client-side
redirects (a navigation within 1 s of a page load, with no input). Then:
- **Expected destination**: before a click, `perform()` records where it should go: the
  anchor's resolved `href`; else the App Model's static target for the control's call site
  (`<Link to>`, `navigate('/x')`, `router.push('/x')` in its `onClick`, found via the source
  chain); else nothing. Arriving elsewhere → "**Contacts** went to /settings" (H4, severity 3).
  Name-only guesses ("a button called Contacts probably goes to /contacts") are observations for
  the reviewers, never findings on their own.
- **Redirect chains**: more than 2 hops (performance, severity 2); a loop (a URL twice in one
  chain, severity 4); a redirect to a login route for a page the App Model doesn't mark as gated
  (severity 3); a redirect that drops the query or hash (severity 2).
- **Back after a redirect**: after arriving through a redirect, press Back once; landing on the
  redirecting URL and being sent forward again is a Back trap (H3, severity 3).
- **Refresh and deep links**: every reached route is loaded fresh once (`site.navigate` with a
  reload) at the end of `check_links`: a 4xx/5xx, a blank `main`, an error boundary's text, or
  a different page's headings → "Refreshing /x breaks it" (severity 3). Pages inside a flow that
  legitimately need earlier steps are told apart by the App Model (`dynamic`, `gate: 'data'`) and
  by whether they redirect somewhere sensible; those become observations only.
- **Soft 404s**: load `/fitts-not-a-page-<random>`: status 200 with the home page's headings and
  no "not found"-like text → "Unknown addresses show the home page instead of saying they don't
  exist" (H9, severity 2). Links whose page says "not found" with status 200 are broken links.
Verification: replay the click or the load on the worktree's server and re-check.

### 6B.5 The surprise detector (`'surprise'`)

An isolated-world script installed on every page load (and in the replayer), always on during the
audit. Main tells it when Fitts or the owner sends input (`lastInputAt`).
- **Popped up**: an added element that is `role=dialog|alertdialog`, or `position: fixed|sticky`
  with `z-index ≥ 100`, or covers ≥ 25% of the viewport, appearing > 1 s after the last input.
- **Jumped**: `layout-shift` entries with `hadRecentInput: false`, using their `sources`
  (node, previous rect, current rect) → "the banner jumped 180 px down".
- **Moved before tap**: the target's rect when Fitts decided (the snapshot) vs at the moment of
  the click; > 20 px → severity 3 (a person would mis-tap).
- **Focus moved**: `focusin` with no recent input and not caused by Fitts's own action
  (severity 2); a page change or dialog caused by focus alone (WCAG 3.2.1, severity 3) or by
  typing alone without submitting (WCAG 3.2.2, severity 3).
- **Scrolled by itself**: scroll position changes > 200 px with no input (severity 2).
- **Vanished fast**: a toast or status with ≥ 8 words removed within 5 s (2.2.1, severity 2).
- **Autoplay**: a `video`/`audio` playing with sound for > 3 s without input (1.4.2,
  severity 3).
- Each event carries timing, the element (ref, selector, source), rect before/after and the
  route/cell. WCAG-defined ones (3.2.1, 3.2.2, 2.2.1, 1.4.2) and moved-before-tap become probe
  findings directly. The others become observations, plus:
- **The judge (Muse Wonder)**: for popped-up, jumped and scrolled-by-itself events, main keeps a
  4-second ring buffer of the site window's frames (the paint frames it already produces, at
  ~8 fps), saves the 2 s before and after the event, and asks `muse-wonder-1.0` (task `review`,
  reasoning `low`) with up to 8 frames labeled by time, the last action, and the brief: "Would a
  person who just did this expect what happens in these frames?" Output
  `{ expected: boolean, why, severity, heuristic }`. Unexpected → a finding draft with the
  observation as evidence (it counts like one reviewer; the evidence rule still applies, and the
  surprise event itself counts as measured evidence). Cap 12 judged events per run.
- **SAM 3.1** outlines the element in the first and last saved frames (box prompts), so the
  Finding panel's "See it yourself" tab shows a before/after strip of the moment.
- First-load banners (cookie consent, newsletter) are reported once per site, not per page.
Verification: replay the steps with the detector on the worktree's server; the event must not
recur.

### 6B.6 Empty, error and slow states (`state_pass`, local projects only)

- After the review's evidence is in, for up to 6 of the site's own GET endpoints (from the
  recorded requests, most-used first, same origin or the App Model's `apis`), reload a page that
  uses each one three times with CDP `Fetch` interception of that endpoint only:
  1. **Empty**: a JSON array body becomes `[]`; an object's array fields become `[]`.
  2. **Error**: status 500, body `{"error":"fitts-test"}`.
  3. **Slow**: held 3 s, then continued unchanged.
- Each produces a state (§6B.3) labeled "when the contacts list is empty / fails / takes 3 s",
  with probes and observations. Deterministic findings: a blank or crashed page (empty `main`,
  an error boundary, an uncaught exception) on the error case (H9, severity 3); raw error text
  (the existing error-message rule); no loading indicator within 1 s on the slow case (the
  existing feedback rule, H1); leaked placeholders on the empty case. "An empty list with no
  explanation" and similar go to the reviewers with the state shot.
- Writes (non-GET) are never faked or altered; the gate still governs them. Never on live
  sites. Allowed in Plan only (it only loads pages).
Verification: repeat the same interception on the worktree's server.

### 6B.7 Real-world speed (`perf_pass`)

- **Build like production** in a detached read-only worktree at HEAD
  (`.fitts-worktrees/<runId>/perf`): the project's `build` script, then `preview` (Vite),
  `start` (Next), or a static server for a `dist/`/`out/` folder. If the build fails or there's
  no way to serve it, measure on the dev server and label every number "dev build".
  Live sites are measured as they are.
- In a hidden window: CDP `Network.emulateNetworkConditions` with Chrome DevTools' "Slow 4G"
  preset values (copy them from Chrome's source into `perf.ts` with a comment) and
  `Emulation.setCPUThrottlingRate({ rate: 4 })`, the phone cell. Cache disabled for the first
  load, enabled for a second.
- For up to 10 pages (journey pages first): TTFB, FCP, LCP (and its element), CLS (with
  sources), total blocking time from `longtask` entries, transfer bytes by type (JS, CSS, images,
  fonts), oversized images (natural size > 2× displayed and > 100 KB), render-blocking requests.
- **INP**: click each page's primary action (the journey's next step, or the most prominent
  button) and read the `event` timing entry's duration.
- **Page change**: for each journey step that navigates in the SPA, click → URL change → main
  content settled.
- Thresholds (performance lens): LCP > 2.5 s, INP > 200 ms, CLS > 0.1 (Core Web Vitals "good"
  limits), a page change > 1 s, total blocking time > 300 ms, any image or JS file > 500 KB.
  Every number is labeled "on a mid-range phone on Slow 4G" (or "dev build").
- Verification: median of 3 measurements on the fixed branch's build must pass the threshold by
  10%. Perf fixes are offered, but the fixer is told to prefer image sizing, lazy loading, code
  splitting at route boundaries and removing duplicate requests; no new dependencies (as always).
- Cost: no model calls; about 1–3 minutes of build and load time, shown in the Now line.

### 6B.8 New planted issues (demo/chat)

| # | Planted issue | Detected by |
|---|---|---|
| 26 | Inbox overflows sideways at 320px | viewport probe, reflow cell (§6.3) |
| 27 | Avatar images with no `alt` | axe `image-alt` |
| 28 | Contacts search field with no label | axe `label` |
| 29 | A "Rate us" dialog that pops up 4 s after opening Inbox, with no way to close it by keyboard | surprise (popped-up) + keyboard (dialog) |
| 30 | A banner that loads late and pushes Send down as you reach for it | surprise (jumped, moved-before-tap) |
| 31 | The "Contacts" link in Settings goes to /settings/privacy | navigation (expected destination) |
| 32 | Refreshing /compose/confirm shows a blank page | navigation (refresh) |
| 33 | Contacts shows a blank screen when the contacts request fails | state pass (error) |

`PLANTED.md`, `check:demo-chat` and `REFERENCE-FIXES.md` are updated; `bench:chat` scores all 33.

### 6B.9 Tests

Unit: axe item → finding (impact, tags → WCAG); keyboard analysis on recorded tab sequences;
state keys and selection; navigation analysis (expected vs actual, chains, loops, Back trap,
soft 404); surprise analysis on recorded event logs (input timing windows); Fetch rewriting for
the three state cases; perf thresholds and median verification. Real-Chromium fixture pages
(`tests/e2e/probes.spec.ts`) for: a late overlay, a layout shift, a moved target, a focus-change
navigation, a vanishing toast, an autoplaying video, a keyboard trap, a redirect loop, a soft 404.
Recorded fixture for the Wonder judge. E2E: planted #26–#33 on demo/chat (offline: probes only,
with the judge's recorded fixture).

---

## 7. U6 — A fixer that knows the code

### 7.1 Context

The task file (`fixer.ts` `taskFile`) gains: the project summary; the finding's source chain
(host file:line and call sites); the route's component file; related files (the component's
imports that are style modules or token files, from the repo map); the styling approach and
tokens ("use the design tokens in `src/theme.css`; this project uses CSS modules"); the
allowlist (below). Repair passes keep today's rules.

### 7.2 Tools

Add to the in-process loop (and expose the same to Muse Code via its prompt): `list_files(dir)`,
`outline(path)` (exports, components and their line ranges via Babel), `find_component(name)`
(the repo map's lookup), `request_scope(path, why)`. Keep `read_file`, `search`, `apply_patch`,
`run_check`, `done`.

### 7.3 The edit allowlist (a guarantee, enforced in `main/fix/fix-host.ts` `patch`)

- Allowed by default: every file in the finding's source chain, the route's file and layout,
  style modules and token files imported by them, global CSS, and `src/**` component files that
  aren't in `sensitive`.
- `request_scope(path, why)`: Autonomous and Dangerous allow any non-sensitive file; the ask
  modes ask the owner ("To fix X I need to change `src/lib/format.ts` because …. OK?").
  Sensitive files (lockfiles, `.env*`, CI config, `middleware.ts`, auth and API handlers,
  `package.json`) always ask, in every mode, and Plan only never changes anything.
- A patch outside the allowlist is refused with a message the model can act on. Test: a
  hostile fixer can't write `package.json` in Autonomous without an owner answer.

### 7.4 Muse Code as the primary fixer

**No `muse login` needed.** Muse Code 1.4.14 has `--api-key-stdin` (DECISIONS, V6). Fitts
already holds the owner's Meta API key in `Secrets`, so it authenticates every `muse` run itself:

- `main/fix/muse.ts` `museStatus()`: find `muse` natively (`muse --version` on PATH), then on
  Windows through WSL (`wsl -e bash -lc "muse --version"`), as the existing spawner's
  `museCommand: native | wsl` does. V6 found 1.4.14 WSL-only on Windows; re-check on the
  installed version and record it in DECISIONS. Result: `ready` | `not-installed` |
  `no-wsl` | `too-old` (no `--api-key-stdin`) | `failed` (with stderr's first line).
- **Auth, in order:** (1) the Meta key from `Secrets`, written to the child's stdin with
  `--api-key-stdin` and the stdin closed; never in argv, env, a file, a log line or the event
  log. (2) If there's no Meta key but the owner has run `muse login` themselves, run without
  `--api-key-stdin`. Exit code 1 ("credentials missing") or an auth error → status `failed`,
  one chat line ("Muse Code couldn't sign in, so I'm fixing this one myself."), and that job
  runs on the in-process fixer. The run never stalls on Muse Code.
- **The key check**: Settings › Keys › Meta's "Test" also runs a no-spend check that `muse`
  accepts the key (`muse exec --provider echo` with the key on stdin, when echo honors it; else
  a 1-step real call capped by `--max-model-steps 1`, about $0.001), and shows "Muse Code: ready".
- **Setup when it's missing**: Welcome's computer chips gain "Muse Code" (ready / set it up).
  "Set it up" opens Meta's Muse Code install page with `shell.openExternal` and explains in one
  line that fixes work without it, through Fitts's own fixer. Fitts never installs software
  itself. On Windows without WSL or native `muse`, the chip says so plainly.
- Cost: Muse Code's calls bill the same Meta key, so its `run.usage` events go to the ledger and
  the budget cap applies (a running `muse` is killed at the 100% card, like any call).
- When ready, the pipeline runs a fix job as `muse exec --json --model muse-wonder-1.0
  --approval-mode never --sandbox-network restricted --max-model-steps 40 --api-key-stdin
  --prompt-file task.md` in the run worktree, streaming JSONL to `nowText`, then verifies exactly
  as today. The allowlist is enforced after the fact too: a diff touching a
  disallowed file is reset before verification and the job fails with that reason (Muse Code
  hooks can enforce it during the run when available; record what shipped in DECISIONS).
- Otherwise the in-process fixer (with §7.2 tools) runs, as today. Settings › Advanced shows
  which fixer is active. Cost from Muse Code's `run.usage` event goes to the ledger.

### 7.5 More findings become fixable

- **Device findings**: `fix-host` `verify` takes the cell; `pipeline.fixable()` drops the
  `!check.device` exclusion.
- **U5c findings**: `axe`, `keyboard`, `navigation`, `surprise` (deterministic kinds), `state`
  and `perf` findings verify as each §6B subsection says; `VERIFIABLE` includes them. A
  surprise finding that only the Wonder judge raised is "Checked by review".
- **Trace findings** (feedback timing, back-mid-flow, error message, placeholder leak on a later
  step, label consistency): verified by replaying the finding's repro steps on the worktree's
  server with its oracle (§5.2's replayer pointed at the worktree port). `VERIFIABLE` grows
  accordingly.
- **Reviewer-only and owner findings**: fixable only with the owner's approval in every mode.
  Verification: Muse Wonder (`muse-wonder-1.0`, task `review`) compares the before and after
  shots of the element with the finding's `expected`; the change is labeled **"Checked by
  review"**, never "verified", in chat, Done, the PR and the report. Project tests and CI must
  still pass.
- **Root-cause groups**: findings that share a source line, a token, or a probe title across
  pages are offered as one fix ("Fix 4 faint-text findings by changing `--muted`"). The approval
  card groups by root cause, with counts.

### 7.6 Tests

Unit: allowlist (allowed, request_scope per mode, sensitive always asks); device verify passes
the cell; trace verification with a fake replayer; "Checked by review" labeling; root-cause
grouping. Integration (`tests/main/fix-host.test.ts`): refused patch outside the allowlist on a
real git repo. Bench (`p9.bench.ts`, spends money, run on purpose): ≥ 8 verified fixes on demo/chat
including one phone-only and one trace finding.

---

## 8. U7 — The App Map

### 8.1 Why and what

The owner sees the whole app at once: every page as a node, grouped by URL path into a tree;
each node holds what that page does, what Fitts checked there, what it found and what it fixed.
It's the App Model (U2) plus the run's coverage (U5), findings (U4) and changes (U6), so it costs
no extra model calls.

### 8.2 Data (`packages/schema`, derived by a pure function `appMap(run, model)`)

```ts
interface AppMapNode {
  path: string;                 // "/compose" (templates as "/team/:id")
  label: string;                // the page's title or last segment
  children: AppMapNode[];
  page?: {
    file?: string;
    features: { name: string; description: string }[];
    journeys: { id: string; name: string; status: string }[];
    reached: boolean; why?: string;          // unreached reason
    cells: string[];                          // device cells run here
    findings: { id: string; title: string; severity: number; status: Finding['status']; lane: Finding['lane'] }[];
    changes: { id: string; title: string; status: Change['status'] }[];
    proposed: { findingId: string; fix: string }[];  // open findings' suggested fixes
  };
  totals: { findings: number; worst: number; fixed: number; open: number };   // rolled up from children
}
```

Intermediate path segments with no page of their own (`/settings` when only
`/settings/profile` exists) are group nodes with no `page`.

### 8.3 UI

- **Done** gets two views in its main area: **Summary** (today's layout) and **Map** (new,
  default when the run has ≥ 4 pages). A segmented control switches; the choice is remembered
  per viewer in the UI store.
- The Map: a left-to-right tidy tree (layout computed with a small Reingold–Tilford
  implementation in `renderer/features/summary/tree-layout.ts`, no new dependency; SVG for the
  edges, HTML buttons for nodes so they're real controls). Node: label, a dot for reached /
  hollow for not, and up to three count chips (findings by worst severity using the severity
  tokens, fixed in mint). Collapsing: groups with > 12 children start collapsed; template nodes
  show "× N pages".
- Selecting a node opens the **page drawer** on the right: What it does (features), Journeys
  through it (status), Checked at (cells), Found (findings, each opens the Finding panel),
  Fixed (changes, each with its commit and diff), Proposed (open findings' fixes with "Fix
  this"), Not checked (why), States (thumbnails of the states reviewed, including forced empty,
  error and slow states), Speed (the page's perf numbers, when measured) and What I noticed
  here (the page's observations, §6A). For the root node: the project summary and run totals.
- **Journey highlight**: a "Journeys" list above the tree; hovering or selecting one highlights
  its pages and draws its path across nodes in cobalt.
- **Filters**: All · With findings · Not reached. A search field filters by path or feature.
- **Accessibility**: the tree follows the ARIA treeview pattern (`role="tree"`, `treeitem`,
  `aria-expanded`, arrow keys, Home/End, type-ahead); the SVG edges are `aria-hidden`; contrast
  per tokens; the window still never scrolls (the map pans inside its panel; zoom buttons; wheel
  to pan, ctrl+wheel to zoom).
- **During the audit**, `SiteMap.tsx` shows the same tree in its compact list form (indented,
  code-known pages hollow with "not yet"), so the map visibly fills in as Fitts works.
- **Report**: the map as nested Markdown lists, each page with its features, findings and
  fixes. **PR body**: a compact per-page table (page, fixed, open).
- **Android**: nodes are screens (from the App Model's navigator), same UI.

### 8.4 Tests

Unit: `appMap()` grouping, templates, roll-ups, unreached reasons. Component tests: keyboard
navigation, drawer contents. E2E: Done Map on the demo/chat fixture run; axe passes.

---

## 9. U8 — Android (audit), U9 — Android (fix)

### 9.1 The demo target: `demo/android-chat`

An Expo (SDK current) + Expo Router app, the native twin of demo/chat: Inbox, Compose
(recipient → message → confirm), Contacts, Settings. All interactive elements have `testID`s
except the planted ones. `PLANTED.md` with 8 issues:

| # | Planted issue | Detected by |
|---|---|---|
| A1 | Icon-only "send" button with no label (`accessibilityLabel` missing) | android-label probe |
| A2 | Send target 32×32dp | android-target probe (48dp) |
| A3 | Timestamp text #BBBBBB on white | android-contrast (pixels) |
| A4 | Recipient shows "(null)" on step 2 | placeholder-leak on hierarchy text |
| A5 | No confirmation after sending | trace + reviewers |
| A6 | Three labels for one action (NEXT / Send Text / Create Message) | label-consistency |
| A7 | Two clickable elements with identical bounds | android-duplicate-bounds probe |
| A8 | Settings: 14 ungrouped switches | reviewers (Hick) |

Mirrored like the other demos (`pnpm demo:mirror`, NEEDS-ALLEN to push).

### 9.2 The Android target (main process, `main/android/`)

- **Tools** (Welcome's computer chips gain "Android SDK" and "Emulator"): find `adb` and
  `emulator` from `ANDROID_HOME`/`ANDROID_SDK_ROOT`/PATH. List AVDs (`emulator -list-avds`),
  boot one headless-with-window-hidden is not required (the emulator window may show; Fitts
  streams its own frames), wait for `sys.boot_completed`.
- **Project detection** (`detect.ts`): `expo` or `react-native` in dependencies →
  `kind: 'android'`; dev command `npx expo start --dev-client --port <p>` (or Expo Go when no
  dev client is installed; record which in DECISIONS); `adb reverse tcp:<p> tcp:<p>`; open the
  app with `adb shell am start -a android.intent.action.VIEW -d "exp+<slug>://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A<p>"`
  (or `exp://127.0.0.1:<p>` for Expo Go).
- **`AndroidWindow`** implements the same operations the agent's `Site` interface uses
  (`agent/site-client.ts`); main routes `site.*` RPCs to it for Android projects:
  - `snapshot()`: `adb exec-out uiautomator dump /dev/tty` → parse XML (`fast-xml-parser`) →
    `AxSnapshot` nodes: ref = `resource-id` (= RN `testID`) or `a<n>` stable for the screen;
    role from class (`Button`, `EditText` → textbox, `ImageView`+clickable → button, `Switch`,
    `CheckBox`, `TextView` → text); name from `text` or `content-desc`; bounds; `clickable`,
    `focusable`, `enabled`, `checked`. Path = the screen's route from Expo Router when Fitts can
    tell it (the top header text matched against the App Model's screens), else
    `screen:<activity>#<hash>`.
  - `screenshot()`: `adb exec-out screencap -p` → JPEG (sharp is not a dependency; use
    Electron's `nativeImage.createFromBuffer(png).toJPEG(80)`).
  - **Frames to the canvas**: poll `screencap` at ~3 fps while acting, 1 fps idle, through the
    existing frame MessagePort; the canvas draws a phone frame around it. (scrcpy streaming is a
    later upgrade.)
  - Input: `input tap x y` (center of bounds, density-scaled), `input text` (escaped; spaces as
    `%s`), `input keyevent KEYCODE_BACK`, swipe for scroll. While the owner drives, canvas
    clicks become taps the same way.
  - `rects()`, `refAt(x, y)` from the last dump's bounds (no CDP).
  - `health()`: Metro answers and the device is online.
- **The gate on Android**: no network interception. Destructive-named controls (the existing
  `DESTRUCTIVE` regex) always ask first in every mode except Dangerous; the gate modal says the
  request can't be held, only the tap. Logged like today.
- **What's hidden for Android** in the UI: the address bar becomes the screen name, the tabs
  strip and the web device menu are hidden, Back is the system back.

### 9.3 Android probes (`packages/probes/src/android.ts`, pure functions over the parsed dump
plus the PNG)

- `android-target`: clickable bounds < 48dp in either dimension (dp = px / (density/160);
  density from `adb shell wm density`).
- `android-label`: clickable or focusable `ImageView`/`ImageButton`/`ViewGroup` with no text and
  no content-desc (no descendant text either).
- `android-duplicate-label`: two clickable nodes on one screen with the same speakable text.
- `android-duplicate-bounds`: two clickable nodes with identical bounds.
- `android-editable-desc`: `EditText` with a content-desc (screen readers read it instead of
  the field's value).
- `android-contrast` (estimate): for each `TextView` with text, take the bounds' pixels from the
  PNG, the two dominant colors (simple histogram of quantized colors), contrast ratio; flag
  < 4.5:1 (< 3:1 for text ≥ 18sp — size from bounds height ÷ density as an estimate). Labeled
  "estimate" in the finding. When the region is busy (> 6 colors with ≥ 5% share), ask SAM 3.1
  for the text mask with a box prompt and measure inside vs outside the mask (a nice, honest use
  of SAM; failures fall back to "can't measure").
- Shared: `placeholder-leak` and `label-consistency` run on hierarchy text unchanged.
- Standards: Android checks map to WCAG via the same table (target → 2.5.8; label → 4.1.2;
  contrast → 1.4.3) and to the Accessibility Test Framework check names in the evidence.

Reviewers, aggregator, evidence check, SAM outlines (box = node bounds), App Map and repro work
unchanged. Repro: steps from taps; `environment` "Android 15 · Pixel 8 emulator · 1080×2400 ·
420dpi"; a **Maestro** flow instead of Playwright:

```yaml
appId: com.fitts.demochat
---
- launchApp
- tapOn: { id: "compose" }
- tapOn: "NEXT"
- assertVisible: "(null)"   # actual; expected: the contact's name
```

### 9.4 Android fixes (U9)

- Same pipeline and run branch. The worktree gets its own Metro on a free port (8082+).
- **Verify**: `adb reverse tcp:8081 tcp:<worktree port>` is *not* used (it would disturb the
  live view mid-audit); instead the fix phase (audit over) re-points the app at the worktree's
  Metro by reopening the dev-client URL with that port, replays the finding's repro steps with
  taps, re-runs the finding's probe on the resulting dump/PNG, then re-points back. Fast Refresh
  isn't relied on; a reopen is deterministic.
- Project tests and CI as today (`jest` usually).
- `fixable()` for Android: the hierarchy probes and placeholder leak; contrast fixes are
  "Checked by review" unless the re-measured estimate passes.
- Source: `testID` → search for `testID="…"`, then `accessibilityLabel`/text, then the App
  Model's screen file. Confidence `search` or `model`.

### 9.5 Requirements and NEEDS-ALLEN

Android Studio's SDK (platform-tools, emulator, an API 35+ x86_64 Google APIs image), WHPX
enabled on Windows (AEHD is being retired), an AVD named `Fitts_Pixel`. Expo dev client build
installed on the AVD once (`npx expo run:android` in the demo; takes minutes — NEEDS-ALLEN, or
fall back to Expo Go). These go in NEEDS-ALLEN with exact steps.

### 9.6 Tests

Unit: XML → AxSnapshot (fixture dumps in `tests/fixtures/android/`), each Android probe against
fixture dumps and PNGs, density math, Maestro writer. Integration: `AndroidWindow` against a fake
`adb` (a script that serves fixture dumps and records inputs). Bench (on purpose):
`pnpm bench:android` on the emulator scores against `demo/android-chat/PLANTED.md`.

---

## 10. U0 — Housekeeping (do first, it's small)

1. `run.ts` Autonomous fix line (§4.1).
2. **Microphone, for real.** The Welcome chip calls a new bridge method `requestMic()`: macOS
   `systemPreferences.askForMediaAccess('microphone')`; Windows and Linux: check
   `systemPreferences.getMediaAccessStatus('microphone')` (Windows) and run a one-second
   `getUserMedia({ audio: true })` probe in the renderer, then stop the tracks. `micAllowed` is
   set only on success; on denial the chip says so and offers "Open settings"
   (`x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone` /
   `ms-settings:privacy-microphone`). `electron-builder.yml`: `mac.extendInfo`
   `NSMicrophoneUsageDescription: "Fitts listens when you talk to it."` and the
   `com.apple.security.device.audio-input` entitlement for hardened runtime.
3. **Folder access.** The folder step says plainly "Fitts reads this project's code to
   understand it, and only changes it on its own `fitts/` branch." macOS `extendInfo`:
   `NSDocumentsFolderUsageDescription`, `NSDesktopFolderUsageDescription`,
   `NSDownloadsFolderUsageDescription` (projects often live there). Read the folder once right
   after picking (Pass 1 of §3) so a macOS prompt, if any, appears at a moment the owner expects.
4. GitHub: nothing to build. If `GITHUB_CLIENT_ID` is empty, Settings › GitHub says "Sign in with
   GitHub isn't set up in this build; Fitts uses the GitHub CLI (`gh`) instead" (verify the
   copy exists; add it if not).

---

## 11. Schema, events, interfaces

All additions optional, so earlier UI and tests compile.

- `AppModel`, `AppPage`, `Journey`, `DeviceCell`, `Repro`, `SourceFrame`, `ProjectMemory`,
  `AppMapNode` (§3, §6, §5, §2, §4, §8).
- `Finding`: `repro?`, `sourceChain?`, `lane` adds `'owner-ok'`, `source.confidence` adds
  `'model'`, `seenOn` holds a cell id.
- `RunState`: `appModel?` (the summary fields the UI needs: summary, pages, journeys — not the
  whole model), `coverage?` (§6.2), `journeys?` (statuses), `cells?`.
- `ChatItem`: `{ type: 'understanding' }`, `{ type: 'finish-proposal'; answer?: string }`.
- Events: `appmodel.set`, `journey.updated`, `coverage.set`, `cells.set`. The reducer handles
  them; replay works (old logs simply lack them).
- `ActionRecord`, `Observation` (§6A); `RouteEvidence.states` (§6B.3); `Finding.observationIds?`;
  `steps` entries gain `ms?`, `slow?`, `noticed?`, `findingIds?`.
- `ProbeName` adds `'axe'`, `'keyboard'`, `'navigation'`, `'surprise'`, `'state'`, `'perf'`,
  `'text-spacing'`, `'resize-text'`, `'orientation'`, and the Android probes (§9.3).
- Events: `action.recorded`, `observation.added`, `observation.linked` (to a finding).
- Settings: `chatDetail: 'highlights' | 'noticed' | 'everything'` (default `'noticed'`).
- `AbilityName`: + `journey`, `device_pass` (− `phone_pass`), `state_pass`, `perf_pass`,
  `report_issue`, `propose_finish` (− `finish`). `Decision` gains `journeyId?`, `text?`, `why?`.
- `RunEngine`: still 22 methods; `dismissFinding` gains an optional `reason`. New answers go
  through `answerQuestion` (`'finish'`, `'fix-rest'`, `'continue'`, `'looks-right'`).
- `FittsBridge`: `requestMic()`, `memory.get/delete/clear(projectId)`,
  `openInEditor(file, line)`.
- Kind of project: `Project.kind?: 'web' | 'android'` (absent = web).

---

## 12. Prompts (versioned in `docs/prompts/`)

- New: `understand.md` (Pass 2, and the Muse Code prompt), `journey.md` (the step loop),
  `report-issue.md` (turn an owner's words into a finding draft), `judge-fix.md` (Wonder's
  "Checked by review"), `judge-surprise.md` (Wonder's "would a person expect this?" over frames,
  §6B.5).
- The brain, journey, decider and reviewer prompts describe the action-record lines and the
  `obs-<n>` evidence ids (§6A.4); `decide.md` adds `state_pass` and `perf_pass` and a `why` on
  every tool.
- Changed: `decide.md` (journeys first; `propose_finish` instead of `finish`; never end the run;
  owner rules come first; when the owner says something is or isn't a problem use
  `report_issue`/`dismiss`), `interview.md` (use the App Model; offer journeys as flows),
  `reviewers/_shared.md` (expected/actual/steps fields; owner rules as calibration; "the owner's
  judgment outranks yours"), `converse.md` (can patch the App Model during the understanding
  card; may disagree once, then defers).
- Voice rules (Phase 1 §8) apply to every line Fitts says.

---

## 13. Milestones, schedule, cut order

Each milestone ends with typecheck, lint, unit and e2e green, its acceptance met, DECISIONS
updated under "Phase 4", and a commit named `Phase 4 U<n>: <what>`. No AI co-author or session
lines in commits or PR bodies.

| # | Milestone | Acceptance |
|---|---|---|
| U0 | Housekeeping (§10) | Mic chip triggers a real OS prompt (manual check noted); plist keys in the build config; the wording fix |
| U1 | Source plugin v2 (§2) | Plugin tests; probe fixture returns a component chain; every demo/chat finding has a source with confidence; R3F fixture untouched |
| U2 | Understand + the understanding card (§3) | Extractor fixtures pass for 4 router kinds; demo/chat model has 8 pages and ≥ 4 journeys; card renders; an owner edit sticks across a cache refresh; interview uses it |
| U3 | Owner first + memory (§4) | Hostile-decider test; proposal card e2e; dismiss reasons stored and applied on a second run; owner findings |
| U4 | Repro (§5) | "See it yourself" tab; replay confirms demo/chat #1 in ≤ 3 steps; Playwright text snapshot tests; PR and report include repros |
| U5 | Journeys, coverage, device matrix (§6) | Journeys run on demo/chat; `coverage` and `unreached` correct; matrix selection tests; planted #26 found at 320px |
| U5b | The action log (§6A) | Every action line has its timing; noticed lines for every observation kind (template snapshots); search step shows the 1.5 s line; noticed lines link to findings; the three detail levels; brain, decider and reviewers receive the records (fixture assertions) |
| U5c | Detect more (§6B) | Full axe, keyboard, states, navigation, surprise detector (+ Wonder judge), state pass, perf pass; planted #27–#33 added; ≥ 6 of #26–#33 found; bench recall over 33 ≥ 80% |
| U6 | Code-aware fixer (§7) | Allowlist guarantee test; phone-only and trace fixes verified in the bench; "Checked by review" labeling; Muse Code used when available (else fallback, both recorded) |
| U7 | App Map (§8) | Done Map e2e + axe; drawer contents; live compact tree in the audit |
| U8 | Android audit (§9.1–9.3) | demo/android-chat; AndroidWindow over fake adb; probes on fixtures; on the emulator ≥ 6/8 planted found (bench, on purpose) |
| U9 | Android fix (§9.4) | ≥ 2 verified fixes on the Android run branch (bench) |
| U10 | Release polish | Re-record the bundled replay (web run with the App Map); README "What's new" linking `docs/ROADMAP.md` (which already exists; every cut from §13 is appended to its last section with why); NEEDS-ALLEN updated; `pnpm bench:chat` re-run |

**Schedule** (ET):

| When | Work |
|---|---|
| Sun Nov 1 evening | U0, U1 |
| Mon Nov 2 | U2, U3, U4, U5b (the log is cheap and makes everything after it visible) |
| Tue Nov 3 until 6 PM | U5, U5c, U6, U7, then U8 (U9 if time) · **feature freeze 6 PM** |
| Tue Nov 3 evening | U10, record the video |
| Wed Nov 4 | Edit, README, submit by noon, post on X |

This is more work than three days of one agent can be sure to finish. The cut order is part of
the plan, not a failure: apply it as soon as a milestone runs past its slot.

**Cut order** if behind (cut from the top first):
1. Code coverage (V8) in the App Map
2. U9 Android fixes (keep the Android audit; the video shows an Android finding with its repro)
3. The production build in `perf_pass` (keep the throttled measurements on the dev server,
   labeled "dev build")
4. The Wonder judge and SAM frames for surprise events (keep the deterministic detector; the
   reviewers see the before/after state shots)
5. Muse Code as the fixer and for Understand (keep the in-process fixer with the new tools and
   the allowlist; with `--api-key-stdin` this is small, so it's cut late)
6. ddmin (keep navigation-aware pruning and the replay confirmation)
7. The empty and slow cases of `state_pass` (keep the error case)
8. Text-spacing, 200% text and orientation cells (keep 320 reflow, breakpoints, phone)
9. SAM contrast on Android (keep the pixel estimate)
10. Saved test logins (the card keeps saying they're coming)
11. App Map journey highlight and search (keep the tree, the drawer and the filters)

**Never cut:** the App Model and its card (U2), `propose_finish` and the owner's Finish (U3),
the repro with steps, expected/actual and source (U4), the action log with timings and noticed
lines (U5b), full axe, keyboard checks, state shots, navigation checks and the deterministic
surprise detector (U5c), the App Map tree (U7), the Android audit (U8), the guarantees, replay
mode, the Windows build.

---

## 14. Guarantees (in code, with a test that tries to break each)

| Guarantee | Where |
|---|---|
| Only the owner ends a run (Finish, Stop, budget Stop) | `run.ts` `use()` / `answer()` |
| Owner rules beat Fitts: a matching `not-a-problem` finding is never posted, pinned or fixed | aggregator + `pipeline.fixable()` |
| Owner findings are always shown and offered | aggregator |
| A change is "verified" only when an oracle (probe, trace replay) passed and tests/CI pass; otherwise it's "Checked by review" or rolled back | `pipeline.ts` |
| The fixer can't write outside the allowlist without the owner (sensitive files: always ask) | `fix-host.ts` `patch` |
| The App Model is never written into the user's repo | `main/understand` |
| Android destructive taps always ask (except Dangerous) | `AndroidWindow` + gate |
| The Meta key reaches `muse` only on stdin; a failed Muse Code run falls back to the in-process fixer and never stalls the run | `main/fix/muse.ts` |
| Fault injection only rewrites the project's own GET responses, only on localhost, only during `state_pass`; writes are never faked | `site-window.ts` Fetch handler |
| The perf build runs only in a detached worktree under `.fitts-worktrees/`; nothing is written to the user's working tree | `main/fix/fix-host.ts` |
| Observation lines are templates over measurements; page text in them (console errors, labels) is trimmed, escaped and treated as data | `copy.ts`, `run.ts` |
| Page and code content are data, never instructions (prompts wrap it) | every prompt |
| Phase 2/3 guarantees (gate, live sites audit-only, Plan only never changes code, one branch) | unchanged |

---

## 15. Testing summary

- Keep every existing suite green; Phase 3's hostile-decider tests are updated for
  `propose_finish`.
- New unit suites: plugin v2, extractor fixtures, App Model validation, memory, propose-finish,
  repro pruning/ddmin/Playwright/Maestro writers, standards table, matrix, journey loop, allowlist,
  appMap derivation, Android XML/probes/density, action records and observation templates,
  axe/keyboard/state/navigation/surprise/state-pass/perf analysis (§6A.5, §6B.9).
- Real-Chromium fixture pages for every new in-page detector (§6B.9).
- Recorded LLM fixtures for every new prompt (`tests/fixtures/llm/`), replayed by the fake
  client. No network in tests.
- E2E: understanding card, proposal card, "See it yourself" tab, Done Map (keyboard + axe),
  Android canvas with a fake adb.
- Benches (spend money, on purpose): `bench:chat` (recall, precision, journey coverage),
  `p9.bench` (fixes incl. device and trace), `bench:android`.

---

## Appendix A — replacement "Current phase" section for CLAUDE.md

```
## Current phase: Phase 4 — Fitts understands

Phases 2 and 3 are done (one run branch, one PR, self-repairing fixes). Phase 4 adds the App
Model (Fitts reads the code), journeys and the device matrix, reproducible findings, owner-first
control (only the owner ends a run; owner rules are remembered), a code-aware fixer with an edit
allowlist, the App Map on Done, and Android (Expo on the emulator). Spec: docs/SPEC-phase4.md.
Where it's silent, SPEC-phase3, SPEC-phase2, docs/DECISIONS.md, then SPEC-phase1 apply.

Do one milestone (U0–U10, with U5b and U5c after U5) at a time, in order, each ending green
(typecheck, lint, test, test:e2e) and committed before the next starts. Cut only in §13's order.
Every observation line in the chat is a template in copy.ts over a measurement; never add a model
call to narrate.
Real network calls are allowed only in apps/desktop/src/agent/llm/, apps/desktop/src/main/voice/,
apps/desktop/src/main/fonts/, apps/desktop/src/agent/verify-site/, apps/desktop/src/main/github/,
apps/desktop/src/main/hosts/, and the gh/git/muse spawner. main/understand/ and main/android/
make no network calls (adb and the emulator are local processes). The renderer never makes
network calls. Never log or commit API keys or saved test logins. The one place a key leaves
Secrets for a child process is `muse --api-key-stdin` (stdin only, then closed). Never write Fitts's own files
(App Model, memory, FITTS.md) into the user's repo. Never run git or gh outside the project's
.fitts-worktrees/ except the read-only checks in SPEC-phase2 §4 and the PR steps in §9.3.
The guarantees in SPEC-phase4 §14 live in code, never in a decider or a prompt.
Commit messages and PR bodies: no Co-Authored-By, session links or "Generated with" lines.
Log judgment calls in docs/DECISIONS.md under "Phase 4".
```

## Appendix B — first prompts for Claude Code

1. "Read CLAUDE.md, docs/SPEC-phase4.md (start with §0.2: what already exists), SPEC-phase3 and
   the Phase 3 sections of docs/DECISIONS.md. Replace CLAUDE.md's Current phase with Appendix A.
   Then plan U0 and U1 only and do them."
2. After each milestone: "Run all checks, fix failures, summarize against U<n>'s acceptance,
   update DECISIONS and NEEDS-ALLEN, commit, and start U<n+1>."
3. If a milestone runs long: "Apply §13's cut order from the top until the schedule holds; say
   what you cut in DECISIONS."

## Appendix C — NEEDS-ALLEN for Phase 4 (start these now, in parallel)

1. **Android SDK and emulator** (30–45 min): Android Studio › SDK Manager: Platform-Tools,
   Emulator, an API 35+ x86_64 Google APIs image; Windows Features: Windows Hypervisor Platform
   (reboot); create AVD `Fitts_Pixel` (Pixel 8). Then in `demo/android-chat`:
   `npx expo run:android` once to install the dev client.
2. **Muse Code installed** (5 min): no `muse login` needed anymore (Fitts passes your Meta key
   with `--api-key-stdin`). Check `muse --version` (native Windows, or in WSL) is current, and
   update it if it predates `--api-key-stdin`.
3. **GitHub App** (10 min): NEEDS-ALLEN 4b as written; send the Client ID.
4. **Push** `main` and the demo mirrors, including the new `fitts-demo-android-chat`.

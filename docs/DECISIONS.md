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

**BeforeAfterSlider is a split, not a wipe.** *(Superseded after review: it is now a wipe,
see "Before/after is a wipe" below.)* Finding.html shows two side-by-side panes,
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

## M3 — App navigation, Welcome, Settings, projects

**Navigation is a small store, not a URL router.** `state/ui.ts` holds the screen (Welcome /
Workspace / Settings), the Settings tab, where Settings returns to, and which overlay is
open. Launch shows Welcome when there are no projects, otherwise the last opened project's
workspace (§4). Dev builds keep `#/gallery` and `#/debug` as hash routes.

**The bridge is finished in one go.** `window.fitts` now has `pickFolder`, `saveTextFile`
and `notify` / `onNotificationClick` (§3), implemented in `main/bridge.ts` with real native
dialogs and Electron notifications. E2E runs answer the dialogs through
`FITTS_E2E_PICK_FOLDER` and `FITTS_E2E_SAVE_PATH`, because tests can't click OS dialogs.

**API keys are never stored.** Settings only remembers *that* a key was added (a boolean per
provider). Mock validation is "8+ characters works", 600ms after typing stops (§6.1). Phase 2
stores keys in the OS keychain.

**Mock detection decides which demo a folder is.** A folder ending in `demo/chat` becomes the
scripted demo/chat project; `hartwell` and `portfolio` match their demos; anything else gets
a generic profile named after the folder. Ids are made unique when a different folder
detects to the same name.

**Demo fixtures follow Projects.html.** hartwell-site runs on localhost:3000, and portfolio
is the verified live site `allenzheng.dev` ("never audited"). The Add-project reference's
`~/code/portfolio` folder detects as Next.js 15 on localhost:3001 without the plugin.

**Brief round-trip.** The engine takes the project's saved brief when a project has no run
yet (`briefFor`). A project with a saved brief starts with "Anything changed since last
time?". Whatever the run learns is saved back to the project.

**Opening a project with no run starts its interview** in the default mode from Welcome or
Settings. This covers relaunch, where runs don't survive restarts (§4).

**Settings' permission rows set the default mode and the current run's mode.** The header
select (M4) changes only the run. Dangerous mode remembers the run's previous mode and
restores it when turned off; it is never persisted (it "ends with this run").

**Settings returns to Welcome** when it was opened from Welcome (the "Add ElevenLabs or
Baseten" link), with a "Back" button instead of "Back to workspace".

**Esc on Settings** goes back only when no overlay is open, so Esc still closes the topmost
overlay first (§7.2).

**Overlay focus falls back to the trigger.** When ⌘P opens the project menu nothing is
focused, so closing it returns focus to the project button.

**Pause-the-other-run confirm** is implemented as `requestStartAudit`, used by every "Start
the audit" button from M4 on (§6.9).

**Remove project** confirms in a modal with a red "Remove from Fitts" button. It is
destructive for Fitts's own data, so red is allowed. The copy says the folder stays.

**Welcome "Allow microphone / notifications"** are sun-tint pill buttons (as in the
reference) that turn into mint chips with a check.

**Add project:** the two big tabs are a `segmented` variant of `Tabs`. "Change" next to the
dev command edits it inline. The live-site token has a copy button that confirms with a
toast. "Check now" verifies after 1s (§6.11).

**New tokens:** `--radius-label` 8px (emblem tag and formula label), plus a `dashed` button
variant (ink dashed border) for "+ Add a project".

**The Scenario panel portals to `<body>`.** A modal makes `#root` inert, which made the dev
panel unclickable while a dialog was open.

**The page and the Scenario panel have separate Suspense boundaries**, so the page never
waits for the dev panel's lazy chunk to load.

## M4 — Workspace shell + Interview

**`RunEngine.updateBrief` (a 22nd method).** The Brief popover's Save (§6.10) must reach the
engine so Fitts can acknowledge it and Phase 2 can use the new brief. None of the §9.2
methods fit, so `updateBrief(projectId, brief)` was added to the contract.

**The mock site is excluded from axe.** demo/chat ships deliberate flaws (a grey NEXT button
with low contrast, a 28 × 20 px "Send Text" target) because Fitts is supposed to find them.
It stands in for the user's website, not Fitts's UI, so e2e axe scans exclude
`[data-mock-site]`. Everything else in the app stays axe-clean.

**demo/chat pages.** Inbox (Search, Contacts, Settings links, Compose), Compose step 1 (pick a
contact), step 2 (`/compose/recipient`: "To: (null)", Create Message, NEXT), step 3
(`/compose/confirm`: a tiny "Send Text" that drops you on the inbox with no confirmation),
Search (spinner on every keystroke), Contacts, the Grandma thread (Delete conversation, no
confirm) and Settings (cramped toggles). The `fixed` variant has consistent Next/Send,
Back buttons, "To: Grandma", larger type and targets, and "Sent to Grandma ✓". Every
interactive element has a stable `data-ref`. The interview starts on `/compose`.

**Site history is view state.** Back / Forward / Reload work on a per-project history in
`state/site.ts`, not in the run store, since it isn't run data.

**`SiteSurface` (§13)** is a small interface (`getElementRect(ref)`, `refAt(x, y)`) over the
DOM container that holds the mock site. Phase 2 implements it over a WebContentsView.

**The site is only clickable when the user drives** (the interview, or after "Take the
wheel"). Otherwise it is `inert`, so keyboard focus can't wander into it while Fitts acts.

**Point at something** joins the overlay stack while active, so Esc cancels it like any other
overlay (§7.2, §7.4). It works by pointer; keyboard users can describe the element in the
message instead.

**The brief card stays last during the interview,** as in Interview.html, so it reads as a
running summary. After the interview it renders where it was posted.

**Spoken interview answers keep their SPOKEN tag.** `answerInterview` takes no options, so a
hold-to-talk answer goes through `sendMessage(..., { spoken: true })`, which routes it to
the interview inside the mock.

**Voice commands need "Fitts" first** (§7.5). A spoken message starting with "Fitts, stop"
stops the current action; any other "Fitts, …" interrupts. "stop" or "wait" alone are just
messages. Typed text is never a command.

**Hold-to-talk in the mock:** holding the mic button (pointer, Space/Enter on the button, or
⌥Space / Alt+Space) shows "Listening…" in the message box and the "Mic on" chip; releasing
sends a canned transcript that fits the moment (`mock/voice.ts`). M8 adds the chime.

**The mute button mirrors "Fitts speaks out loud".** `aria-pressed` means muted. Speaking
defaults to off so tests and first launch stay quiet.

**The header is the drag region on macOS only.** On Windows and Linux the window keeps its
frame and a drag region would swallow clicks, so `-webkit-app-region` is scoped to
`html.platform-darwin`, with 88px left padding for the traffic lights.

**Cost chip:** spent only during the interview and on Done (no cap), `spent / cap` during the
audit, as in the references.

**The chat log wraps a plain `<ol>`.** `role="log"` on the list itself removes list
semantics and orphans its items (an axe failure).

**New tokens:** `--radius-bubble` (16 16 4 16, the user bubble), plus `chat-in` (fade and rise
6px) and `typing` animations, both off under reduced motion.

**All chat item types are rendered now** (§6.6), including the M5–M7 ones, so later
milestones only wire behavior. Edge-state card text and buttons follow States.html; the
API-trouble card gained a "Pause" answer key.

## M5 — Audit & fix

**The site follows Fitts.** During the audit the site view shows the page Fitts is acting on:
each attention ref maps to a route (`ROUTE_FOR_REF` in `mock/sites`). After "Take the wheel"
the user's own clicks drive it, and rewinding shows the rewound finding's page.

**Overlays re-measure on a short tick** (every 120ms) instead of observers, because the mock
site re-renders under them as routes and state change. Elements that aren't on the current
page simply aren't outlined. The ghost cursor and attention box glide with a 300ms
transition (§6.4), and don't move at all under reduced motion.

**Highlights on / Before / after are toolbar toggles** (`aria-pressed`, dark when on, as in
Auditing.html). "Before / after" replaces the overlays with a split BeforeAfterSlider of
the current page: the `now` site on the left, the `fixed` site on the right.

**Rewind.** A timeline dot (a button "Rewind to <title>") calls `rewindTo(stepIndex)`. The
address bar gets "· rewound to step N", the site shows that finding's page with only its
problem pin, and "Back to live" replaces the toggles. The rewound snapshot is the page plus
pin; the mock doesn't replay intermediate site state.

**The timeline is scaled by steps** (`step / stepEstimate`), so the playhead and the finding
dots (`stepIndex / stepEstimate`) share one axis. The labels show run time (m:ss).

**Findings tray filters.** Ergonomics and content findings are grouped under Usability, since
§6.4 only lists four lens filters plus All. Card status lines also cover Not a problem,
Rolled back and Undone.

**Site-map rows** show child routes by their last segment, indented 14px. `label` holds only
"next" / "later" (§6.4); each dot's status is also spoken ("testing now").

**Pause and Take the wheel act at once in the mock.** §7.2/§7.3 say Fitts finishes the click
in progress first. The mock has no click in progress, so the hold is immediate.

**Driving clicks are logged by label** through the mock site's `data-label`, so hand-back says
"You went through Create Message → …".

## M6 — Finding panel, gate, edge states

**The Finding panel is a non-modal dialog.** It opens over the site view (never the chat),
joins the overlay stack so Esc closes it and focus returns, but does not trap Tab: "Change
the fix" needs the chat's message box. `useOverlay` gained a `trapFocus` option for this.

**The site shifts left** by the panel's width (`max(56% + 12px, 452px)`) with a 200ms padding
transition, so the outlined element stays visible beside the panel (§6.5).

**The footer follows the finding's status, not just the mode.** §6.5 says Autonomous shows
the mint "Fixed and verified" bar, but findings reported after the Autonomous batch haven't
been fixed yet, and saying they were would be false. So: open → Fix it / Change the fix /
Not a problem (in any mode); fixing → the cobalt bar with an indeterminate progress bar;
fixed → the mint bar with View PR and Undo. It also covers states §6.5 doesn't list:
rolled back (Try again, sun), undone (Redo, or "Revert PR #21 opened" for a merged PR) and
dismissed.

**"<check> passes"** names the check by heuristic or lens: H4 → label check, H1 → feedback
check, H2 → content check, accessibility, performance and visual checks, otherwise
usability check.

**Live preview** renders the `now` and `fixed` mock sites at half scale on the page where the
finding's element lives (e.g. step 2 for the NEXT button). **Mockup** is a lilac placeholder
labelled "Mockup · not code". **Evidence** lists who flagged it, how many didn't, and "Replay
it" (rewinds the site view).

**"Change the fix"** prefills "For the button names, instead…" for that finding (the spec's
string) and "For this fix, instead…" elsewhere.

**View PR** shows a toast ("PR #12 opens on GitHub in Phase 2."), since Phase 1 makes no
GitHub calls.

**Gate data follows Gate.html:** holding `DELETE /api/conversations/12`, testing "H3 user
control and H5 error prevention", and the mode line "<mode> · this still asks, every time".
Esc and the scrim mean "Don't do it", "Don't do it" has focus, and "Allow once" unlocks after
the checkbox (§7.8).

**Background notifications.** When a project that isn't on screen is held on a blocking
question or the gate, the renderer asks main for a real Electron `Notification` ("Fitts
needs you", with the question as the body), once per question. Clicking it focuses the
window and opens that project, where the question is in the chat. They are sent only when
"Allow notifications" is on (the mock permission from Welcome); the Scenario panel entry
turns it on. Main records the notifications it sends so e2e can check them and simulate a
click.

**Nothing found keeps the audit screen.** The Done screen has no chat (§6.8), so a card posted
after finishing would vanish. The nothing-found card pauses the run on the audit screen;
"See what I checked" lists the checks, and Stop run goes to Done.

**The budget card shows the cap that was reached** even after "Add $10" raises it.

**New `sun` button variant** for "Try again" (§6.8), and a `panel-in` animation (slide 16px +
fade, §6.5), off under reduced motion.

## M7 — Redesign + Done

**When the redesign view shows.** From the look-and-feel card until the run is done, the
audit layout switches to the redesign variant: no site map or tray, a full-height
before/after of the Hartwell site, and the 420px chat (§6.7). "Before / after" (on by
default) and "Every page" are toggles. "Every page" lists all six pages as smaller
before/after comparisons. These toggles are separate from the audit's.

**The Hartwell site.** `now`: pink background, confetti dots, a rounded "bouncy" system font,
"Party packages", a tilted yellow "Book now" pill. The three directions follow §9.4:
Quiet & dignified (navy and stone, Fraunces, now bundled from
`@fontsource-variable/fraunces`), Warm & personal (brown and caramel, Georgia), Classic &
formal (black and grey, Times). The AFTER tag names the direction ("AFTER · QUIET &
DIGNIFIED"), as in Redesign.html. Swatches and progress steps also follow Redesign.html.

**BeforeAfterSlider got a `fill` mode** to cover its container (full-height comparisons).
Passing `absolute inset-0` as a class lost to the slider's own `relative`, which broke the
audit's before/after too.

**Mock sites use literal colors only.** Tailwind's default palette is removed (M0), so
`text-white` / `bg-white` silently did nothing in the mock sites; they now use `#fff`.

**Done stats are computed from the run,** so Undo, Redo and Try again move them: Fixed &
verified counts verified changes, Pull requests counts distinct PR numbers among them, and
the math line gains an "undone" term when something was undone.

**The change list** shows the four most severe verified changes plus every rolled-back one,
with "See all N changes" to expand (Done.html shows a short list). Redesign and wording
changes get "Look & feel" and "Wording" badges. Undo shows "Undone · PR #13 closed", or
"Revert PR #21 opened" for the merged one (§7.6), with a Redo. Try again shows "Retrying…"
with the rollback reason, then the change verifies and gets a new PR number.

**Cost fixture follows Done.html:** Fixes $7.02 · Reviewers $3.31 · Crawling $1.62 ·
Summing up $1.18 · Images, outlines, voice $0.79 = $13.92.

**Preview pane:** demo/chat previews on `localhost:5180` (the preview server) at
`/compose/confirm`, which shows "Sent to Grandma ✓". The caption counts verified fixes.
hartwell-site previews in the chosen direction.

**Run picker:** past runs exist for demo/chat only (fixtures). Picking one shows its four
stats and "This is an earlier run. Its changes live in their pull requests." instead of the
list and cost bar, which Phase 1 doesn't store for old runs.

**Export report** writes markdown through the native save dialog: summary stats, the math
line, every change with PR, cost and status, every finding, and the cost breakdown. A toast
confirms it.

**The closing message** at the top of Done is Fitts's last chat message, so a stopped run
shows "Stopped the run…" rather than the canned "All done" line.

## M8 — Motion, background shapes, voice UI

**The field is drawn by hand at 30fps.** The canvas uses `frameloop="never"` and a 33ms
interval calls `advance()`. Rapier invalidates the canvas on every physics step, so on-demand
rendering ran at 60fps; driving frames manually caps rendering and physics together, and
stopping the interval pauses both. A paused or still field draws one frame after changes.

**Units are pixels.** An orthographic camera with zoom 1 makes one world unit one CSS pixel
(origin at the center), so walls, the 40px cursor collider and drag positions map directly
from pointer coordinates. Translations are locked to x/y, and shapes still spin freely.

**Pausing.** The field stops when the window is hidden or blurred (`blur` pauses outright;
`focus` resumes), and while any BeforeAfterSlider divider is being dragged (a tiny
`state/background.ts` flag).

**What counts as "the canvas" for drag and throw.** The canvas sits under the UI and never
gets events. A pointerdown counts when its target is the page itself or a layout container
marked `data-backdrop` (Welcome's main, the workspace and Settings wrappers): the empty
paper around panels. Then a raycast picks the shape.

**Mode mapping with Settings.** Welcome is lively and the other screens calm (§6.12). Settings
"Shape movement" Still forces still, Lively forces lively everywhere, and Gentle keeps the
per-screen default. Reduced motion forces still. "Floating shapes" off removes the field.

**Calm layout** places six shapes in alternating edge bands so they show in the gutters
around opaque panels. Layouts use a seeded random source, so screenshots are stable.

**Reactions.** Speaking eases every shape to 1.04× and back. A new finding drops a sphere in
its severity color (wine, coral, sun, neutral-ink) from the top edge, keeping the last four.
The run finishing gives every shape an outward impulse from the center.

**Colors come from tokens at runtime** (`getComputedStyle` on `--coral` etc.), so no hex
values live in the component.

**CSP allows `'wasm-unsafe-eval'`.** Rapier compiles WebAssembly. Nothing else changed: no
network, no inline script, no `eval`.

**three.js and Rapier load lazily** after the UI, so first paint doesn't wait for them.

**The emblem animation** uses an SVG mask to draw the dotted path in behind the cursor
(stroke-dashoffset on a solid path in the mask), moves the cursor with `getPointAtLength`
and easeInOut over 1.1s, then pulses the coral target (1 → 1.35 → 1, 250ms). It runs once on
mount. Reduced motion shows the end state.

**Fitts's voice.** With "Fitts speaks out loud" on, each new Fitts item in the active project is
spoken with `speechSynthesis`: messages and questions in full, and the first line of each
card (finding title, "N fixes are ready", "Fixed and verified ✓ · …", edge-state titles,
"You're driving. I'm watching.", the wording tag). The gate is read aloud when it opens
(§7.8). Lines already in the chat when you open a project are not replayed, and turning
speech off stops it at once. The avatar and the shapes pulse while speech plays.

**The chime** is a WebAudio sine blip (rising on start, falling on stop) when hold-to-talk
starts and ends, and when "Always listening" is turned on or off.

**Test hooks (dev/e2e builds only):** `window.__fittsShapes` (frames, mode, running, body
positions and velocities) and `window.__fittsAudio` (what was said or chimed), since tests
can't watch WebGL or listen.

**E2E expect timeout is 10s.** Under a full run, Electron plus a live WebGL scene
occasionally needed more than Playwright's 5s default for one visibility check.

## M9 — Polish and self-check

**⌥Space / Alt+Space is handled in main.** On Windows the OS opens the window's system menu
for Alt+Space before the page sees it (flagged in M0). Main now swallows the chord in
`before-input-event` and sends hold-to-talk press and release to the renderer. Windows also
swallows the key-ups (Chromium drops the key-up of a swallowed key-down, and releasing Alt
goes to the menu bar), so main treats the hold as released when the key's auto-repeat stops:
up to 1.1s for the OS repeat delay, then 300ms between repeats. Any Space or Alt key-up that
does arrive, or the window losing focus, also ends it. A renderer key-up fallback ends a
hold too.

**"Ask every action" asks before each click (§7.1).** Scenario A asks "Can I tap Compose?",
"Can I tap NEXT?", "Can I send a test message to Grandma?" and "Can I type "grandma" into
search?" as blocking questions (Go ahead / Skip it) in that mode only. In Plan only the
ghost cursor says "looking at" rather than "tapping".

**Approval cards ask only about open findings.** If you already pressed "Fix it" on a finding,
the batch card leaves it out and it isn't fixed twice.

**Rapier crash fixed: drop shapes are never removed.** Unmounting the oldest dropped-in shape
while Rapier still referenced it panicked the WebAssembly world ("unreachable"), which took
the page down at the end of Scenario A. Drops now stop at four instead of rotating, and body
calls skip anything `isValid()` rejects.

**Every Scenario panel entry is axe-clean and scroll-free** at 1440×900 and 1200×720
(`scenarios.spec.ts`, 27 entries). The §12 flows have their own specs: first launch to undo
(`flows.spec.ts` §12.1), the autonomous redesign (`redesign-done.spec.ts`), project switching
with a background run plus the notification click (`flows.spec.ts` §12.3 and
`finding-gate.spec.ts`), stop / pause / interject and Esc on the Finding panel (`audit.spec.ts`,
`flows.spec.ts` §12.4), and Settings (`setup-settings.spec.ts`). A keyboard-only pass covers
setup, the interview and starting the audit.

**The e2e Scenario helper waits after each shortcut press.** Each press toggles the panel, and
under load a re-render can take longer than a fixed short wait, so pressing again closed it.

**`SiteSurface` has no `snapshot(step)`.** §13 lists `snapshot(step)`, but the step's state
(the page and its pin) lives in run data (`rewindStep` and the finding's route), so the
surface stays a pure DOM seam: `getElementRect(ref)` and `refAt(x, y)`.

**Not verified on macOS.** Built and tested on Windows 11. The macOS-only parts (hiddenInset
title bar, traffic-light inset, header drag region, ⌘ shortcut labels) are implemented but
unverified.

## After Phase 1 review

**Blank screen in `pnpm dev` (fixed).** About a second after launch (when the shapes finish
loading, the same moment the emblem cursor lands) Rapier threw "null pointer passed to rust"
and the whole window went blank. React's StrictMode, in development only, mounts, unmounts
and remounts components; `@react-three/rapier` frees its physics world on the simulated
unmount and reuses it on the remount. The error happened inside the canvas, and with no
error boundary React unmounted the entire app. Production builds don't run StrictMode's
double mount, which is why the e2e suite (which tests the built app) passed. Fix: the
background is rendered outside StrictMode, and wrapped in an error boundary so any WebGL or
physics failure removes only the shapes, never the app.

**Autonomous opens pull requests without asking (your call).** Autonomous does everything
except destructive actions: fixes, redesigns and their PRs. This settles the M2 question
about §7.1's "Push/PR asks" column. The Settings note now reads "Destructive actions
**always** ask, in every mode above", and the Autonomous row says it opens pull requests
without asking. In the Ask modes, approving a fix still covers opening its PR. Dangerous
mode is unchanged.

**No push-to-talk key (your call).** The ⌥Space / Alt+Space binding from §7.9 is gone, along
with main's key relay and its IPC channel. You talk to Fitts in two ways:
- the mic button: tap to start listening, tap again to send
- "Always listening for 'Fitts'" in Settings, where only messages starting with "Fitts" count
  as commands

The Settings option "Hold ⌥Space" is now "Tap the mic button" (saved settings migrate from
`hold` to `button`), and the composer hint follows the talk mode. With no binding, Alt+Space
on Windows opens the window's system menu, as in any app.

**Shapes react to the mouse only while it's held (your call).** The cursor collider exists in
the physics scene only while the main button is held down after pressing on the backdrop
(the empty paper, the same rule drag and throw uses). Moving the mouse, or clicking
buttons and panels, never touches the shapes. They keep drifting and reacting (speaking
pulse, finding drops, end-of-run burst) on every screen, and the Shape movement setting
stays.

**Shapes float instead of jumping, and stay on screen.**
- Every shape now drifts on its own slowly turning heading and spins gently, easing back to
  that float after a bump or throw. This replaces the old timer, which kicked every shape
  at once every 4–8 s and made the whole field "shift".
- The frame clock now runs at a fixed 1/30 s per frame. Before, it was passed in
  milliseconds where seconds were expected, which inflated each physics step. It also
  means the field never catches up on paused time.
- The window edge is a wall:
  - walls rebuild on resize
  - fast bodies use continuous collision detection
  - speed is capped at 700 px/s
  - a dragged shape stops 40 px inside the window
  - a last-resort check bounces any shape that still gets past an edge back inside
- A throw uses the pointer's average velocity over the last 80 ms, halved and capped at
  600 px/s.
- New finding drops spawn inside the top edge, and the end-of-run burst is gentler.

**Faster throws, capped spin, grabbing through see-through UI.**
- Throws now keep 90% of the pointer's speed and are capped at 1600 px/s (overall speed cap
  1800 px/s). Continuous collision detection and the bounds check still keep every shape on
  screen.
- Spin is capped at 4 rad/s every frame, so hard collisions can't wind a shape up.
- Shapes can be grabbed (and the press-to-push cursor works) through any see-through UI, not
  only the bare backdrop: text, headings and transparent layout boxes count. Controls
  (buttons, links, fields, labels, ARIA widgets) and anything with its own background or
  inside one (cards, panels, fields) don't, so they keep their clicks and hide the shapes
  behind them. The check lives in `features/background/seeThrough.ts`. Pressing on text with
  no shape under it still selects text as usual; a press that grabs a shape doesn't.

**Before/after is a wipe (your call).** Both panes now span the whole comparison, laid over
each other, and the "before" pane is clipped at the divider (`clip-path: inset(...)`). With
the divider in the middle, the left half shows the left half of "before" and the right half
shows the right half of "after". Nothing resizes or reflows while you drag. This applies
everywhere the slider is used: the Finding panel, the audit's Before / after view and the
redesign comparison.

**"Review each" steps through every fix in the batch.**
- Before this change, "Review each" opened only the first finding. "Fix it" there answered
  the whole batch with that one fix, so the other two were silently dropped.
- Now a finding that's part of a batch Fitts is waiting on opens in review mode. A cobalt bar
  reads "Fix 1 of 3 · 2 left to decide", shows your call so far, and has Previous/Next fix
  arrows.
- The footer offers Approve fix / Skip / Change the fix / Not a problem. "Not a problem"
  also counts as Skip.
- Each call moves on to the next undecided fix. Once all have a call, the batch is answered
  with the approved ones ("Approved 2 of 3") and the panel closes.
- Closing the panel keeps your calls, and the card's button reads "Continue review · 1 of 3
  decided".
- Fix all / Only the serious still answer the batch at once.

**Fitts's voice: the newest line wins, and the line being spoken is highlighted.**
- New Fitts lines cut off whatever is still being said, because the old line no longer
  matches the screen.
- Lines posted at the same moment are still said in order.
- Switching projects stops speech.
- The chat item being spoken gets a cobalt bar down its left edge (cobalt = what Fitts is on
  right now).
- Highlighting is per item, not per word: word-boundary events vary by OS voice, and the item
  bar answers "is this still about what's on screen?"

**Settings → Projects has "+ Add a project".** It opens the same Add a project dialog as
the project menu and Welcome back.

**App icon.**
- `resources/icon.png` (512 px) is the Logos3 option D mark on its app-icon tile: white,
  ink border, rounded corners. It's rendered from `resources/icon.svg`.
- It's set as the window icon (Windows/Linux) and the macOS dock icon. Packaging icons
  (.ico/.icns) can come from the same SVG when there's an installer.

**Taskbar icon on Windows.**
- The window icon was already Fitts, but Windows groups taskbar buttons by app ID. With no
  app ID of its own, Fitts shared electron.exe's identity, and the taskbar could show
  Electron's icon.
- Main now sets `app.setAppUserModelId('app.fitts.desktop')` on Windows.
- Main-process changes need a restart of `pnpm dev` to take effect.

**Budget: Economy is offered at 80%, and 100% requires a higher cap (your call; replaces
SPEC §7.7's "Finish on Economy").**
- The cap is your own spending limit: Fitts runs on your API keys. Economy is cheaper, not
  free, so finishing on Economy at 100% would still break the cap.
- New edge state `budget-warning` at 80%: "I've used 80% of your $20 cap", with Switch to
  Economy / Keep Quality. It doesn't pause the run.
- At 100% ("I've reached your $20 cap") Fitts says it can't continue without a higher cap
  and offers Add $10 / Stop here.
- The Settings cap hint now says the same.
- The Scenario panel has a "Budget warning" entry.

**Site verification direction for Phase 2 (agreed).**
- Code on this computer and localhost need no verification.
- Live-site-only projects verify through a hosting connection first: Vercel, Netlify,
  Cloudflare or GitHub Pages, where the domain listed under your account proves you own it.
- Fallbacks, in order: a DNS TXT record, then a token file or `<meta>` tag.
- Verification is re-checked at the start of each run.
- Fitts never runs on an unverified site, not even read-only.
- Phase 1 mocks this flow in the Add a project dialog (see "Live sites verify by connecting
  your host" below).

**Live sites verify by connecting your host (mocked).**
- The "Live site only" tab has a "Prove you own it" section. Its segmented control offers
  Connect your host (default, tagged Recommended), DNS record and File on your site.
- **Connect your host:** buttons for Vercel, Netlify, Cloudflare and GitHub Pages. A
  1.2 s "Connecting to Vercel… approve Fitts in the window your host opens" stands in for
  OAuth. Then the account's sites appear as radio cards (fixed fixtures in
  `mock/hosting.ts`).
  - Picking a site fills the URL and shows "Verified through Vercel".
  - A typed URL that isn't on the account says so and isn't verified.
  - "Use a different host" goes back to the host list.
- **Fallbacks:** DNS shows the TXT record (`_fitts-verify.<domain>`) and the token, each with
  a copy button. File keeps the `/.well-known/fitts-verify.txt` token. Both use "Check now",
  which succeeds after 1 s.
- Verification is tied to the domain. Changing the URL or the method undoes it, and
  "Add and open" stays disabled until the current URL is verified.
- Host names are plain text buttons, with no brand logos.

**First launch can start with a live site.**
- The setup card ends with a quiet link: "Don't have the code here? Audit a live site
  instead". It sits below the main button, so the code path (the one that fixes things)
  stays the default.
- The link opens the same Add a project dialog on its Live tab (`ui.addProjectKind`), not a
  second copy of the hosting flow. The dialog resets to the code tab whenever it closes.
- A live site still needs a working API key. Until the key works the link is disabled, with
  "Add a key that works first."
- Clicking it saves the key and the chosen mode, just as "Open my project" does.

**Frontend audit fixes (first group).**
- **Finding panel in short windows:** while a finding is open in a window under 860px tall,
  the findings tray hides, so the panel gets the height and its preview stays visible. The
  footer buttons fit on one row.
- **"Now:" row:** shows only while Fitts is acting.
  - Paused: "Paused · up next: …" (neutral).
  - Waiting on you: "Waiting on you · then: …" (sun).
  - Rewound: "Looking back at step N".
  - None of these offer the ⌘. stop hint, because nothing is running.
- **Site down copy:** now says "I'm holding here until it's back", not "I've paused", so it
  doesn't contradict the header's Pause button.
- **Status line:** "Listening" now means the mic is live. While the interview waits for an
  answer, the status reads "Your turn" (it reads "Working" while Fitts types).
- **Interview chip:** the site-view chip during the interview reads "Yours to click · I
  haven't touched anything". "You're driving" is kept for Take the wheel.
- **Live sites are audit-only in the UI:** no Before / after toggle. The Finding panel offers
  "Copy the fix" and "Not a problem" with a one-line explanation, instead of Fix it / Change
  the fix.
- **Nothing found:** the run's counters match the card. All routes are done, steps and
  controls are full, and there's a plausible elapsed time. A "Finish the run" button goes to
  Done, which says "Nothing to change this time…" and labels the preview "Your site as it is
  now". The tray says "No findings. I tried every control…" once the run is complete.
- **Site view route:** with nothing pointed at, the site view follows the route the site map
  is testing, so the URL bar and the site map agree (for example, Uncommitted changes at the
  start of a run).
- **Background project needs you:** the project button gets a sun dot and an accessible
  "1 other project needs you". The project menu row says "Needs you" instead of "Running".
- **Rewind:** shown as a "Rewound · step N" chip next to "Back to live", not as text
  appended to the address. Taking the wheel leaves the rewound moment first.
- **Quick wins:**
  - shorter run placeholder ("Interject, or say 'Fitts, stop'")
  - the Brief has Cancel and example placeholders
  - "1 issue" singular
  - timeline dots have 24px targets
  - Workspace and Settings have a `<main>` landmark, and the workspace has an sr-only h1

**Frontend audit fixes (second group, your calls).**
- **Done header:** the actions wrap under the closing message in narrow windows, instead of
  squeezing the message into a tall column (1200px fits the stats above the fold).
- **Interview ready bar:** one button, "Start the audit". "Skip the rest" did the same thing.
  This replaces SPEC §6.3's two buttons.
- **Clickable site map:** each row is a toggle button.
  - Pressing a row shows that page in the site view (unless you have the wheel) and narrows
    the findings tray to that page and the pages under it.
  - The tray shows an "on /compose ×" chip that clears it. Pressing the row again also
    clears it.
  - The filter combines with the lens filters and resets when a project opens.
- **Welcome back:** each project card is one button, whose accessible name is its visible
  text. A Settings gear sits at the top right of Welcome, in both modes.
- **Rolled back is sun, not red:** Done rows, the tray status and the Finding panel footer
  use sun. CLAUDE.md reserves red for destructive actions and stop, and a rollback is safe.
  This departs from Done.html.
- **Settings panels:** sized to their content (`self-start`); they still scroll when long.
- **Every page (Redesign):** the NOW / AFTER tags sit in a row above each comparison, with
  the route between them, so they can't cover the site. `BeforeAfterSlider` has a `showTags`
  prop for this.
- **Console warnings (not fixed, upstream):**
  - "THREE.Clock … deprecated" comes from @react-three/fiber's own clock.
  - "deprecated parameters for the initialization function" comes from @react-three/rapier
    calling Rapier's `init()`.
  - Neither is in our code, both packages are on their latest versions, and both warnings
    are harmless. They'll go away when those libraries update.

---

# Phase 2

## Phase 2 — verification (V1–V9, Oct 29)

Scripts are in `scripts/verify/` (run with `npx tsx`). They load keys from `.env.local` through
dotenv, never print them, and track spend in `.fitts-dev/spend.json`. Raw results are in
`.fitts-dev/verify/*.json` (gitignored). Total spend for V1–V9: about $0.06.

**V1 — Responses API (`muse-spark-1.3`, `muse-wonder-1.0`): works.**
- `GET /v1/models` lists `muse-wonder-1.0`, `muse-spark-1.3`, `muse-spark-1.3-contributor`,
  `sam-3.1`, `muse-image-1.0` and `muse-voice-transcribe-1.0`, plus older Spark versions.
- Function tools (strict) work on both models. The output comes as `reasoning`, `message` and
  `function_call` items.
- `reasoning.summary: "auto"` returns `summary_text` parts, though short calls often get an
  empty summary.
- `include: ["reasoning.encrypted_content"]` returns encrypted reasoning on every call
  (`store: false`).
- JSON-schema structured output (`text.format`) works on Spark 1.3, contributor and Wonder.
- **Difference from the spec:** reasoning uses 300–650 output tokens even at the lowest effort.
  A 400-token cap returned only reasoning and no text. The LLM client defaults
  `max_output_tokens` to 4000, with 2000 as the minimum.
- **Difference:** `reasoning.effort` accepts `minimal | low | medium | high | xhigh | max`;
  `none` returns a 400. Fitts uses `minimal` for narration and `low` by default.
- Latency for a short call:
  - Spark: about 2.2s
  - Wonder: about 3–8s
  - contributor: up to about 16s, so it's slower
- Wonder can ignore what a schema field is for (it put a whole paragraph in `title`). Prompts
  need per-field instructions and length limits.

**V2 — tokens and cost.**
- One 1440×900 screenshot plus about 12k characters of probe JSON is 5,513 input tokens. The
  image accounts for about 1.7k of those.
- That costs about $0.0069 on Spark 1.3 and about $0.00055 on contributor.
- The count endpoint is `POST /v1/responses/input_tokens` (body `{ model, input }`). Its count
  matched real usage within 5%.

**V3 — SAM 3.1: works, about 1.2s per image.**
- Send `model: "sam-3.1"` with `stream: true`, and an input message containing `input_image`
  plus `input_text` from `buildObjectPrompt` (a box prompt).
- Parse the stream with `parseImageStream(stream).finalResult` from `@meta-sam/parser` 0.1.0.
- A box around the demo's NEXT button returned one mask, with no diagnostics.
  `decodeMaskToSVGPath` gives the outline.

**V4 — Muse Image edits: works, about 12s.**
- `client.images.edit({ model: "muse-image-1.0", image: toFile(png), prompt })` returns
  `data[0].b64_json` (no URL), a 1920×1200 PNG.
- The result was a faithful navy and serif restyle of a Hartwell screenshot.
- It also reports token usage (12.3k in, 1.1k out). The ledger keeps the spec's $0.01 per
  image price and logs the tokens.

**V5 — Transcribe realtime: works.** The spec didn't give the protocol details; these are the
verified ones:
- **URL:** `wss://api.meta.ai/v1/asr/realtime`. `/v1/realtime` rejects the model.
- **Auth goes in the first JSON frame,** not a header: `{ mode, authorization: { accessToken },
  audioEncoding: "PCM_24KHZ" | "PCM_16KHZ", model: "muse-voice-transcribe-1.0", partialMode:
  "CUMULATIVE", emitAudioProgress: true, keywords?: string[] }`. The server replies with a
  `sessionId`.
- **Audio** is raw binary PCM, s16le mono, sent in 100ms chunks. Both 24 kHz and 16 kHz work;
  Fitts uses 24 kHz.
- **Server events:** `speechStart`, `transcript` (a cumulative partial), `speechEnd`,
  `speechComplete` (the final text per turn), `audioProgress` and `error`.
- **Ending:** send `{"type":"endStream"}`. The server sends the last transcript and closes with
  code 1000, "No more transcript segments".
- **Modes:**
  - `PUSH_TO_TALK` fits the tap-to-talk button: the final text arrives right after
    `endStream`.
  - `ENDPOINTING` splits turns by itself and fits "Always listening".
- **"Fitts" was transcribed as "Fitz"** without biasing. With `keywords: ["Fitts"]` it came out
  as "Fitts". Every session sends that keyword, and the wake-word matcher also accepts Fitz,
  Fits and Fritz as a backstop.
- Source: the LiveKit plugin's source. No official Meta reference was found.

**V6 — `muse exec` (Muse Code 1.4.14) runs in WSL2, not natively on Windows.**
- Call it as `wsl -e bash -lc "cd <wsl path> && muse exec …"`, with paths converted by
  `wsl wslpath -a`. From Git Bash, set `MSYS_NO_PATHCONV=1`, otherwise `/mnt/c/…` gets
  mangled.
- All the flags in the spec exist: `--json`, `--prompt-file`, `--model`,
  `--approval-mode never` and `--max-model-steps`.
- `--sandbox-network` takes `restricted | enabled | proxy-only`, so the spec's `restricted` is
  valid.
- Useful extras: `--reasoning-effort`, `--contributor-mode`, `--workspace`,
  `--worktree existing`, `--output-schema`, `--no-session-log` and `--api-key-stdin`.
- **JSONL shape:** one envelope per line, `{ schema_version, sequence, record_type:
  event|status|reconciliation, payload_type, payload }`. The event types Fitts uses:
  - `run.output.delta` (`payload.text`)
  - `task.lifecycle.*` (with `failed.reason`)
  - `run.usage` (calls and tokens)
  - `run.terminal.completed` and the other `run.terminal.*` events

  The parser keys on `payload_type` and treats anything unknown as a log line.
- **Exit codes:** 0 when completed, 2 for bad arguments, 1 when credentials are missing.
- **Credentials:** muse in WSL was **not** logged in (there is no `~/.config/muse/`), and this
  session must not pass keys to it.
  - The real-model V6 run is **deferred** (NEEDS-ALLEN: run `muse login` in WSL).
  - An echo-provider run verified the flags, the events and the exit codes.
- **Fix pipeline:** the spawner supports `museCommand: native | wsl`, defaulting to `wsl` on
  Windows. Until muse is logged in, fixes use the in-process Wonder fixer fallback (SPEC-phase2
  §9.2 step 7).

**V7 — Baseten: works.**
- **Base URL:** `https://inference.baseten.co/v1`. `GET /models` lists
  `meta-models/muse-spark-open` and `meta-models/muse-spark-open-1026`.
- **Client:** chat completions and tool calls work with the `openai` SDK, in about 1–4s. Fitts
  uses chat completions for Baseten; the Responses API there is unverified.
- **Token budget:** reasoning tokens count as output (891 of 920 on a short answer), so
  Baseten calls get the same output budget as Spark.

**V8 — `gh pr create --attach`: present in gh 2.102.0** (≥ 2.99).
- Format: `--attach '<file>#<alt text>'`, up to 50 files per command.
- A body reference like `![alt](./x.png)` is rewritten to point at the uploaded asset.
- If some uploads fail, the PR is still created; the command exits non-zero and still prints
  the URL on stdout.
- The live upload is **deferred** because it publishes to GitHub (see NEEDS-ALLEN).

**V9 — Electron 45 offscreen rendering: fast enough.** Fitts ships the offscreen window; no
screencast fallback is needed.
- A hidden offscreen window at 1280×800 painted at a steady **30.1 fps** while showing an
  animation.
- `toJPEG(80)` took **3.3 ms** per frame, and main used about 14% of one core.
- All of these work on the offscreen window: `webContents.debugger.attach('1.3')`,
  `DOM.getBoxModel`, `Page.captureScreenshot`, CDP `Input.dispatchMouseEvent` clicks and
  `sendInputEvent` (mouse plus `char`).
- Paint images come out 2px wider and taller than the content size requested with
  `useContentSize`. This doesn't matter, because the canvas scales by each frame's real size.

## Phase 2 — P0: demo targets and the source plugin

- **`@fitts/vite-plugin` uses `@babel/parser` plus `magic-string`, not `@babel/core`.** It
  parses `.jsx`/`.tsx` modules and inserts `data-fitts-src="path:line:col"` right after each
  host tag name (lowercase tags only; `col` is 1-based), with a hires source map.
  - It's `apply: 'serve'` and `enforce: 'pre'`. A production build has no stamps (checked).
  - It skips `node_modules` and keeps any stamp that's already there.
- **Demo configs load through `vite --configLoader runner`.** Vite's default loader imports
  the workspace plugin's raw `.ts` source through Node, which fails
  (`ERR_UNKNOWN_FILE_EXTENSION`). The runner loader transforms it, so the plugin needs no build
  step.
- **Ports:** the app's own renderer dev server (electron-vite) moved from 5173 to **5199**, so
  demo/chat owns 5173 as in the spec and the Phase 1 fixture. Previews use 5180, worktrees
  5181+, and Hartwell 3000.
- **demo/chat** is a real Vite + React 19 app with the mock's routes and `data-ref`s.
  - **Routing:** a tiny History API router, so browser back and forward are real (needed for
    #4).
  - **Styling:** plain CSS, no Tailwind, to keep the demo dependency-light and make the
    spacing, font and contrast flaws easy to see in one file.
  - **Backend:** a Vite middleware (`server/api.ts`) with in-memory seed data.
    Conversation 12 is Grandma. `POST /api/__reset` reseeds it (`pnpm --filter demo-chat
    reset`). `GET /help` returns a real 404.
  - **Planted issues:** all 25 come from realistic bugs, not flags. For example, step 2 reads
    `draft.recipient` while step 1 writes `draft.to`, which gives "(null)". Code comments
    don't point at them; `PLANTED.md` is the answer key, with file, ref and detector per row,
    plus the bench scoring rules.
  - **Copy changes from the mock:**
    - The thread's button reads "Initialize thread" (#22), not "Send Text".
    - Settings has 14 toggles (#21), up from 2.
    - Contacts gained a filter (#25) and an add-contact form (#15).
    - The thread gained unnamed call and video icon buttons (#17).
  - **Check:** `scripts/check-demo-chat.cjs` (`pnpm check:demo-chat`) drives the app in an
    offscreen Electron window, the way the CDP driver will, and reproduces **25/25**.
- **demo/hartwell:** six pages on :3000. The routes and refs match the mock (`/services/packages`
  is the "Party packages" page that a redesign renames "Arrange a service" / "Service
  options").
  - **Theme:** every theme value is a CSS variable in `src/theme.css`, including the confetti
    display, the CTA tilt and its wiggle animation, so a redesign is one focused diff.
  - **Two ordinary issues:** footer contrast (#F7A8CC on #FFF1F7) and a contact submit button
    labeled "Go".
  - **Answer key:** `THEME.md`, which also describes the three target directions.
- **Mirrors: `pnpm demo:mirror`** exports each demo as a standalone repo in
  `.fitts-dev/mirror/<repo>` instead of a `git subtree split`.
  - **Why not a split:** a split would carry the `workspace:*` plugin dependency and the
    monorepo tsconfig `extends`, and neither resolves outside the monorepo.
  - **What the export does:** vendors the plugin as `fitts-plugin/` (a `file:` dependency),
    inlines the tsconfig, and commits.
  - **Checked:** the export installs with `--ignore-workspace`, typechecks and builds on its
    own.
  - **Not done yet:** creating the GitHub repos and pushing (`--push`) are deferred
    (NEEDS-ALLEN).
- **Root scripts:**
  - `pnpm test` now also runs the plugin's unit tests.
  - `pnpm typecheck` also covers `scripts/` and both demos.
  - ESLint and Prettier ignore `.fitts-dev/` and `.fitts-worktrees/`.

## Phase 2 — P1: events, reducer, IpcRunEngine, agent process, stores, secrets

- **Events and the one reducer (`packages/schema/src/events.ts`):**
  - `RunEvent` covers the §12.1 groups. Collections have `*.set` events (`routes.set`,
    `findings.set`, `changes.set`, `chat.set`) for edits that aren't appends or in-place
    updates. There is also a `now.changed` event, and a `run.patch` fallback that carries
    `unset` keys, since JSON drops `undefined`.
  - `reduce` is pure and returns the same object when nothing changes.
  - `diff(prev, next)` turns two states into events.
- **Exactness test:** `tests/unit/events.test.ts` checks that `replay(diff…)` equals the
  engine's state after every step. It covers:
  - a whole Ask-mode run with approvals and the gate
  - the interview, pause, wheel, rewind and undo
  - every edge state, the Hartwell redesign, and nothing found
- **The P1 stub agent** is the spec's "replays Scenario A as events", done generally:
  - The utility process (`src/agent/index.ts`, built as `out/main/agent.js`) runs the
    scripted `MockRunEngine`.
  - It turns every state change into events with `diff` and sends them as one batch per
    change.
  - So every Phase 1 flow (interview, audit, gate, approvals, redesign, done, undo) runs over
    IPC unchanged, not just Scenario A.
  - Later milestones replace the scripted engine behind the same message protocol
    (`src/agent/protocol.ts`).
- **Main's `RunHost`:**
  - It validates every engine call: the method must be one of the 22 RunEngine methods, plus
    two dev-only stub calls (`recordUserClick` for "You clicked …" while driving, until P2's
    site recorder, and `setSpeed` for the Scenario panel). The project id must be a plain slug.
  - It appends events to `userData/projects/<id>/runs/<runId>/events.ndjson`, with a
    `snapshot.json` every 200 events.
  - It reduces state per project for renderer reloads (`engine.states()`) and forwards batches
    to the window.
  - If the agent crashes, it's restarted.
- **Engine selection:**
  - `getEngine()` is `IpcRunEngine` whenever the preload exposes `engine`, otherwise
    `MockRunEngine` (unit tests).
  - Loading a Scenario panel entry calls `switchToMockEngine()`, so scenario specs stay on
    the mock as the spec asks. The run store mirrors only the active engine.
- **IPC latency, one test change:** with IPC, a run's first state arrives a few milliseconds
  after "Open my project", and the composer only exists once a run does. The keyboard-only
  flow pressed ⌘L instantly, so it now waits for the message box to be visible, as a person
  would.
- **The file-based project store:**
  - Layout: `userData/projects/<id>/project.json` plus `projects/index.json` (the order,
    `lastOpenId` and the persist version).
  - How it plugs in: it's a zustand `persist` storage adapter that loads synchronously at
    startup over `sendSync`, because `initialScreen()` reads projects at module load, and
    saves asynchronously.
  - Migration: projects in Phase 1's localStorage are imported once, then removed from
    localStorage.
  - Removing a project deletes Fitts's folder for it (`projects/<id>/`), never the user's
    folder.
- **Secrets:**
  - `main/secrets` stores keys with safeStorage in `userData/secrets.json`, one encrypted
    value per key, and reports weak storage on Linux `basic_text`.
  - The preload's `keys` bridge has `set`, `clear`, `test` and `has`. The renderer never gets
    a value back.
  - Welcome and Settings › API keys now check keys for real, 600ms after typing stops (Meta:
    `GET /v1/models`; ElevenLabs: `GET /v1/user`).
  - **Baseten's check is `GET /models`** (free) instead of the spec's 1-token call.
  - Checks run in the agent process (`agent/llm/test-key.ts`), because CLAUDE.md allows
    network calls only under `agent/llm/`. Main sends the agent the current keys on start and
    after any change.
  - **Dev key fallback:** in unpackaged builds only, when safeStorage has no key, main reads
    `.env.local` at the repo root with dotenv's `parse`, which never touches `process.env` and
    never logs anything.
  - **E2E runs** set `FITTS_NO_DEV_KEYS=1`, so they never see real keys, and
    `FITTS_OFFLINE=1`, under which key checks fall back to Phase 1's 8-character rule. Tests
    never call the network.
- **Agent typecheck:** `tsconfig.agent.json` lists the renderer files the P1 stub reaches.
  That list goes away when the real orchestrator replaces the stub.
- **Main-process tests:** unit tests for main-process code live in `tests/main/` (Node
  environment, node tsconfig).

## Phase 2 — P2: the live site view, CDP queries, detection and the dev-server spawner

- **The site is an offscreen BrowserWindow, as V9 showed it could be.**
  - Setup: one window per open project. It's sandboxed, has no preload, uses a
    `persist:fitts-site-<id>` session and denies every permission.
  - Frames: each `paint` frame is encoded with `toJPEG(80)`. The renderer draws it on
    `<SiteCanvas>` at the frame's own CSS-px size, so canvas and site coordinates are
    identical.
  - Sizing: main resizes the window to the panel, debounced 150ms.
- **Transport difference from the spec:** frames go over ordinary IPC (`webContents.send`,
  and through contextBridge as a `Uint8Array`), not a dedicated MessagePort. It's simpler,
  and at 30 fps × about 50 KB it's fine. A MessagePort can replace it without touching the
  canvas if profiling ever shows a cost.
- **Element boxes and refs** come from Fitts's own isolated world (world 1001), using
  `executeJavaScriptInIsolatedWorld`, not raw CDP DOM calls.
  - **Refs:** the element's `data-ref` or `data-testid`, otherwise a stable `e<n>`.
  - **Difference from the spec:** that `e<n>` is stored as a `data-fitts-ref` attribute on the
    element (DOM attributes are shared across worlds), instead of a main-side
    `backendNodeId` map. P4's crawler can add the CDP map if it needs one.
  - **Synchronous boxes:** the renderer's `liveSurface` caches boxes, so `getElementRect`
    stays synchronous for the Phase 1 overlays. It re-measures the refs asked for in the
    last 2s every 120ms.
  - **Point mode:** `refAtAsync` added to `SiteSurface` makes point mode await `refAt` over
    IPC.
- **Navigation:**
  - `will-navigate` and `setWindowOpenHandler` allow only the project's origin.
  - The address bar, Back, Forward and Reload come from the window's own history
    (`navigationHistory`).
  - When the scripted run (or a site map row) changes the route, the live site follows it.
- **Driving:**
  - The canvas forwards pointer, wheel and key events only while the user may drive (the
    interview, or after Take the wheel). It uses `sendInputEvent`, with `char` events for
    typing. IME composition is out of scope.
  - Input is queued strictly in order. A press first asks main what's under the pointer
    (`site.elementAt`: its ref and accessible name, or `[password entered]`), so "You
    clicked …" names the element, not the page the click led to.
  - The cursor shape follows `cursor-changed`.
- **Rewind:** main saves `runs/<runId>/shots/<step>.jpg` on every `step.started`. While rewound,
  the site view shows that shot (`fitts-asset://<project>/<run>/shots/<step>.jpg`) over the
  canvas. The read-only, path-checked asset protocol is allowed in the CSP's `img-src`.
- **Real detection (`main/projects/detect.ts`), behind the mock's result shape (now
  `Detection` in `@fitts/schema`):**
  - What it reads:
    - the framework and default port from `package.json`
    - the dev command from the scripts, plus a `--port` flag or a Vite config's `port`
    - the package manager from the lockfile, searching up to 4 parent folders, since
      workspace packages keep it at the root
    - `git remote get-url origin`, and `gh auth status`
    - whether `@fitts/vite-plugin` is installed
  - **Start path:** a project may declare `"fitts": { "startPath": "/compose" }` in its
    `package.json` (demo/chat does), which becomes `Project.startPath`.
  - **Fallback:** the folder field uses real detection when the folder exists and the Phase 1
    mock otherwise, which keeps the e2e and Scenario fixtures (fake paths) working.
- **Dev servers (`main/site/dev-server.ts`, `main/spawn`):**
  - **Spawning:** argument arrays only. On Windows, npm-style `.cmd` shims go through
    `cmd.exe /d /s /c`, with every token checked against a strict whitelist, since Node can
    only start `.cmd` files that way.
  - **Environment:** `ELECTRON_RUN_AS_NODE` is stripped, and `PORT` is passed (both demos
    read it).
  - **Reuse:** a server already answering on the port is reused and never stopped.
  - **Logs:** the last 20 lines are kept for the site-down card.
  - **Quitting:** servers Fitts started are killed synchronously (`taskkill /T`) on quit.
    The async version left orphans when the app exited first.
  - **Port override:** `FITTS_SITE_PORT` overrides the port (the e2e tests use 5191).
- **When the live view is used:** for local projects whose folder exists, on the IPC engine.
  Otherwise the Phase 1 mock render stays (Scenario panel, fake e2e folders, unit tests).
- **Tests:**
  - E2E (`site-live.spec.ts`, real demo/chat):
    - live frames
    - driving the site in the interview through the canvas
    - point mode returning `compose-to`
    - the problem pin sitting on the real element (within 16px)
    - take the wheel logging "Create Message"
    - rewind showing a real stored shot
  - Unit tests: detection, the spawner's command handling and token guard, and asset-path
    traversal checks.

## Phase 2 — P3: LLM client, cost ledger, model router, budgets

- **`agent/llm/call.ts` is the only place the agent calls models.**
  - **Clients:** Meta uses the Responses API through the `openai` SDK; Baseten uses chat
    completions, translated from the same request shape. `max_output_tokens` is never below
    2000 (V1).
  - **Retries:** 3 retries with exponential backoff and jitter on 408/409/429/5xx and network
    errors. A 4xx is never retried.
  - **Aborts:** a `signal` (⌘.) stops the call and any pending backoff. An abort that lands
    before the sleep was a real bug, found by the unit test and fixed.
  - **Rate limits:** the `x-ratelimit-*` headers are captured.
  - **Budget:** calls are refused (`BudgetExceeded`) while the run is at its cap.
  - **Ledger:** every successful call writes one `CostEvent`.
  - **`api-trouble`:** after 3 failed retries, `onTrouble` fires; it drives the card in P4.
- **The ledger (`agent/ledger`):**
  - Entries roll up into the five `CostPhase` values by the §11 table, with per-finding
    `costUsd`.
  - `CostEvent` and `CostTask` live in `@fitts/schema`. A new `ledger.entry` event logs each
    entry for reports; the reducer ignores it, and `cost` carries the totals.
  - **Price table:** `agent/llm/pricing.ts`, version `2026-10-28`.
  - **ElevenLabs:** estimated at $0.00011 per character. That's an assumption to check
    against the actual plan.
- **Stub-period cost:** while the scripted engine still plays runs, a run's cost is its
  scripted spend plus its ledger totals (`withLedger`). The agent applies this before diffing,
  so `cost` events always carry the combined figure. When P4 replaces the script, the ledger
  is the only source.
- **Budget guard:**
  - It posts `budget-warning` once per run at 80% and `budget` at 100%, from the combined
    spend.
  - Floats are compared with a 1e-9 slack: 0.1 × 0.8 = 0.08000000000000002 would otherwise
    skip the 80% card.
  - "Add $10" re-arms the 100% card at the new cap.
  - "Switch to Economy" sets the run's profile, used from the next model call on.
- **Settings reach the agent:** every engine call carries `settings` (cap, profile,
  contributor mode), and a run takes the cap when it starts (interview or audit).
- **Router (`agent/llm/router.ts`):** follows the §2 table.
  - Quality's reviewers are 3 Spark plus 2 Wonder, with one Spark reviewer on Spark Open when
    a Baseten key exists.
  - Contributor mode applies to `demo*` projects unless the user opts a project in.
- **Checks:**
  - `scripts/verify/p3-ledger.ts` made one Spark, one Wonder and one Baseten call through
    `LlmCaller` ($0.0155). All three are in the ledger with the right phases, and their
    responses are the first fixtures in `tests/fixtures/llm/`.
  - In the running app (dev build, dev keys), the Scenario panel's "Ping the models" made the
    same three calls ($0.0044). They flowed through the ledger and cost events into the run.
    The header chip shows whole cents, so a sub-cent ping doesn't change its digits.
  - E2E: a $0.10 cap set in Settings makes the 80% card warn and the 100% card pause the run.
- **Welcome and stored keys:** a key main already holds (saved earlier, or the dev fallback)
  shows as "Works" without retyping, until the user types a different key.
- **Dev repo root:** the dev `.env.local` fallback and the dev spend log
  (`.fitts-dev/agent-spend.ndjson`) find the repo root by walking up to
  `pnpm-workspace.yaml`. `pnpm dev` and the e2e harness start Electron from different
  folders.

## Phase 2 — P4: crawler, coverage gate, run controls, edge-state triggers

- **When the real engine takes over.** `startAudit` starts a `RealRun` (agent
  `orchestrator/run.ts`) only when main reports the project's live site as `running`. Without
  one, the stub engine plays the scripted audit as before, so every Phase 1 flow keeps working.
  The interview stays on the stub until P7. The real run starts from the interview's state.
- **Brains.** The coverage gate decides when a route and the run are done. A brain only picks the
  next action. `SparkBrain` makes one tool call per step and may only pick a control that is
  still untried on the current page. Anything else (no tool call, an unknown ref, a parse error)
  falls back to `ExplorerBrain`, which is deterministic: fields first, then buttons, then the
  next route. Offline, keyless and `FITTS_CRAWL_BRAIN=explorer` runs use the explorer only, and
  so do e2e tests. Page content goes inside `<untrusted_page_content>`.
- **What counts as a control.** Links in nav, header and footer only discover routes, because
  they repeat on every page. Buttons in those regions are real controls: demo/chat's Search,
  Contacts and Settings are nav buttons, and treating them as chrome left three routes
  undiscovered. Query strings and trailing slashes don't make new routes.
- **Destructive names are never clicked in P4.** Names matching delete, remove, pay, purchase,
  buy, checkout, transfer, unsubscribe, cancel plan or close account are marked skipped ("needs
  your OK first"). The permission gate (P8) will ask instead.
- **Typed text is always marked.** It is `fitts-test` in search fields, `555-0199` in phone
  fields and `fitts-test message` elsewhere. If the model's text lacks the prefix, it is added.
- **Step shape.** Each step emits `step.started` (main captures the step shot), sets the
  attention ring on the target, waits 350ms so the user sees what's about to happen, then acts.
  If the user pauses or takes the wheel during that wait, the action is dropped. Runs stop at
  200 steps.
- **Pause, wheel and stop happen at step boundaries.** The loop sleeps while paused,
  user-driving or waiting on the user, and is woken by resume, hand-back or a card answer. ⌘.
  aborts the model call in flight through the run's AbortController (the next call gets a fresh
  one) and posts the `stopped` card. Queued messages are delivered after the step finishes.
- **Edge states come from real conditions.**
  - **site-down:** a snapshot fails and a health check says the server is down, or 3 actions
    fail in a row, or main's health watch reports `failed`. *Restart server* goes through main's
    spawner.
  - **login-wall:** a password field on a route or title that looks like a login page.
  - **api-trouble:** `LlmCaller`'s `onTrouble` after retries are used up. It retries on its own
    after 12s.
  - **budget:** the 80% and 100% cards come from the ledger, as in P3.
- **When the crawl completes with no findings,** the run posts the `nothing-found` card (P4 has
  no reviewers yet). *Show what you checked* lists the pages, the control count and the last
  steps.
- **Test-only fix.** In the e2e test, `getByRole('button', { name: 'Back' })` also matched
  "Hand back to Fitts", because names match by case-insensitive substring. The test was handing
  the wheel back itself, which looked like the crawl kept going while the user drove. The
  unit test (`tests/agent/run.test.ts`) confirmed the run itself was correct.

## Phase 2 — P5: deterministic probes

- **Package shape.** `packages/probes` holds two parts:
  - `src/page.ts`: the in-page probes, bundled with axe-core into `dist/page.js` by esbuild. The
    file is gitignored and built by the desktop `dev`, `build` and `test:e2e` scripts.
  - `src/analyze.ts`: pure analysis with no DOM, shared with the agent.

  Main imports the bundle with `?raw` and injects it into isolated world 1001 once per page,
  next to the existing ref helper. Both workspace packages are bundled into main and the agent,
  not externalized.
- **Results are evidence, not findings yet.** Each probe emits a `probe.result` event with a
  `ProbeResult` (`evidenceId` `<runId>-ev<n>`, probe, route, pass, items). The reducer ignores
  it, like `ledger.entry`. P6's reviewers cite these ids, and the aggregator turns probe
  failures into findings. P5 posts nothing to chat.
- **When each probe runs:**
  - **On a route's first visit:** contrast, target-size, button-name, link-name,
    placeholder-leak, font-inventory, spacing and web-vitals (one axe pass for the three axe
    rules), then focus-visible and viewport-sweep.
  - **After every click or typing:** feedback-timing, error-message and fitts-id.
  - **After moving on from a page where something was typed:** back-mid-flow.
  - **When the crawl ends:** links, network and label-consistency.
- **Contrast also checks placeholders.** axe doesn't, and people read them (#8). The color
  comes from the author's `::placeholder` rules, not computed style.
- **Target size is measured directly:** under 24px fails, under 44px counts as "comfortable".
  axe's spacing exception would pass demo/chat's 28×20 Send link. Inline links in a sentence
  and checkboxes inside labels are exempt.
- **Spacing counts only the site's own declared px values** that some visible element uses.
  Browser defaults (an h1's 0.67em margin, a button's 6px padding) would flag every site. It
  fails at 3 or more distinct off-grid values; 1 and 2px hairlines don't count.
- **Focus-visible uses real Tab presses from main**, not `el.focus()`. After the crawler's mouse
  clicks, programmatic focus wouldn't match `:focus-visible`, so sites that style it correctly
  would fail. Each focused element is compared with how it looked unfocused. The sweep stops
  when focus wraps around, and blurs at the end.
- **Network goes through a CDP debugger on the site window.** It records only Fetch, XHR and
  Document requests (the dev server's module loads would crowd them out), tagged with the
  route and the control in use. Each big JSON endpoint's body is parsed once to count its
  longest array.
- **Click and type ops are traced.** They arm a MutationObserver first; after the 450ms settle
  they wait (up to 10s) for the API calls they started, then read what appeared: loading
  indicators, live-region text, generic error text. Typing is paced at 40ms a character, so
  per-keystroke requests show up as they would for a person.
- **The feedback rules:**
  - A request over 1s with no loading indicator by 1s fails.
  - A successful POST/PUT/PATCH/DELETE from a click with no confirmation fails.
    "Confirmation" is a live region, or short text starting with sent, saved and the like. Page
    content that happens to say "thanks" doesn't count.
  - A click that changed nothing on screen, didn't navigate and sent no request fails.
- **Empty submit (error-message).** On a form's first visit, Fitts taps its submit-like control
  (Next, Send, Save, Create, Add, …) with every field empty before typing anything. Search
  fields are excluded.
- **Retry after an error.** A control whose action showed an error is tried once more, the
  next time the crawl reaches its page through a click (by then the earlier steps are filled
  in). That's how demo/chat's Send gets both the empty-text error (#14) and a successful send
  with no confirmation (#3).
- **Label consistency is deterministic for now.** It uses forward actions (clicks that
  navigated) whose labels are action words, and flags:
  - two different labels on one page that go to the same place;
  - three or more labels for one flow's forward step;
  - seed-synonym pairs across the site.

  Lists of names (contacts) are ignored. Spark clustering is left to P6's reviewers.
- **Links are checked from the page itself.** Same-origin HEAD requests (GET when HEAD gets
  405) run from the isolated world. No new network code in the agent or main, so CLAUDE.md's
  network-call rule holds.
- **web-vitals uses PerformanceObserver** (LCP and CLS, buffered), not the `web-vitals`
  package. INP needs real interactions over time and is left out. This probe is on the cut list.
- **Fitts ID** is computed from the previous click to a main action's target (a click that
  navigates or has a submit-like label). It fails above 4 bits.
- **What probes don't catch on demo/chat:** #6, #18, #21, #22 and #25 are for reviewers (P6),
  #15 needs a trace reviewer, and #16 is the gate (P8). All 18 probe-detectable planted issues
  are asserted in `site-live.spec.ts`, read from the run log.

## Phase 2 — P6: reviewers, aggregator, evidence check, suggestions lane

- **Prompts and schema.**
  - Each persona's prompt lives in `docs/prompts/reviewers/`: `novice`, `power-user`,
    `accessibility`, `visual-design` and `trust`, with `_shared.md` appended to each. The agent
    imports them with `?raw`, so the docs are the prompts.
  - Persona names match Phase 1's `agreement.who`: Novice, Power user, Accessibility, Visual
    design, plus Trust & ethics. Probe evidence shows as "Probe".
  - Drafts follow `packages/schema/src/finding.schema.json` (strict JSON schema).
- **Evidence ids.** Each route offers `<route>#shot` (the screenshot from the first visit),
  `<route>#snapshot` (its controls), `<route>#trace` (what Fitts did there) and P5's probe ids.
  A draft that cites none of them is dropped. A ref that isn't on the page becomes null, and
  severity is clamped to 1–4.
- **When the panel runs.** It reviews every visited route after the crawl and probes finish:
  5 personas in parallel, 2 routes at a time. Findings arrive together at the end, not as each
  route finishes. That keeps the crawl and the panel from competing for the site window, and
  keeps the run's events in a clean order. Streaming per route can come later without changing
  the aggregator.
- **The aggregator is deterministic; the model aggregator call is deferred.**
  - Every probe item gets a plain-language template. Findings group by probe plus title across
    all routes, so "same issue, several screens" becomes one finding with `locations`.
  - Reviewer drafts join the probe finding they cite (same element, then a similar title),
    then a draft cluster on the same route (same element or similar title). Drafts about a page
    that a broken link leads to join that link's finding.
  - One vote per persona per finding.
  - Wonder's ±1 severity adjustment and its cross-route merging aren't wired yet. The
    deterministic rules met the bench, and every extra model call adds variance and cost.
- **Severity rubric.** Impact comes from the probe template, or the reviewers' median. It goes
  up one for 3+ screens (frequency) and up one for 3+ agreeing reviewers when impact is at
  least 2 (persistence), capped at 4.
  - Probe impacts were tuned on the offline bench: cut-off text is 1, sideways scrolling 2, a
    no-op button 1, LCP 1.
  - Uncached repeats count only when they waste at least 200 KB. A small JSON endpoint
    refetched on each visit isn't worth a finding.
- **The evidence check.** A finding is *grounded* if it has a probe result, or cites the trace
  or the snapshot. A screenshot alone isn't grounded: it's the reviewer's opinion of a picture.
  - **Shown:** grounded and (a probe finding, or 2 of 5 reviewers agree).
  - **Suggestion:** everything else. Suggestions are created (`lane: 'suggestion'`), counted on
    Done and listed in the report, but get no chat card and no pin, and the tray filters them
    out.
- **Posting.** Every finding is a `finding.created` event. Shown ones also get a `finding` chat
  item and a numbered pin, as the Phase 1 scenario's `report()` does. Fix approval cards are
  P9.
- **Panel models.** The roster comes from `reviewerRoster(profile)` each time it runs, so
  "Switch to Economy" applies to the next route reviewed. Baseten's chat-completions client
  gets the text only, no screenshot, and its `json_schema` drops the Responses-style `type`
  field.
- **`pnpm bench:chat`.**
  - It's a separate Playwright config (`playwright.bench.config.ts`) that launches the built
    app with the developer's keys (main's dev fallback to .env.local).
  - It runs one real audit of demo/chat on Economy with contributor pricing, a $2 cap and the
    explorer crawl, then scores the run log against `tests/bench/planted.ts` and prints recall
    and precision.
  - Matching is a maximum one-to-one matching on place (route, locations or ref) plus problem
    words. `BENCH_OFFLINE=1` scores the probes alone, for free.
  - Findings are kept in `.fitts-dev/bench/` for tuning.
- **Results.**
  - **Offline (probes only):** recall 18/25, 0 false positives.
  - **Live, two runs:** recall 20/25 (80%) with 2 false positives each time, about $0.026 a run.
    The reviewers added #21 and #22.
  - Both runs meet the P6 bar exactly, with no margin. The false positives are plausible,
    unplanted issues ("Can't tell who is selected" on the compose chips, "Search gives no
    guidance"), and which one appears varies by run.
  - The panel misses #6, #15, #16, #18 and #25. #16 is the gate's (P8), and #15 needs a trace
    of the form clearing.
- **Fix in the build.** Bundling the new shared code put Rolldown's CJS helper inside the agent
  entry, so main loaded `agent.js` and crashed at launch. `preserveEntrySignatures: 'strict'`
  keeps shared code in chunks.

## Phase 2 — P7: the real interview and theme-fit

- **The interview's state stays in the stub engine.** Phase 1's opener, brief card,
  quick-replies handling and ready bar already live in `MockRunEngine`. The agent adds model
  turns on top through three new stub methods:
  - `interviewUser` posts the answer and shows Fitts typing;
  - `interviewReply` merges the brief fields, says the line and posts quick replies;
  - `interviewFallback` runs the scripted step.

  One owner keeps the event diff simple. The interview only moves to RealRun if it needs to
  act on the site, and it doesn't: the user drives it.
- **When the model answers.** An `answerInterview`, or a `sendMessage` without `pointingAt`,
  while the run is in the interview phase goes to the model when:
  - the project's live site is running,
  - a Meta key exists,
  - and the run isn't offline.

  Otherwise the Phase 1 script answers, and so does any failed or unusable model turn.
- **What the model sees:**
  - the conversation (Fitts as assistant, the user as user);
  - the brief so far;
  - how many questions it has asked (out of 6);
  - the current page's path, title and headings, inside `<untrusted_page_content>`;
  - the screenshot;
  - the paths the user clicked through, from site-status URL changes.

  Output is strict JSON with all six brief fields (null for untouched ones), say, quickReplies
  and ready. Values are trimmed summaries. `ready` isn't trusted: the UI's own rule (For and
  Who known) shows the ready bar, as in Phase 1.
- **Theme-fit** runs once, alongside the crawl, when the 3rd route is first recorded. It gets
  the brief, those routes' screenshots and their font-inventory summaries, which now include
  the 8 most-used text and background colors.
  - **Doesn't fit:** the run posts the `lookfeel` card (the model's why) and a `directions` card
    (3 directions with hex swatches only).
  - **Autonomous:** picks the first direction. The prompt asks for the closest first, which
    stands in for "model-ranked".
  - **`pickDirection`:** marks the card and acknowledges the choice in chat.
  - **Deferred:** mockups (Muse Image) are P10, and applying a direction is a fix job (P9).
  - A verdict that says "doesn't fit" without 3 usable directions is dropped, not half-posted.
- **The model per profile follows §2:** Wonder on Quality, Spark on Economy, Spark Open on
  Open weights with a Baseten key.
- **Fixtures are recorded from the app itself.** With `FITTS_RECORD_LLM=<dir>` (dev only), each
  real response is saved as `<fixture>.json`, without reasoning items: their encrypted blob is
  opaque, and it happened to contain an `sk-`-looking substring that would trip secret scans.
  The P7 live checks recorded `tests/fixtures/llm/p7/interview-turn.json` and `theme-fit.json`,
  and unit tests replay them.
- **Live checks** (`tests/bench/p7.bench.ts`, Economy with contributor pricing, under $0.01):
  - **demo/chat:** the first answer filled For "Family messaging for grandparents" and Who
    "Older adults, grandparents", and the ready bar showed.
  - **demo/hartwell:** `fits: false`. "You told me this is for bereaved families seeking calm.
    Hot pink, bright yellow and a bouncy rounded font with party language read as festive…"
    Directions: Quiet stone, Soft willow and Gentle dusk.
- **The unit test's fake app gained a third page.** With it, the back-mid-flow probe finds a
  real "no back or cancel" problem there, so that crawl now ends on its own with one finding,
  instead of on the nothing-found card.

## Phase 2 — P8: the permission gate, Fetch interception and modes

- **Enforcement is at the network, in main.** Each site window enables CDP `Fetch` for XHR and
  Fetch requests at the Request stage (alongside the P5 Network recorder on the same debugger).
  - GET, HEAD and OPTIONS always pass.
  - **A write is held** only while Fitts itself is acting (a traced click or typing), and only
    if it is: a DELETE; a write to a payment-like path (pay, checkout, purchase, billing,
    charge, subscribe); or any write while Fitts taps a control named like a destructive one
    (the §13 name list).
  - Held requests go to the agent (`siteHeld`), which answers with a `release` op:
    `continueRequest` or `failRequest('BlockedByClient')`.
  - **The user's own clicks are never held,** while driving or otherwise. The gate guards
    Fitts's actions, not the user's.
  - A held request with no run to ask is failed. A run that's disposed with one held fails it.
- **The crawler now taps destructive controls through the gate.** P4 skipped them ("needs your
  OK first"). The tap happens, its write waits at the network, and the gate modal shows the
  real request (`DELETE /api/conversations/12`).
  - A purely client-side delete with no request isn't caught. Accepted for now: the spec's
    enforcement is the network, which holds even when the click was misclassified.
  - The modal's Phase 1 copy ("I want to tap…") reads slightly early, since the tap has
    happened and the request is what's held. The modal's "I'm holding" row shows exactly that.
- **The gate's answers:**
  - **Allow once** sends the request.
  - **Don't do it** and **Test something else** fail it.
  - Each answer is logged (`gate.requested`, then `gate.decided` with the decision) and
    acknowledged in chat with the Phase 1 lines. Nothing else happens while the gate is open:
    activity is `waiting-on-user`, and `waitingFor` is `gate`.
- **Dangerous mode** releases held writes without asking, with "Dangerous mode is on, so I
  tapped …". It only does this when the run's origin is localhost (localhost, 127.0.0.1, ::1 or
  `*.localhost`). Anywhere else it asks like every other mode.
- **Modes are read at each action:**
  - **Plan only:** never clicks or types. Each control is marked "Plan only: looked, didn't
    touch", and Fitts says once that it's only looking. Navigation and probes still run.
  - **Ask every action:** a blocking question before each tap or typing ("Can I tap NEXT?",
    Go ahead / Skip it). "Skip it" marks the control skipped. A question still open when the
    user takes the wheel, presses ⌘. or stops the run resolves as Skip, so the loop can't hang.
  - **Ask when unsure:** acts. The confidence check (< 0.6 asks) waits until the crawl has a
    confidence signal; the explorer and the Spark tool loop have none yet.
  - **Autonomous:** acts.
- **Fix and PR rules per mode** belong to the fix pipeline (P9).
- **Acceptance:**
  - **Live (e2e on demo/chat):** the gate showed "Delete conversation" on /contacts/grandma
    holding `DELETE /api/conversations/12`. The server hadn't received it before the answer.
    "Don't do it" failed it, and conversation 12 still exists.
  - **Unit (RealRun):** Ask every action asks before each tap, Plan only never clicks or
    types, Allow once sends, and Dangerous mode sends on localhost but asks elsewhere.

## Phase 2 — P9: fix pipeline, verification, PRs, preview branch, undo/redo/retry

- **The split.** Everything privileged is main's `FixHost` (`main/fix/`): worktrees, file access
  inside them, the worktree's dev server and a hidden verification window, commits, PRs and the
  preview branch. The fixer's model calls stay in the agent (`agent/fix/`, inside the
  `agent/llm/` network boundary), and they reach files only through FixHost over the
  existing site RPC (`{ op: 'fix', call }`).
- **Fixes need a project that is its own git repo.** `git rev-parse --show-toplevel` must be
  the project folder. A folder inside another repo (demo/chat inside the fitts monorepo, as in
  every e2e test) gets no fixes, so Fitts can never create branches in a repo the user didn't
  open. Real runs and the P9 bench use the standalone mirror.
- **Worktrees and dependencies.**
  - Each job gets `git worktree add <root>/.fitts-worktrees/<runId>/<findingId> -b
    fitts/<heuristic>-<slug> HEAD`. Taken names get `-2`, `-3`.
  - `.fitts-worktrees/` goes in `.git/info/exclude`.
  - Dependencies: `pnpm install --offline --frozen-lockfile`; if that fails, a junction to the
    project's own `node_modules`.
  - The mirror export now commits its `pnpm-lock.yaml`. It used to commit before the lockfile
    existed, so clones couldn't install frozen.
- **The fixer is the in-process fallback, since Muse Code isn't logged in.** It's a tool loop
  with read_file, search, apply_patch (one exact excerpt, which must occur once; CRLF files
  are handled) and done, for up to 14 steps. Paths are confined to the worktree, and `.git`
  and `node_modules` are off limits.
  - The task file follows §9.2: the finding, the evidence, the plugin's source hint, the
    constraints, the check, and on retry the rollback reason.
  - The model follows the router's `fix` job: Wonder on Quality, Spark on Economy. Dev runs
    use Economy with contributor pricing.
- **Verification** (§9.2: the exit code never counts).
  - The worktree's dev server runs on 5181+. A Vite `dev` script has its own `--port` and
    `--strictPort` replaced, because the mirror pins 5173.
  - A hidden window on the finding's route runs the page probes, a Tab focus sweep, the
    360/768/1280 sweep, and the broken hrefs for link findings.
  - **Pass** = the finding's probe no longer reports its problem (same probe and title), and
    no problem at severity ≥2 appears that the run's own probes didn't already see on that
    route.
  - Verifications run one at a time: worktree servers share the project's dependency cache.
- **What gets fixed automatically.** Only findings whose check verification can re-run: the
  page probes, focus-visible, viewport-sweep and links.
  - Trace findings (network, feedback timing, error messages, back mid-flow, labels) and
    reviewer-only findings aren't fixed automatically. Verifying them would mean replaying the
    flow, and a fix with no check would be "verified" without proof.
  - They stay open, with the reasons and suggested fixes in the findings.
- **Modes (§9.3).**
  - **Plan only:** says what it would fix.
  - **Autonomous and Dangerous:** start every fixable finding right away, and open each PR as
    soon as it verifies.
  - **The Ask modes:** post the approval card. Approving, or Fix it on one finding, covers
    the PR.
  - A fix started in Autonomous after which the mode changed asks ("Can I open a pull request
    for …?") before its PR.
- **PRs.** The `gh` backend pushes the branch and runs `gh pr create --body-file`.
  - With `FITTS_GH_DRY_RUN=1`, the dry-run backend pushes to the repo's own `origin` (a local
    bare repo in tests) and keeps `.fitts-worktrees/dry-run-prs.json` as the PR registry.
  - The PR body has the heuristic and severity, the problem, the fix, the evidence, the
    verification and the repro, with no attribution footer.
  - The commit message is `<title> (Fitts: <heuristic> sev <n>)`, with no trailers.
  - The body file is written next to the worktree, never inside it.
  - `--attach` screenshots and the gh-version fallback (`.fitts/pr-assets/`) are part of the
    real-PR check (`scripts/real-pr-check.md`, NEEDS-ALLEN 4). After-screenshots aren't
    captured yet.
- **Undo, redo, retry (§9.4).**
  - **Undo** of an open PR closes it and deletes its branch ("Undone · PR #n closed"). Undo of
    a merged PR creates `fitts/revert-<n>` from the fix branch with `git revert`, and opens it
    as a PR ("Revert PR #m opened").
  - **Retry** of a rolled-back change re-runs the job with the reason added, and keeps the
    change's id. **Retry** of an undone change re-opens a PR from its branch (redo).
- **FINALIZE.** Once the approval is answered and every job has settled, verified branches are
  merged into `fitts/preview-<runId>` in a worktree, and Done follows.
  - Serving the preview on :5180 for the Done view's preview pane is deferred to P12. The
    branch exists, and Fitts says so in chat.
  - Done's line reports verified fixes, PRs and rollbacks, like the Phase 1 copy.
- **Rollback check.** `FITTS_SABOTAGE_FIX=<n>` (dev and tests only) makes the nth fix job make
  no change, so it rolls back ("no change made: deliberately skipped (rollback check)"). The
  bench then retries it.
- **Live result** (`tests/bench/p9.bench.ts`: a throwaway clone of the demo/chat mirror with a
  local bare origin, Autonomous, Economy with contributor pricing; 5.4 minutes).
  - **Verified:** 8 fixes, each with a dry-run PR: font families, focus outline, spacing,
    placeholder contrast, tap target, "(null)", icon-button names, cut-off text.
  - **Rolled back and retried:** the sabotaged text-contrast fix, verified on retry as PR #9.
  - **A genuine rollback:** the /help link. The 404 comes from the server middleware, and the
    fixer's change didn't fix it, so verification refused it.
  - **Undo:** an open PR's undo closed it. Undoing a PR marked merged opened revert PR #10.
  - **Diffs** are small and targeted, and commits have no trailers. Quality varies (see Known
    issues).

## Phase 2 — P10: SAM 3.1 and Muse Image

- **Where calls live.** `agent/llm/media.ts` (inside the network boundary) uses the V3 path for
  SAM: Responses streaming with `buildObjectPrompt` box prompts, parsed by `@meta-sam/parser`.
  Muse Image uses `images.edit` with a PNG.
  - Each call is a ledger entry in the `media` phase, at the pricing table's SAM ($0.0025 an
    image) and image ($0.01) prices.
  - Every failure returns null: the UI keeps the DOM box, or the lilac placeholder.
  - `FITTS_NO_MEDIA=1` turns media off.
- **Inputs come from the route's first visit.** When Fitts first sees a route it keeps the
  screenshot, its size, and the boxes of every snapshot control and probe item (a new `rects`
  site op). SAM gets that shot plus the finding element's box. The shot is in CSS px at device
  scale 1, the same as the boxes.
- **What runs, and how much.** After the review posts findings, in the background:
  - SAM outlines for the 12 most severe shown findings that have an element box;
  - Muse Image mockups for the 4 most severe;
  - a mockup per theme-fit direction, on the first route's shot.

  The caps keep a run's media cost near $0.07. Results are cached on the finding (`assets`) or
  the direction option (`mockup`).
- **Assets.** The agent sends bytes to main (`saveAsset`), which writes
  `runs/<runId>/assets/<name>`, served as `fitts-asset://` (now including `.svg`). JPEG shots
  are converted to PNG in main (`nativeImage`) for Muse Image.
  - The SAM outline is stored as an SVG, not a PNG mask: the mask's outline path with a coral
    stroke and a light fill, in the shot's coordinates. It's drawn over the route shot, and it
    scales with it.
- **UI** (only when assets exist; mock runs and the Scenario panel look as in Phase 1):
  - The Finding panel's Live preview shows the real shot with the outline.
  - The Mockup tab shows the mockup with its "Mockup · not code" tag.
  - Direction cards show their mockup above the swatches, with the same tag.
  - Live overlays keep the DOM box (instant), as §10 says.
- **The severity rubric is capped at one step up.** P10's live run showed minor problems
  ("Text is too faint", "Tap target is too small") at Severity 4 · Catastrophic. Frequency
  (3+ screens) and persistence (3+ reviewers) each added a step, and with reviewers now citing
  probe evidence, both fire often. Now either one raises severity by one step, at most once,
  so only a major problem can become catastrophic.
- **Live check** (`tests/bench/p10.bench.ts`, about $0.10):
  - **demo/chat** (a mirror clone in Ask when unsure, so the audit screen stays up): 11
    findings outlined by SAM, and the Finding panel showed the outline and a real mockup.
  - **hartwell:** all 3 directions got Muse Image mockups.
  - Screenshots are in `.fitts-dev/bench/p10-*.png`.
- **The Done screen has no Finding panel** (Phase 1 design), so the outline and mockup are
  seen during the audit. PR images (`--attach`) use the step shot. Attaching the outline is
  part of the real-PR check.

## Phase 2 — P11: voice

- **The split.** Main holds the sockets and the keys (`main/voice/`, inside the network
  boundary). Its `TranscribeSession` speaks the V5 protocol: the key in the first JSON frame,
  binary PCM, `endStream`, and the `keywords: ["Fitts"]` bias. Its `SpeechStream` uses
  ElevenLabs Flash v2.5 stream-input with `pcm_24000`.
  - The renderer captures the mic: a 24 kHz AudioContext (Chromium resamples), and a worklet
    that batches 100ms s16le frames sent over IPC. It plays Fitts's voice through Web Audio.
  - IPC is used instead of the spec's MessagePort: frames are small (4.8 KB each), and site
    frames already go over IPC the same way.
- **Mic permission.** The default session grants `media` only when every requested media type
  is audio; everything else is denied. Site windows have their own sessions, which deny
  everything. macOS's `askForMediaAccess` isn't wired yet (macOS is unverified).
- **The worklet loads from a file.** Vite inlined it as a `data:` URL, which the CSP
  (`script-src 'self'`) blocks, so mic capture failed silently. It's imported with
  `?url&no-inline`.
- **Tap to talk.** The first tap opens a PUSH_TO_TALK session and the mic, and partials show in
  the message box (`micPartial`). The second tap ends the stream and sends the final text with
  `spoken: true`. The final is the server's `speechComplete`, else the last partial, with an 8s
  safety timeout.
  - With no session (offline e2e, no Meta key, no mic, a denied permission), the button sends
    Phase 1's canned transcript, so every Phase 1 test holds.
- **Always listening.** One ENDPOINTING session while `talkMode` is `wake`, restarted every 55
  minutes (before the 60-minute cap). Each finished turn goes through `parseVoiceCommand`:
  - only utterances starting with Fitts (or Fitz, Fits, Fritz, optionally after "hey" or "ok")
    count;
  - "Fitts, stop" (or "stop it", "hold on", "pause") calls `stopAction`;
  - any other "Fitts, …" is sent as a spoken message;
  - a bare "stop" or "wait" does nothing.
- **Barge-in.** Transcribe's `speechStart` event cuts Fitts off, with an 80ms fade.
- **Speaking.** `speech.ts` keeps Phase 1's queue, cut-off, highlight and pulse. Only the
  backend changed: ElevenLabs when Settings › Voice is "Fitts (ElevenLabs)", main has the key,
  and the run isn't offline; otherwise `speechSynthesis`.
  - A failed stream (bad voice, plan limits, network) falls back to the system voice for the
    rest of the lines, instead of going quiet.
  - The voice ID is a new Settings field, shown when ElevenLabs is chosen. Empty means
    ElevenLabs' default voice.
- **The live ElevenLabs check found that the account can't stream yet.** The free plan
  refuses library voices via the API, and the account has none of its own. That needs Allen
  (NEEDS-ALLEN 2); the fallback covers it meanwhile. Transcribe was verified live in V5.
- **Costs.** Main reports stt seconds (from the bytes streamed) and tts characters. The agent
  records them in the ledger against the active project's run (§11 prices: $0.18 an hour,
  $0.00011 a character).
- **Tests without a network or a real mic.**
  - `tests/main/voice.test.ts`: the V5 protocol against a local WebSocket server.
  - `tests/unit/voice-command.test.ts`: the "Fitts, …" rules.
  - `tests/e2e/voice.spec.ts`: Chromium's fake audio device through the real capture path to a
    local Transcribe server (`FITTS_TRANSCRIBE_URL`, which lets voice run in an otherwise
    offline e2e), with partials in the box and the final sent as SPOKEN.
  - What needs ears and a real mic is in `scripts/voice-check.md`.

## Phase 2 — P12: replay, live-site verification, packaging, README, self-audit

- **Replay for judges (§12.3).**
  - **The recording.** `tests/bench/record-replay.bench.ts` recorded one real run of the
    demo/chat mirror: interview, crawl, review, media, 10 fixes with dry-run PRs, Done. It's
    bundled as `apps/desktop/resources/replays/demo-chat/`: the log, 52 step shots, and the
    outlines, mockups and direction pictures, 2.5 MB in all. It was checked for secrets (the
    only matches were "mask-" and "ask-unsure") and machine paths.
  - **Opening it.** Main copies the recording into userData under the project id
    `replay-demo-chat`, rewriting ids in the log, so `fitts-asset://` serves its images
    unchanged.
  - **Playback.** `ReplayRunEngine` plays the events through the shared reducer at recorded
    timing. It starts at 4× (the header says "Replay · 4× speed"), and any pause longer than 3s
    plays as 3s. Every action is a no-op except stopping (Stop run, ⌘.), which jumps to the end.
  - **The site view** shows the current step's shot.
  - **The project.** The replay project is `kind: 'live'` with `replay` set: no dev server,
    no fixes, no agent. Opening it from the project list later plays the recording again.
  - **The Welcome link,** "Watch a recorded run", needs no keys. 1× isn't offered in the UI
    yet (the engine supports it).
- **Live-site verification (§4.2).**
  - **DNS and file checks** run in `agent/verify-site/`, inside the network boundary: a TXT
    record at `_fitts-verify.<domain>`, or `/.well-known/fitts-verify.txt`, or a
    `<meta name="fitts-verify">` tag. Bare and `fitts-verify=` tokens both count.
  - **Tokens** are random per domain, kept in the renderer's storage; Phase 1 had one fixed
    mock token.
  - **GitHub Pages** is listed with read-only `gh api` calls through main's spawner (repos with
    Pages, then each repo's cname or github.io URL). It wasn't run live, because it touches
    GitHub (NEEDS-ALLEN).
  - **Vercel, Netlify and Cloudflare** stay mocked (first on the cut list): no OAuth apps
    could be registered.
  - **Stored per project:** the method, host and token (`SiteVerification`).
- **Live sites now actually open.** Before P12, nothing opened a live-site project: only local
  projects got a site window. Main now opens live projects in the offscreen window with no dev
  server, after re-checking ownership:
  - DNS and file are re-run with the stored token;
  - GitHub Pages is re-listed;
  - mocked hosts keep their recorded verification;
  - a project with no verification never opens.

  A failed re-check shows the site-down state with the reason. Fixes stay unavailable (no
  folder). The window follows only the verified origin; adding the `www.` variant is left to
  do.
- **Offline e2e keeps Phase 1's mock verification.** Main answers "offline" and the dialog
  passes after its delay. That bypass exists only when `FITTS_OFFLINE=1`, which only tests set.
- **Packaging (§16).**
  - electron-builder 26.17.0 (a month-old release): appId `app.fitts.desktop`, unsigned NSIS
    x64 for Windows, dmg (arm64 and x64) and AppImage in CI, publishing to GitHub Releases.
  - The replay ships as an extra resource; the icon goes inside the app files.
  - **Built and smoke-tested locally:** `pnpm dist:dir` gives `release/win-unpacked/Fitts.exe`,
    and `tests/bench/packaged.bench.ts` launches it with a fresh profile and plays the replay
    without keys.
  - The asar is 187 MB because electron-builder copies every production dependency, including
    renderer libraries Vite already bundled. Moving those to devDependencies would slim it;
    that's left as a follow-up rather than risk the build now.
  - The NSIS installer is buildable (`pnpm dist:win`). Installing it and publishing a release
    are Allen's (NEEDS-ALLEN).
- **CI** (`.github/workflows/build.yml`, written, not pushed):
  - every push: typecheck, lint and unit tests on Windows, macOS and Linux;
  - macOS also runs the first-launch e2e spec, the smoke test §16 asks for;
  - a `v*` tag packages each OS and publishes the release.
  - "Try it on our demo" (copying the bundled demos to a temp folder) isn't built; the replay
    covers the no-setup path.
- **The README** is rewritten for people installing or evaluating Fitts: try it, install
  (SmartScreen and Gatekeeper steps), what it does, develop, and status.
  - `.env.example` already exists (Allen's commit); a deny rule keeps this session from reading
    `.env*` files, so the README also lists the variables.
- **The self-audit** (`tests/e2e/self-audit.spec.ts`) runs Fitts's own probe bundle on its
  Settings screen, injected the way Fitts probes any site (isolated world 1001; the app's CSP
  rightly blocks inline scripts).
  - **It found one real problem:** a 138×20px link-button inside a sentence (Settings › Open
    weights › "add a Baseten key"). It now has a 24px tap area.
  - **Passing:** contrast, target size, button and link names, leaks and focus visibility all
    pass and are asserted.
  - **Reported, not asserted:** look-and-feel notes from the Phase 1 design. Seven font sizes
    (the guideline is six); spacing at 9, 11 and 18px.
- **The dev replay path** resolves next to `out/` (`__dirname`), not `app.getAppPath()`, which
  is `out/main` when Electron starts with a script. P3's `devRepoRoot` had the same issue.

## Phase 2 — after P12: applying a redesign (§8.3, §9.2)

The cut-list item "Hartwell redesign apply" is built: picking a look direction changes code.

- **When it runs.** A picked direction is applied after the review, before fixes are offered,
  as one job that runs alone (fix jobs wait). Picked later, during fixes, it waits for running
  fixes and then runs. Autonomous picks the first direction as before. The Ask modes now ask
  "Which look should I apply?" after the review, with a "Keep my look" button, since the
  directions card had no way to decline. Plan only never applies one. A run applies at most
  one direction; picking another after that says to undo first.
- **Theme-fit on small sites.** It used to run only after 3 pages, so a one-page site (a
  portfolio) never got it. It now also runs when the crawl ends with fewer pages.
- **The redesigner** is the fixer's tool loop with more room: it can list folders and write
  whole source files (`write` only takes source extensions and keeps a file's CRLF), takes up
  to 48 steps at medium effort, and gets the direction's mockup and two step shots as images.
  Its prompt is `docs/prompts/redesign.md`: a project with a theme system gets the look as a
  new theme made the default (existing themes keep working); otherwise it restyles in place.
  Each wording change is reported with `note_wording` after it's made.
- **Verification** (`verifyPages`): one worktree dev server, every crawled page (at most 10),
  at the before shots' size. Each page must render (visible content, no Vite/Next/webpack
  error overlay), and no page may gain a problem at severity 2 or higher against the crawl's
  baseline, across all page probes, the focus sweep and 360/768/1280px. A failed first pass
  gets one more pass with the reason; a second failure rolls the redesign back (worktree
  discarded, the site unchanged, fixes carry on from HEAD).
- **On pass:** one commit "Redesign: <name> (Fitts: look and feel)", an after shot per page
  (assets), and one PR. Open findings whose problem is gone on the redesigned page are marked
  fixed by the redesign (they join its `findingIds` and its PR) and leave the fix queue.
  `Change.pages` carries each page's before and after shot.
- **Later fixes stack on the redesign:** their worktrees start from its branch, and their PRs
  target it (`gh pr create --base`; the dry run records `base`). Both push the base first, so
  a stacked PR always has something to point at. Undoing the redesign returns later fixes to
  HEAD; fixes already stacked on it aren't rebuilt.
- **Wording cards:** each wording change is its own card and its own `wording` change. "Undo
  this" patches that one line back on the redesign branch, commits, and pushes to the open PR.
- **"Adjust it":** while a verified redesign exists, a message about the redesign ("For the
  redesign, instead…", or one naming the redesign or the look) re-runs the redesigner on the
  same worktree with that instruction, verifies every page again, and commits and pushes; a
  failing adjustment is dropped (`git reset --hard` + `clean`, ignored files kept), leaving the
  redesign as it was.
- **The UI on real runs.** The redesign layout used Phase 1's mock site. On a real run it now
  shows only while the pick is open or the look is being applied (so the findings tray is back
  for the fixes after), comparing the current step shot with the direction's mockup (labeled
  MOCKUP), then every page's real before and after. Done shows the redesign's before/after with
  a page picker instead of the mock "fixed" render. The mock engine's flow is unchanged.
- **Done's line** counts fixes and the redesign separately and leaves wording cards out.

## Phase 2 — after P12: fixes from auditing a real portfolio

Running Fitts on Allen's real portfolio (a copy) turned up three bugs, now fixed:

- **A folder named "portfolio" opened a fake site.** The renderer answered with Phase 1's mock
  detection first and main's real detection 300ms later, and any folder ending in `portfolio`
  matched a mock fixture (Next.js 15 on :3001, the stand-in page). A quick "Open" saved that.
  In the app, detection now waits for main; the mock only answers for folders main can't find
  (Phase 1's demo paths and e2e fixtures) and outside Electron.
- **Plain Vite projects started on the wrong port.** Main passed the port as `PORT`, which Vite
  ignores; demo/chat only worked because its config reads it. The site's dev server now gets
  the same command fix verification uses (`devCommandOnPort`): a Vite `dev` script gets
  `--port N --strictPort`, run with the project's own package manager (`pnpm exec`, `yarn` or
  `npx`). A dev command the user typed is still used as written.
- **External links counted as "does nothing visible".** Main blocks new tabs and off-site
  navigation, so 21 of 28 findings were links to GitHub, Devpost and LinkedIn. A blocked new
  tab or off-site navigation during an action now counts as a response (`OpTrace.opened`), and
  so does the page scrolling, moving focus, changing its #hash, or opening or closing a dialog
  (`Feedback.moved`). The same audit went from 28 shown findings to 7.
## Phase 2 — after P12: no stand-ins in a release, redesign requests, device sizes

- **Phase 1's stand-ins are dev-only.** `src/renderer/dev.ts` exports `DEV`
  (`__FITTS_DEV_TOOLS__`: true in `pnpm dev` and e2e builds, false in a release). Behind it:
  the mock sites (site view, Finding panel, before/after toggles, Done preview), the mock engine
  and Scenario scripts, mock detection, the seeded demo projects, the sample user ("Welcome
  back, Allen", "GitHub · AllenZheng-05"), the made-up last-run captions and past runs, the
  canned voice transcript, and the mocked Vercel/Netlify/Cloudflare connections (GitHub Pages,
  DNS and file stay). A release shows the real site, or "Starting your site…" / the dev
  server's last log lines; a recorded run's step shots stand in for its site.
  - The real helpers that lived in `mock/detect.ts` moved to `lib/new-project.ts`.
  - Welcome's computer chips are real: main checks `git --version`, `node --version` and
    `gh api user` (skipped offline) once per launch.
  - The renderer build marks `src/renderer/mock` side-effect free (and property reads too), so
    the bundler drops what nothing uses. `scripts/check-release-bundle.mjs` fails a release
    build that still has stand-in text; CI and `dist:*` run it before packaging.
- **Redesign requests in the interview.** The brief has `look`: the user's vision when they
  want a new look ("dark and bold, like a film poster"). The interview asks once whether they
  want one; the brief card shows Look only when there is one; the brief editor has it. With a
  look, theme-fit must return "doesn't fit" with three takes on the vision (a "fits" answer is
  rejected as unusable), and the redesigner is told to honor it.
- **Device sizes.** The site view has "See it on": Fit to panel (as before), Desktop 1440×900,
  Laptop 1280×800, Tablet 820×1180, iPhone 390×844, Android 360×800 (`DEVICES` in the schema).
  Phones and tablets get real mobile emulation over CDP (device metrics with `mobile`, touch, a
  mobile Chrome user agent) and a reload; main only accepts a device id from the renderer. A
  device bigger than the panel is drawn scaled down and centered; clicks, Point and overlays
  map through the same scale. Frames can be a pixel off at fractional display scaling.
- **The phone pass.** When the crawl ends, Fitts revisits each page (at most 8) as an iPhone,
  runs the page probes there, and gives the reviewers that phone screenshot next to the desktop
  one. Probe problems only the phone shows become their own findings ("Tap target is too small
  on a phone", evidence "… on iPhone · 390×844"). They aren't fixed automatically, and a
  redesign doesn't claim them, because verification runs at desktop size; verifying on a
  device is a follow-up.
## Phase 2 — after P12: what the real portfolio redesign run taught

Two real autonomous runs on a copy of Allen's 2007 portfolio (dry-run PRs to a local bare repo):

- **Files aren't pages.** The first redesign was rolled back because `/resume.pdf` "didn't
  render" (Chrome's PDF viewer has no page text). Routes that are files (`.pdf`, images and the
  like) are left out of the redesign's pages and the phone pass, and a non-HTML document
  counts as rendered.
- **The phone pass repeated desktop problems** and leaked its device label into titles quoting
  `measured`. Phone results are matched against the desktop pass by probe and measurement
  (refs are re-issued on reload), `measured` is never changed, and the aggregator adds "on
  iPhone · 390×844" to the evidence instead. A nameless control is "A control does nothing
  visible", not " does nothing visible".
- **"Verified" now includes the project's own tests.** The second run's redesign passed every
  probe but broke the portfolio's theme contract test (its theme-picker preview repeated the
  job logos, so each logo appeared twice), and several fix branches failed it too. The
  pipeline now runs the project's `test` script (CI=1, 4 min limit) once on an untouched
  worktree per starting point (HEAD, then the redesign), and again after a change that passed
  its checks. A test suite that passed before and fails after rolls the change back with the
  failing lines as the reason (a redesign's second pass gets them). If the tests already fail
  or can't run before the change, they can't judge it, and the PR doesn't claim them; when
  they pass, the PR says so. The redesign prompt asks it to read a project's contract tests.
- **Nested projects.** A worktree's `pnpm install` gets `--ignore-workspace` unless the
  project is a pnpm workspace itself, so a project inside another workspace's folder isn't
  adopted by it.
- Long paths: a clone deep in a temp folder put vitest's files past Windows' 260-character
  limit inside worktrees; the real run uses a short path (`.fitts-dev/p`). A real project in a
  normal folder doesn't hit this.
## Phase 2 — after P12: the design library (redesign directions from parts)

Allen found the free-form directions looked generically AI-generated, and asked for a library
that helps Fitts make better design choices without limiting what it can make.

- **Parts, not presets.** `packages/styles` holds parts by kind: 22 color schemes, 31 type
  pairings, 14 shape languages, 14 layouts, 16 decorations (two of them three.js), 6 motion
  styles and 3 densities. A direction is one part per kind (0–2 decorations), so thousands of
  coherent combinations exist before hue. A first draft had 30 presets with worked HTML
  examples; Allen asked to drop them, so the redesigner gets each part's rules, component
  treatments and reference CSS instead. Vocabulary drawn from 21st.dev-style galleries and
  "50 Design Styles" (UX Planet); every description and rule is original, named for genres,
  never brands.
- **Coherence is advice, not a rule.** Each part has energy (1–5), formality (1–5) and eras;
  `fits` says two parts sit well together (within 2 on both axes, eras within two steps,
  "timeless" goes with anything, density is neutral). The model is told the axes; the code
  only uses them to rank and to build the fallback. The owner's wishes can override them.
- **Color is a recipe.** Each scheme is OKLCH tones relative to a seed hue, so a scheme can be
  re-hued to a brand color while keeping its lightness structure. `palette()` then pushes every
  text pair to its WCAG ratio (text 7:1 on the background, 4.5:1 elsewhere, accent 3:1). A
  brand color the owner keeps becomes the accent exactly when it passes, adjusted when not.
  Tests check every scheme at 7 hues.
- **The owner's ideas come first.** The interview gained `keep`, `avoid`, `inspiration` (web
  addresses) and `boldness` beside `look`, asked before Fitts suggests anything (7 questions
  now, was 6). `look` or `inspiration` counts as a redesign request.
- **Two calls.** Theme-fit is now a verdict only (fits, why). A second call composes three
  directions (closest, further, unexpected) from the catalog with the brief, both sites' shots
  and the ranked parts; each carries `changes`, the places it departs from the library (the
  owner's wishes first), which the redesigner treats as winning. Unknown part ids fall back to
  the brief's best part of that kind; directions that differ in fewer than two of color, type,
  shape and layout are rejected, and then code builds three from the ranked parts
  (`autoDesigns`), so a request never ends without directions.
- **Inspiration sites** open once in a hidden, sandboxed window with a throwaway session (no
  permissions, downloads or pop-ups), two screenshots and a style line, at most two sites. It's
  browsing like the site window, so it lives in main/site.
- **Fonts are downloaded, then served by the site.** `main/fonts/` fetches woff2 files from
  Fontsource (its API and jsDelivr CDN; Google Fonts and other open-licensed families),
  nearest weight, Latin subset, cached in userData. A font the owner names is found by id or
  family. The fix host copies them into the project's static folder (`public/` for bundler
  projects, made if missing; the root for plain sites) as `/fitts/fonts/*.woff2` with a
  `fonts.css` that lists each license, so the deployed site never calls a font CDN. Fonts that
  can't be found fall back to the pairing's stack and the redesigner is told. This adds
  `apps/desktop/src/main/fonts/` to the places allowed to make network calls; CLAUDE.md needs
  that line (see NEEDS-ALLEN).
- **three.js is vendored.** A single minified ESM build of the app's own three (r186, 742 kB,
  with its MIT license) ships in `resources/vendor/three/` and is copied to
  `/fitts/three/` only when a direction uses a 3D part. The redesigner imports it dynamically
  inside a try, in one module, into one aria-hidden canvas that pauses off screen, draws one
  still frame under reduced motion and removes itself without WebGL. 3D parts rank low for
  calm briefs and never appear in the fallback for them.
- **A style check.** After a redesign passes the page probes, `judgeStyle` reads each page's
  font inventory: the direction's heading or body font must be in use, and one of its
  background, text or accent colors present, on at least half the pages; otherwise the second
  pass hears why. A font that couldn't be downloaded isn't held against it.
- **What the real runs taught.** The first real run's 3D redesign rolled back: Vite refuses
  any JS import from `public/` (even a computed URL), so the page showed its error overlay.
  three.js now goes beside the source (`src/fitts/three/`) in bundler projects and is imported
  by relative path, which Vite code-splits into a lazy chunk; plain sites keep
  `/fitts/three/`. Fonts load with a `<link>` (bundlers resolve CSS `@import` as source). That
  run also lifted Linear's exact brand purple from an admired site, so `brand` is now only the
  owner's own color. The rerun ("Launch Studio": Unbounded and Outfit, a lit three.js hero,
  name front and center) verified on every page for $0.83.

## Phase 2 — Allen's walkthrough feedback (round 1)

Allen ran a full Ask-every-action run on his portfolio and sent a long list of feedback. The
changes it led to, and the judgment calls in them:

- **`pnpm dev` is the real app.** Phase 1's stand-ins (the mock engine and sites, demo
  projects, the canned user, the Scenario panel, the gallery) are now only in e2e builds
  (`FITTS_DEV_TOOLS=1`); `pnpm dev` no longer turns them on. They stay as the test harness,
  because 130 e2e tests drive the UI through them, but no user (and no `pnpm dev`) sees them.
  The flag is renamed `TEST_BUILD` to say what it is.
- **The judges' replay is gone** (ReplayRunEngine, the bundled recording, Welcome's "Watch a
  recorded run"). Allen will demo on his own repositories. The packaged smoke test now only
  checks the app reaches Welcome.
- **Versions of a site.** Before/after, a fix's live preview and the Done preview used Phase 1's
  mock render. Now main serves a *version* of the site under its own site id
  (`<projectId>.v.<name>`): a fix's branch (its existing worktree, or a detached view worktree)
  or the run's preview branch (verified branches merged, as FINALIZE does), with its own dev
  server on a spare port, streamed like the live site. Versions are only for the user: the
  agent never gets their status and never acts on them, so they can always be used, in any
  mode. They open while a view needs them and close when it goes.
- **Before/after is a switch, not a slider** (audit and Done): "Before" is the live site,
  "With fixes" the preview version, both usable. A slider made the sites impossible to use.
- **The fix panel's mockup tab is gone.** The live preview is "When I found it" (the step shot
  with SAM's outline) and, once the fix is verified, the "Fixed version" itself.
- **"Your screen" replaces "Fit to panel"** as the default device: a desktop browser the size
  of the display Fitts is on, scaled down to fit the panel (main measures the display with
  Electron's `screen`; the renderer labels it with `screen.width × screen.height`).
- **"View PR" opens the pull request** in the browser (main opens only https links on
  github.com). A dry-run PR has no page, so it says that instead.
- **"Finished" on Done** removes the run's worktrees (`git worktree remove`, then prune) but
  keeps every `fitts/` branch, so the user can check them out normally, and goes back to the
  projects. "Open in browser" opens the shown version's localhost page. Undo and Try again on
  that run need its worktrees, so they stop working after Finished; that's what finishing means.
- **Agreement counts each reviewer once.** "6 of 5" came from the probe counting as a reviewer
  and a reviewer counting once per page. Now `agreeing` is distinct reviewers (at most 5) and a
  probe is `agreement.measured`, shown as its own "Measured" chip.
- **The message box grows** (a textarea with `field-sizing: content`, up to about 8 lines).
  Enter sends; Shift+Enter is a new line.
- **The shapes keep their places** when the motion setting changes: the field remembers where
  each shape was and the new field starts there.
- **Always listening.** "Fitts" said on its own now wakes Fitts (a chime, "I'm listening") and
  the next thing said within 10 s is for it; "Fitts, …" in one breath works as before. Bare
  "stop" still does nothing. A session that drops or can't start is retried (2 s, 5 s, 15 s,
  then every 30 s) and the line under the message box says why Fitts can't hear. The mic
  button pauses it, and it picks up after the button's last words arrive.
- **Keys from `.env.local` are shown, not hidden.** Settings and Welcome say which key is in
  use (its last 4 characters) and whether it's from `.env.local`. A key saved in Settings still
  wins. The key itself is never copied into the app's storage; main reads the file in dev
  builds only, as before. `ELEVENLABS_VOICE_ID` fills the voice setting if it's empty.
- **No spending limit by default.** `capUsd` 0 means no limit (the budget guard already treated
  it so); the header shows only the spend. Settings' old default of $20 migrates to no limit.
- **The fixer's budget bends; it stops when stuck.** A one-element fix gets 14 steps and a
  site-wide one (focus styles, fonts, spacing, contrast, the same problem on 3+ pages, or no
  element) gets 30. At the budget, a loop that's still finding new things (a file it hadn't
  read, a new search, a patch that applied) asks to keep going: Autonomous and Dangerous say
  yes, the ask modes ask the user with the fix's cost so far. 6–15 more steps at a time, never
  past 60. Four steps in a row with nothing new (repeats or only errors) is stuck, and it stops
  there. Each attempt keeps notes (files read, searches, files edited), and Try again's task
  starts from them. The rollback reasons say what happened in plain words.
- **Fitts runs the project's CI checks before a PR.** It reads `.github/workflows/*.yml` for
  `run:` lines and keeps only checks: package scripts named like lint/format/typecheck/check
  (never ones that fix or write) and direct `prettier`/`eslint`/`tsc`/`stylelint` calls without
  `--write`/`--fix`. Installs, builds, deploys and anything with shell operators never run. At
  most 5 checks. Before the checks, it formats the files it changed with the project's
  Prettier and applies ESLint's fixes when CI checks them. The checks run on the fresh worktree
  first (once per starting point, with the tests); a check that passed before and fails after
  rolls the fix back, and one that already failed doesn't count. The PR body names the checks
  that pass. Projects without workflows are unchanged.
- **Settings explains the model profiles and destructive actions** in place, under the
  controls, with the models each profile uses.
- **The interview is a conversation.** The prompt now has Fitts answer what the user actually
  says (tangents, questions, stories) before steering back to what it still needs, one thing at
  a time, never re-asking what it was told. The 7-question cap is gone; after 8 of Fitts's
  lines it's nudged to wrap up. Personal details (interests, hobbies) go into the brief. It runs
  whether or not the site is up yet (no screenshot until it is).
- **The brief is one paragraph** (`Brief.summary`, in the owner's voice), rewritten by the model
  each turn and shown in the chat card and the Brief popover as one growing box. The fields
  stay, kept in step by the model, because the reviewers and the design library rank on them.
  When the owner saves an edited paragraph, a small model call re-reads every field from it
  (fields it no longer mentions are cleared). A brief from before summaries is shown as plain
  sentences built from its fields.
- **New run continues from the real run.** It used to restart Phase 1's scripted interview on
  the same run id (so the app stayed on Done, and branches and worktrees would collide). Now the
  next run gets the next number (from the project's `lastRunId`, kept by the renderer, so a
  restart can't reuse one either), keeps the brief, and Fitts asks what this run should focus
  on, with quick replies.
- **A real run never plays the scripted audit.** With a key, Start the audit on a site that
  isn't up says so and waits, instead of falling back to Phase 1's script. The script only runs
  in the test harness (offline e2e).
- **Try again says what it's doing.** Fitts posts what went wrong last time and what it'll do
  differently; a note from the user ("Add a note") goes into the next attempt's task. The Done
  row and the card show what Fitts is doing while it retries, and the chat says whether it
  worked. `retryChange` takes the optional note.
- **The fix panel sits over the site** instead of pushing it aside, and it's there during the
  redesign too ("See evidence and fix" works while the look is applied; fixing waits for it).
- **Review calls stay changeable until Go ahead.** In "Review each", Approve, Skip and Not a
  problem are all calls you can change (the pressed one shows); nothing is sent until "Go ahead
  · fix N" (on the panel's bar or the batch card). Outside a batch, "Not a problem" dismisses
  at once, and a dismissed finding has "It is a problem" to open it again (`reopenFinding`, a
  new RunEngine method). Chat finding cards show where each one stands (approved, fixing, fixed,
  skipped, not a problem) with a tint and a chip.
- **The timeline is a history**, from the start to now: finding dots where they were found, the
  playhead at now or at the rewound moment. It was a progress bar against a step estimate,
  which showed "three-quarters done" before anything happened. It's hidden until a finding.
- **"Highlights on" is "Show problems on the page"**, disabled with a hint until there's
  something to outline on the page.
- **Sign in with GitHub.** Fitts is a GitHub App, and signs its user in with GitHub's device
  flow (no server, no secret in the app): a code to enter on github.com, then the user picks
  repositories on the app's install page. Tokens (8-hour user tokens with refresh) are kept with
  safeStorage in main; the renderer only learns the login. Signed in, PRs go through the REST
  API and pushes use the token through git's environment config (`GIT_CONFIG_*`), so it's never
  in a command line, the repo's config or a credential store; GitHub Pages sites come from the
  repositories the user gave Fitts. Not signed in, Fitts falls back to `gh` as before; the
  dry run stays for tests. Ask every action now asks before every push and pull request. The
  client id is empty until Allen registers the app (NEEDS-ALLEN 4b); until then Settings says
  sign-in isn't set up.
- **Ask every action has real permission choices**: Allow once, Allow on this page, Allow
  everything this run, or Skip it. Before it asks, Fitts scrolls the control into view (a new
  `reveal` site op) and outlines it, so you can see what it means.
- **Every action shows in the chat.** Taps, typing and page loads gather in one steps group
  while they come one after another: it shows the latest ("Fitts · Tapped “Projects”") and
  opens to show them all. Anything else Fitts posts starts a new group.
- **Mockups open large.** Clicking a direction opens it in a viewer (the whole picture in a
  browser frame, arrows through the three, "Choose this one"); a click no longer picks it.
  Muse Image is asked for the screenshot's shape (1536×1024 for a wide window) instead of a
  square crop, and asked again without a size if it refuses one.
- **Findings no longer get a Muse Image mockup.** The fix panel shows the real fixed site, so
  the pictures were cost with nothing to show them. Redesign directions still get theirs.
- **Panels resize and collapse.** The site map, the chat, the findings tray and Done's site
  preview each have a grip (a focusable window splitter: drag, arrow keys, double-click or
  Enter to collapse). A collapsed panel is a slim bar that brings it back. Sizes are kept
  between launches; the defaults are the design's.
- **Your site can be used in any mode.** Without the wheel, scrolling and hovering always go
  through to the live site. A click, a key, or back/forward/reload asks "Take the wheel to use
  your site?"; taking it pauses Fitts and then does what you tried to do.
- **Point at something picks what's under the pointer**: the control it's part of (a link, a
  button, a field) or else the innermost element (a heading, a picture). It used to climb to
  the nearest ancestor with a ref or a role, which was often the whole section.
- **"Replay it" is "Show me on the site"**: Fitts pauses, opens the page on the live site,
  scrolls to the element and outlines it (`showFinding`, a new RunEngine method). The scripted
  test engine still rewinds.
- **The Fitts plugin is real, as one file.** A Vite project gets it in its own small PR (the
  Add project checkbox, shown only for Vite projects without it): `fitts.vite.mjs` with no
  dependencies, and `fitts()` first in vite.config's plugins. In `vite serve` only, it stamps
  `data-fitts-src="file:line:col"` on host JSX elements with a small scanner (code, strings,
  comments, templates, tags and their children, so generics, comparisons and text aren't
  touched), then checks the stamped file with Vite's own compiler (oxc, else esbuild) and
  serves the original if it doesn't compile. Checked on Fitts's renderer (746 elements in 58
  files) and Allen's portfolio (386 in 14): every file compiled. The npm package
  (`@fitts/vite-plugin`, with Babel) stays for the monorepo; detection counts either.
- **`pnpm -s typecheck` hid errors.** The silent flag swallowed tsc's output (and the build
  doesn't typecheck), so round 1 went in with a few type errors. Fixed; checks now run
  without `-s`.
- **Vercel, Netlify and Cloudflare are real connections**, through a token the user makes on the
  host (no app registration needed): Fitts lists the account's sites and the domains each
  serves (Vercel: each project's verified domains; Netlify: custom domain, aliases and the
  netlify.app address; Cloudflare: each Pages project's domains, plus active zones), and a site
  counts as yours when its domain is on the list. A Cloudflare zone also covers its subdomains,
  since the account controls its DNS. The token is saved (safeStorage, main only) only after it
  lists sites, and every run re-lists them and checks the domain is still there. The dialog
  says where to make each token and what access it needs (read is enough; Netlify can't limit
  its tokens, which it says). "Sign in with Vercel/Netlify" can come later; it needs each host's
  app registered.
- **File and meta-tag verification got stricter.** The meta tag counts only inside the page's
  `<head>` (a tag in the body could be a visitor's post), and a check that was redirected must
  end on the same site (the domain, with or without www.).

## Phase 2 — Allen's walkthrough feedback (round 2)

- **Demo projects saved by older dev builds are dropped on load.** Before the test-build split,
  `pnpm dev` seeded demo/chat, hartwell-site and a fake portfolio into userData/projects, and the
  store kept them (with `lastOpenId` on one, so the app skipped Welcome). Outside test builds the
  projects store now drops them when it loads. Each is matched by its id *and* its fixed
  `createdAt`, so a real project that happens to be called "portfolio" stays.
- **Every voice session has an id.** Main's events (`partial`, `final`, `speech`, `error`,
  `closed`) carry it, and `audio`, `end` and `cancel` name it: a call for a replaced session does
  nothing. Before, pressing the mic during "Always listening" started a push-to-talk session that
  the wake listener's cleanup cancelled a render later (cancel took no id), so the mic did
  nothing in that mode. A session the server ended also never unregistered its listener, so
  after one reconnect every phrase was handled twice and the old session's late "closed" could
  tear down the new one.
- **Always listening reopens quietly.** A session that stayed open more than 5s and then closed
  (Transcribe ends quiet sessions) reopens at once without the "can't hear you" line; only a
  session that couldn't open shows trouble and backs off. The AudioContext is resumed in case a
  mic opened without a click starts suspended.
- **Barge-in in Always listening needs "Fitts".** Any sound in the room used to cut Fitts off
  mid-sentence. Now a partial has to start with "Fitts" (or follow "Fitts" on its own). The mic
  button still cuts Fitts off on any speech. "Fittz", "Fit's", "Phitts" and "hey, Fitts" were
  added as spellings.
- **The mirror takes the keyboard.** Measured in an offscreen window: an unfocused page never
  moves focus on Tab, shows no focus rings, closes focus-driven menus, and never paints a native
  `<select>` list. After `webContents.focus()` all four work, and the hidden window stays hidden
  (Windows; macOS also focuses the owning window, so `focus()` hides it again if it showed, which
  is unverified on a Mac). The site page gets focus when the mirror does, on a click in it, and
  before Fitts's own clicks, typing and Tab sweeps.
- **Keys go through the DevTools protocol** (`Input.dispatchKeyEvent`) with the browser's own
  `key`, `code` and `keyCode`. `sendInputEvent` lost `code`, which many sites' shortcuts read.
  Once the mirror has focus every key goes to the site, Tab and Esc included, except Fitts's own
  ⌘/Ctrl shortcuts (`,` `P` `.` `L`). F6 or ⌘L leaves for the message box, and a hint on the site
  says so while it has the keys, so Tab isn't a keyboard trap. On macOS, ⌘A/C/X/V/Z are sent as
  editing commands, as Chromium needs there.
- **The mirror fits what's drawn.** The canvas was scaled to the device's nominal size, but main's
  window can be a different size ("Your screen" as main measures it), so a site could be cut off
  at the right and bottom. It now fits the frames' real size.
- **What Fitts types.** "fitts-test" stays on anything a site might save (§15), but a search,
  filter or lookup field gets a real query, since a marked query finds nothing (seen on
  openteamsheets.com). Lookups are `type=search`, the searchbox and combobox roles, or a name with
  search, find, filter or look up. The model also says what each field is for (`purpose:
  search | save`). Text areas, email and passwords are always marked. The explorer's fallback query
  is the first meaningful word on the page (headings, then links).

## Phase 2 — Allen's walkthrough feedback (round 3)

- **Live sites only audit.** A run whose origin isn't localhost (`isLiveOrigin`) gets no fixer or
  redesigner. If theme-fit finds the look doesn't suit, the run posts the lookfeel note and says
  a redesign needs the code; it posts no directions card. The interview context says the site is
  live with no code, and the prompt then skips the "new look?" question. The origin test stands
  in for the project's kind, because every local project is served from localhost.
- **Site down on a live site.** The health check pinged the placeholder dev server (`localhost:0`)
  of a live project, so three failed clicks raised the dev-server card. The card also always
  showed mock text (`localhost:5173`, the Toast error).
  - A live site's health is now its window: the last main-frame load didn't fail, the renderer
    hasn't crashed, and `document.readyState` answers within 5s. No extra network call is made.
  - "Restart" reloads the page.
  - The card carries `detail` (url, live, the dev server's last 8 lines). A live site's card has
    its own title, body and button labels, and no log.
- **Device picker follows Fitts.** `SiteStatus.device` is set whenever the device changes, by
  Fitts (the phone pass) or by the user. The picker updates from it.
  - The device op now returns the raw id, "Your screen" included. Restoring after the phone pass
    goes back to the screen size; before, it left the window at phone width.
- **Cursor.** Electron's `pointer` is the arrow and its `hand` is CSS `pointer`. The old map
  passed `pointer` straight through, so the mirror always showed the hand. Names CSS shares pass
  through; anything else (custom, panning) shows the arrow.
- **Voice.**
  - Pressing the mic cuts Fitts off at once. Push-to-talk sessions may never send a speech event,
    so barge-in on speech alone wasn't enough.
  - New Fitts lines aren't spoken while the user is talking (mic on, armed, or mid-"Fitts, …").
    The lines stay in the chat.
  - "Always listening" shows the words in the message box once an utterance starts with "Fitts",
    and plays a two-note chime (Web Audio, no file) the moment it hears the name. Room speech
    without "Fitts" stays out of the box.
- **Pointing names the thing.** `refAt` returns `{ref, name, kind}`, and the chip reads
  `pointing at “Sign up” button` (or `this image`). A one-line box counts as text.
  - The label travels with the message (`pointingLabel`).
  - The interview now answers messages sent while pointing. Before, they skipped the interview
    model, which is why the brief lost what the user said.
  - The model sees the element as a bracketed note, marked as possibly unrelated, so a chip left
    attached can't derail the answer.
  - The audit still only acknowledges messages. Making them steer the run is part of the
    agent-loop change.

## Phase 2 — Allen's walkthrough feedback (round 4)

Allen ran a live audit of openteamsheets.com and tried the mic. What changed, and the calls:

- **Talking writes into the message box.** The mic button used to send what you said the
  moment you tapped it again, with no way to fix a word. Now it dictates: the words land in
  the box after whatever was typed, the second tap leaves them there to edit, and you send.
  Typing while still talking takes over (the mic stops; the box is yours). Always listening
  keeps sending on its own when you stop talking, since that's the point of hands-free, but
  the same takeover applies: start editing and it waits for you. What was typed before a
  "Fitts, …" stays in the box after it's sent. `micPartial` is gone; `draft` holds everything,
  with `draftSpoken` so a dictated message is still sent as spoken.
- **Done lists what was found.** The Done screen showed only the changes, so a live audit
  (nothing changed) showed 27 found and no way to see them but the exported report. Now every
  finding is listed under "What I found", worst first, suggestions in their own list, each
  opening the Finding panel over the site. The math line separates "still open" from
  "suggestions without enough evidence", which it used to lump together: every open finding
  read as a suggestion. The exported report has each finding in full (finding, fix, evidence)
  instead of one line.
- **How I found it.** Every step already saved a shot (`shots/<step>.jpg`, for rewind). The
  orchestrator now keeps a trail of steps, and each finding gets `replay`: from the step that
  opened its page to the step that used its element, at most 8. The Finding panel's new tab
  plays them with what Fitts did at each; it steps by hand and plays once (not under reduced
  motion). A finding's `stepIndex` moves to the step that used its element, so the timeline's
  dot and rewind land there too.
- **Why the run stopped at 199.** It hit the 200-step cap (SPEC-phase2 §6.1) and said nothing.
  Two causes made the cap bite on openteamsheets: every team card's buttons counted as new
  controls (refs are per element), and every `/team/<id>` page counted as a new page. Now the
  snapshot gives each control a structural key (its tag and classes, and the repeated card
  it sits in, if any); controls of one repeated card share a key, so a list of 40 cards is one
  set of controls, tried once, and skipped on later pages that show the same card. Pages of
  one template (`/team/:id`, an id being digits, a uuid, or 6+ mixed letters and digits)
  count once two of them are tested; the third is marked "same page" in the site map. Steps
  of a flow (`/signup/step-2`) are not ids. And when the cap does stop a run, Fitts says so
  and how much was left.
- **The big changes are a spec, not a commit.** The agent loop, the style boards, the tab
  strip and the redesign rounds are written up in `docs/SPEC-phase3.md` for Allen to approve
  before anything is built.
- **No hard cap.** Allen saw real progress getting cut at 200 steps on a big site. The cap is
  now a safety ceiling (1000; the budget bounds a run long before it), and the run ends on
  coverage or on going in circles: a step that tries no new control, finds no new page and
  finishes no page is no progress; 8 such steps in a row on one page skip what's left there
  and move on, 24 anywhere end the crawl, and Fitts says so both times. `stepEstimate` is no
  longer capped at 200 either. SPEC-phase3 §1.5 has the decider change course itself first,
  with this as the backstop.

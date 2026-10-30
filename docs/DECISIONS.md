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

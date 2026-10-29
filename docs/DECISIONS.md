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

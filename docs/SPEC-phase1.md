# Fitts — Phase 1 build spec: clickable front-end prototype

Version 1.0 · Oct 28, 2026 · Owner: Allen Zheng

---

## 0. Goal and definition of done

Build the complete Fitts desktop UI as a real Electron app so every user flow can be
clicked through and judged before any real agent code exists.

Phase 1 is done when:

1. Every screen and state in §6–§7 exists and matches the design references.
2. A scripted mock run plays end to end: interview → audit & fix → done, with chat
   messages, findings, highlights, approvals, the destructive gate, fixes and undo.
3. A hidden **Scenario panel** (⌘⇧D) jumps to any screen or edge-case state.
4. The floating 3D background shapes work (physics, cursor push, drag and throw).
5. No window scrolling at 1440×900; everything fits at the 1200×720 minimum, with panels
   scrolling internally if needed.
6. All tests in §12 pass, including zero serious/critical axe violations on every scenario.

---

## 1. Product summary (context)

Fitts audits a website the user owns:

- It runs the site in an embedded browser view and actually uses it: clicking flows,
  entering bad input, pressing back mid-flow, timing feedback.
- It checks the site against Nielsen's 10 usability heuristics plus extra lenses
  (accessibility, ergonomics, performance, look and feel), using deterministic checks
  and a panel of five AI reviewer personas.
- It fixes the code in git worktrees, re-verifies every fix, and opens pull requests.

The user can watch, chat, talk (voice), point at elements, take control of the
browser, and approve or undo any change. Permission modes control how much Fitts asks.

Phase 1 fakes all of the agent behavior with a mock engine. Phase 2 replaces the
mock with the real one.

---

## 2. Phase 1 scope

**In scope**

- Electron app shell:
  - default window 1440×900, minimum 1200×720
  - macOS traffic lights inset into the header
  - app menu with the standard Edit/View/Window items
- All screens:
  - Welcome / first-run setup
  - Workspace in three states: Interview, Audit & fix, Done
  - Redesign variant of Audit & fix
  - Settings
- All overlays: Finding panel, Destructive-action gate, Project menu, Add project
  dialog, Brief popover, edge-case cards
- Mock Run Engine with two scripted scenarios plus all edge-case states (§9)
- Mock "your site" renderers for the two demo projects, inside the site view
- Background shape field (three.js + physics)
- Welcome logo emblem animation
- Keyboard shortcuts, focus handling, permission-mode behavior (simulated)
- Voice UI states, simulated:
  - the mic button toggles "Mic on"
  - Fitts's lines can optionally be spoken with the OS `speechSynthesis`
  - there is no real speech-to-text
- Real native dialogs where harmless: folder picker; save dialog for "Export report"
  (writes a markdown summary of the mock run)

**Out of scope (Phase 2)**

- Meta Model API, ElevenLabs, Muse Voice Transcribe
- Real WebContentsView mirroring, CDP, Playwright verification
- git worktrees, Muse Code, `gh` pull requests, real cost tracking
- Real permission prompts for mic and notifications (Phase 1 simulates their states)
- Dark mode, small-window compact mode below 1200×720, i18n, auto-update, code signing

---

## 3. Tech stack and repository layout

```
fitts/                         (pnpm workspace root)
  CLAUDE.md
  docs/
    SPEC-phase1.md
    DECISIONS.md               (Claude Code logs judgment calls here)
    design-reference/          (static HTML mockups of every screen)
  packages/
    schema/                    (shared TypeScript types, no React/Electron imports)
      src/index.ts
  apps/
    desktop/
      electron.vite.config.ts
      src/
        main/                  (Electron main: window, menu, dialogs, notifications)
        preload/               (typed window.fitts bridge: dialogs, notify, platform)
        renderer/
          app/                 (routing between Welcome / Workspace / Settings)
          components/          (design-system primitives, §5.4)
          features/
            welcome/  workspace/  site-view/  chat/  findings/  finding-panel/
            gate/  projects/  settings/  redesign/  summary/  background/
          mock/                (fixtures, scenario scripts, demo-site renderers)
          state/               (Zustand stores + RunEngine interface + MockRunEngine)
          styles/tokens.css
          copy.ts
      tests/
        unit/   e2e/
```

**Libraries**

- **Core:** electron, electron-vite, react 19, typescript (strict), tailwindcss v4
  (theme via CSS variables in `tokens.css`), zustand.
- **Background shapes:** three, @react-three/fiber, @react-three/drei (for RoundedBox
  and Capsule), @react-three/rapier.
- **Icons:** lucide-react (stroke width 2).
- **Fonts:** `geist` (Geist and Geist Mono) and
  `@fontsource-variable/bricolage-grotesque`, bundled locally.
- **Tests:** vitest, @testing-library/react, @playwright/test (Electron),
  @axe-core/playwright.
- **Electron security:** `contextIsolation: true`, `sandbox: true`,
  `nodeIntegration: false`. The preload exposes only the small typed API listed above.

---

## 4. App shell and window rules

- **Window size:**
  - Default 1440×900, minimum 1200×720, resizable.
  - The window remembers its size and position.
- **Window chrome:**
  - macOS: `titleBarStyle: 'hiddenInset'`. The header doubles as the drag region
    (`-webkit-app-region: drag`), and every interactive control inside it is `no-drag`.
  - Windows and Linux: the standard frame.
- **No page scroll:** the root is `height: 100vh; overflow: hidden`. Each panel owns its
  scrolling (chat list, site map list, findings row horizontally, finding-panel body,
  run-summary body, settings sections).
- **Background:**
  - The app background is `--paper`.
  - The shape field (§6.12) sits behind all UI.
  - Panels are opaque, so shapes show mostly in the gutters and around the header.
- **Launch:**
  - First launch, or no projects: show the Welcome screen.
  - Otherwise, open the workspace of the last opened project.
  - A dev-only menu item "Reset to first launch" clears persisted mock state.
- **Persistence (Phase 1):** keep projects, settings and the last-open project in
  `localStorage` through Zustand `persist`. Run progress does not need to survive restarts,
  except for the "Reopen" scenario, which the mock engine simulates.

---

## 5. Design system

### 5.1 Color tokens (`tokens.css`)

| Token | Value | Use |
|---|---|---|
| `--paper` | `#FBFAF7` | App background |
| `--card` | `#FFFFFF` | Panels, inputs, buttons |
| `--ink` | `#16161D` | Text, all borders, hard shadows |
| `--ink-2` | `#2E2E38` | Secondary body text |
| `--muted` | `#5A5A66` | Captions, labels (≥4.5:1 on white and tints) |
| `--surface-2` | `#F3F1EC` | Site-view backdrop, URL field, inset blocks |
| `--cobalt` | `#3D5AFE` | Primary actions, Fitts, "what Fitts is acting on", focus ring |
| `--cobalt-ink` | `#2A3FD6` | Links, cobalt text on white |
| `--cobalt-deep` | `#1B2BA8` | Cobalt text on cobalt tint |
| `--cobalt-tint` | `#E8ECFF` | User chat bubbles, selected rows, "Now:" line |
| `--coral` | `#FF6B5B` | Problem highlights, logo target dot, shapes |
| `--coral-tint` | `#FFE2DE` | Severity 3 badge background |
| `--coral-ink` | `#9E2A1E` | Severity 3 badge text |
| `--sun` | `#FFC53D` | Shapes, slider knob, "Try again" |
| `--sun-tint` | `#FFF4D6` | Waiting / needs-you cards, Severity 2 |
| `--sun-ink` | `#6E4A00` | Text on sun tint |
| `--mint` | `#2BD9A0` | Done/verified dots, shapes |
| `--mint-tint` | `#DDF8EE` | Verified chips, "Mic on" |
| `--mint-ink` | `#0B6B4B` | Text on mint tint |
| `--lilac` | `#B69CFF` | Shapes, cost legend |
| `--lilac-tint` | `#EFE9FF` | Thinking lines, look-and-feel cards |
| `--lilac-ink` | `#4A2FB0` | Text on lilac tint |
| `--wine` | `#7A1F3D` | Severity 4 badge (white text) |
| `--danger` | `#D92D20` | Destructive modal header, stop button, dangerous-mode banner only |
| `--danger-ink` | `#B42318` | Destructive text on white |
| `--danger-tint` | `#FFF7F6` | Rolled-back rows |
| `--neutral-tint` | `#F0EFEA` | Severity 1, neutral chips |
| `--neutral-ink` | `#3A3A44` | Text on neutral tint |
| `--scrim` | `rgba(22,22,29,0.62)` | Behind modals |

**Highlight meaning (fixed):**
- **Cobalt** means what Fitts is looking at or acting on.
- **Coral** means a problem.
- There is no legend.

**Severity badges:**

| Severity | Background | Text | Label in lists | Label in detail views |
|---|---|---|---|---|
| 4 | wine | white | "Sev 4" or "Severity 4" | "Severity 4 · Catastrophic" |
| 3 | coral-tint | coral-ink | "Sev 3" or "Severity 3" | "Severity 3 · Major" |
| 2 | sun-tint | sun-ink | "Sev 2" or "Severity 2" | "Severity 2 · Minor" |
| 1 | neutral-tint | neutral-ink | "Sev 1" or "Severity 1" | "Severity 1 · Cosmetic" |

### 5.2 Typography

| Role | Font | Size / weight |
|---|---|---|
| Wordmark in header | Bricolage Grotesque | 21px / 800, letter-spacing −0.02em |
| Welcome H1 | Bricolage Grotesque | 68px / 800, line-height 0.98, letter-spacing −0.035em |
| Page titles (Settings, dialogs) | Bricolage Grotesque | 26–32px / 800 |
| Panel and card titles | Bricolage Grotesque | 16–22px / 700 |
| Big numbers (stats) | Bricolage Grotesque | 28px / 800 |
| Body | Geist | 15px / 400 (chat 14–15px, line-height 1.45–1.5) |
| UI labels and buttons | Geist | 13–14px / 600–700 |
| Captions | Geist | 12–13px / 400–600, `--muted` |
| Routes, URLs, costs, code, kbd | Geist Mono | 11–13px |

### 5.3 Shape, borders, elevation, spacing

| Element | Border | Radius | Shadow |
|---|---|---|---|
| Panels (site map, site view, chat, tray, summary, settings sections) | 1.5px `--ink` | 18px | `3px 3px 0 var(--ink)` |
| Hero cards (Welcome setup card, logo emblem card) | 1.5px `--ink` | 22px / 28px | `4px 4px 0 var(--ink)` |
| Finding panel, project menu, add-project dialog | 1.5px `--ink` | 16–22px | `4px 4px 0 var(--ink)` |
| Destructive modal | 2px `--ink` | 22px | `6px 6px 0 var(--danger)` |
| Buttons, inputs, selects, chips | 1px `--ink` | 12px (pills 999px) | none |
| Primary button | 1.5px `--ink`, fill `--cobalt` | 12–14px | `2px 2px 0 var(--ink)` |
| Inner dividers | 1px `--ink` | — | — |

**Spacing:**
- Base unit 4px.
- App padding: 20px on the sides and bottom.
- Gaps between panels: 14px.
- Panel padding: 12–16px.

**Control heights:**
- Header controls: 40px.
- Standard buttons: 40–44px.
- Primary call-to-action: 44–54px.
- Message box and its buttons: 46–48px.
- Filter chips: 32px.
- Inline chat buttons: 36–40px.

**Focus:** `:focus-visible { outline: 2px solid var(--cobalt); outline-offset: 2px; }` on
every focusable element. Never remove it.

**Motion:**
- Panels and menus: 160–200ms ease-out.
- Chat items: fade and rise 6px.
- Respect `prefers-reduced-motion`: no movement, instant transitions.

### 5.4 Component inventory (build these first, show all states on a `/gallery` dev route)

- **Logo mark** (`<FittsMark size>`): SVG in a 64×64 viewBox. Copy it exactly from
  `design-reference/Auditing.html` (header) or `Logos3.html` option D:
  - lowercase f in ink, strokes 7
  - crossbar ending near a coral dot (r 5.5)
  - two cobalt corner marks
  - two white handles with cobalt stroke at the top-left and bottom-right
- **Wordmark lockup:** mark (30px) plus "Fitts" in Bricolage 800 21px.
- **Fitts avatar:** a 36–44px sphere with radial gradient
  `#FFFFFF 0% → #8A9BFF 20% → #3D5AFE 60% → #2235C4 100%`, 1.5px ink border.
  It pulses (scale 1→1.06) while Fitts speaks.
- **Button:**
  - variants: `primary` (cobalt), `secondary` (white), `dark` (ink fill),
    `danger-outline` (stop/allow-destructive), `ghost-dashed` (expanders)
  - states: hover (lift `translate(-1px,-1px)` and shadow +1px on primary), active,
    disabled (opacity 0.4, `cursor: not-allowed`), focus
- **IconButton:** 40×40 with a required `aria-label`.
- **SegmentedControl:** a joined group with 1px ink dividers. Used for the header run
  controls and the Settings model profile.
- **Select:** the native select styled to match. Used for the permission mode and the run
  picker.
- **Input and TextField:** label, optional hint, error. 46px.
- **Chip / Pill** and **SeverityBadge** (§5.1).
- **Stepper:** a three-step pill: Interview → Audit & fix → Done.
  - Completed steps are mint-ink with "✓".
  - The active step has an ink fill and white text, plus an optional cobalt counter pill
    ("2 fixing", "redesigning").
- **StatusChip "Mic on":** mint tint, mic icon. Visible only while the mic is live.
- **CostChip:** mono, for example `$1.84 / $20` during a run and the total afterwards.
  Turns sun-tint at 80% of the cap.
- **Panel:** a titled container with an optional toolbar row and footer.
- **Card types for chat** (§6.6).
- **BeforeAfterSlider:**
  - Two panes with a draggable divider. The knob is a 30–36px sun circle with "↔".
  - Keyboard: arrows move the divider 5%, Home/End jump to the ends.
  - `role="slider"` with `aria-valuenow`.
- **Modal, Popover, Menu:** focus trap, Esc closes, return focus to the trigger.
- **Toast:** bottom-center, 4s, for small confirmations ("Report saved").
- **Kbd:** renders ⌘ on macOS and Ctrl elsewhere.

---

## 6. Screens

The design references are named after the screens. Build each one to match its
reference.

### 6.1 Welcome (first launch) — `Welcome.html`

**Layout:** two columns centered in the window.

**Left column:**
- Logo emblem, 300×300 (spec below)
- H1 "Hi, I'm Fitts."
- Lead line: "I use your site the way people do, find what gets in their way, then fix it
  and show you the proof."
- Small line: "Named after Paul Fitts, who measured how people point at things. Built on
  Nielsen's 10 usability heuristics."

**Logo emblem:**
- A cobalt "Fitts" layer-name tag at the top-left.
- A white hero card, 230×230, radius 28, with the mark at 192px.
- A dotted flight path enters from the bottom-right (ink, dash `1 9`, round caps,
  starting from a 5px ink dot).
- A cobalt cursor at the end of the path, its tip on the coral target dot.
- A mono label underneath: `ID = log₂(D/W + 1) = 1.58`.
- **Animation, on mount, once:**
  1. The cursor travels along the path over 1.1s, ease-in-out.
  2. On arrival the target dot pulses (scale 1→1.35→1, 250ms).
  3. The path draws in behind the cursor.
- Reduced motion: show the end state.

**Right column, the setup card "Let's get you set up":**
- **Meta Model API key:** password input.
  - Mock validation: 600ms after typing stops, show the "Works" chip if the length is ≥ 8.
  - The link "Add ElevenLabs (voice) or Baseten (open weights)" opens Settings → API keys.
- **Your computer:** status chips git, GitHub · <username>, Node 22, Muse Code (all mock
  green), plus two buttons "Allow microphone" and "Allow notifications". Clicking one
  turns it into a green chip. Mock only.
- **Project folder:** text field and "Browse" (real folder dialog).
  - The caption shows mock detection: "Vite + React 19 · dev server on localhost:5173 ·
    you own it".
- **"How much should I ask you?":** select with the options "Plan only · look, don't
  touch", "Ask every action", "Ask when unsure" (default) and "Autonomous · just do it,
  I'll undo if needed".
- **Primary button "Open my project":**
  - Enabled once the key shows "Works" and the folder is set.
  - Creates the project and opens the Workspace in the Interview state.

**Background:** the shape field in "lively" mode.

### 6.2 Workspace — common header (all workspace states)

Left to right, gap 8px, height ≈64px:

1. **Wordmark lockup.** Clicking it does nothing (it is not a home link).
2. **Project button:** pill, mono 12px, project short name plus chevron. Opens the Project
   menu (§6.9). ⌘P also opens it.
3. **Stepper**, centered with auto margins.
4. **Run controls** segmented control, shown only while a run is active:
   - "Pause" ⇄ "Resume"
   - "Take the wheel" ⇄ "Hand back to Fitts"
   - "Stop run" in danger-ink text
5. **Permission mode** select: Plan only / Ask every action / Ask when unsure /
   Autonomous. It can be changed mid-run; the change takes effect at Fitts's next action.
6. **Brief** icon button (document icon). Opens the Brief popover (§6.10).
7. **"Mic on"** status chip, shown while the mic is live.
8. **Cost chip.**
9. **Settings** icon button. ⌘, also opens Settings.

### 6.3 Workspace · Interview — `Interview.html`

**Layout:** site view (flex) + chat panel (420px). No site map, no tray.

- **Site view toolbar:**
  - navigation group (Back / Forward / Reload, 36px icon buttons)
  - URL field
  - "You're driving" sun chip (during the interview the user controls the site)
  - "Point at something" button
- **Site view content:** the mock Demo Chat site (§9.4), fully clickable.
- **Chat:** the conversation shown in the reference.
  - Fitts asks one question at a time.
  - Quick-reply chips appear after questions that have common answers.
  - The "What I know so far" card (sun tint) updates as answers arrive. Its fields are For,
    Who, Pain and Feel; unanswered fields read "Waiting on you".
- **Ready bar:**
  - Pinned above the message box. Appears once For and Who are known.
  - Reads "I know enough to start", with "Start the audit" (primary) and "Skip the rest".
  - Before that point the bar reads "Want to skip the interview?" with
    "Skip, just look around".
- **Message box:** text input, 48px. Enter sends. A hold-to-talk mic button sits to the
  right; in the mock, holding it shows "Listening…" and on release sends a canned
  transcript.
- **Interview script:**
  - Defined in `mock/scenarios/interview.ts`.
  - Fitts's next question appears 900ms after each user answer, with a typing indicator
    (three cobalt dots).
  - Answers can be typed freely. The mock maps any text to the next brief field.

### 6.4 Workspace · Audit & fix — `Auditing.html`

**Layout:** a top row (site map 210px | site view flex | chat 400px) above the findings
tray (full width).

#### Site map panel
- A list of routes with status dots:
  - mint = done
  - cobalt = testing (current route row has cobalt-tint background)
  - hollow = queued
  - each row shows its issue count or "next"/"later"
- Child routes are indented by 14px.
- Footer box "Controls tried · 14 of 24" with a mint progress bar.

#### Site view
- **Toolbar:** nav group, URL field, "Highlights on" toggle, "Before / after" toggle,
  "Point at something".
- **Overlays**, drawn in a layer above the mock site and aligned to its elements by ref:
  - **Problem highlight:** 2.5px coral outline, 6px outset, with a numbered coral pin.
  - **Attention highlight:** 2.5px cobalt outline with a 0.08 cobalt fill on the element
    Fitts is acting on.
  - **Ghost cursor:** cobalt arrow with an ink stroke, plus a white label
    ("Fitts · tapping NEXT"). It animates between targets (300ms ease).
  - "Highlights on" toggles all overlays.
- **Footer strip:** mono, "Step 42 of about 120" on the left and "6:12 elapsed" on the
  right (live clock).
- **Rewind:** clicking a timeline dot or a finding's "replay it" link puts the site view in
  rewind mode:
  - the URL field shows "· rewound to step N"
  - "Back to live" appears
  - the mock site shows the stored snapshot state

#### Chat panel
- **Header:** avatar, "Fitts", status (Listening / Speaking / Working / Paused /
  Redesigning / Waiting on you), and a mute toggle for Fitts's voice.
- **Item list:** see §6.6.
- **Composer, while a run is active:**
  - **"Now:" line** (cobalt tint): dot, current action text, and Kbd "⌘. stops it" on the
    right.
  - **Queued row** (dashed cobalt): only when the user sent a message while Fitts was
    mid-action. Reads "Queued: "…"" with an "Interrupt now" button.
  - **Input row:** input (placeholder "Interject anytime, or say 'Fitts, stop'"), the red
    stop button (shown only while an action is running), and the mic button.

#### Findings tray
- **Title:** "Findings · N so far".
- **Filter chips:** All / Usability / Accessibility / Performance / Look & feel.
- **Horizontal list** of finding cards, 230px wide:
  - severity badge, title
  - status line: "Fixing now" (cobalt-ink), "Fixed ✓" (mint-ink), or "H4 · /compose"
  - the selected card has a 2px cobalt border
  - clicking a card opens the Finding panel
- **Timeline:**
  - start time, then a track with a cobalt progress fill
  - severity-colored dots at each finding's moment
  - an ink playhead, end label "6:12 · click a dot to rewind"
  - dots are buttons labelled "Rewind to <finding title>"

### 6.5 Finding panel — `Finding.html` (has an Ask / Autonomous variant)

**Placement:** opens over the site view, never over the chat.

- Anchored top 64px (below the toolbar), right 12px, bottom 12px; width 56% of the site
  view, min 440px.
- The site content shifts left so the outlined element stays visible.
- Open and close: slide 16px with a fade.

**Header:**
- Badges: severity with label, heuristic, "4 of 5 agree" (mint)
- Title
- Close button

**Body (scrolls):**
- "Finding:" paragraph and "Fix:" paragraph.
- Tabs: Live preview / Mockup / Evidence.
  - **Live preview** shows the BeforeAfterSlider: "NOW" pane and "WITH FIX" pane.
  - **Mockup** shows a generated-image placeholder labelled "Mockup · not code".
  - **Evidence** shows the reviewer agreement list and the replay link.
- Below the tabs: the evidence bullets and the code diff block (ink background; red/green
  lines in `#FF9C90` / `#7FF0C8`, with a file:line caption).

**Footer, by state:**

| State | Footer |
|---|---|
| Ask modes, not yet fixed | "Fix it" (primary), "Change the fix", "Not a problem" |
| Autonomous, or already fixed | mint bar "Fixed and verified ✓ · <check> passes" with "View PR #12" and "Undo" |
| Fixing | cobalt bar "Fixing… re-checking at phone, tablet and desktop widths" with an indeterminate progress bar |

**Actions:**
- "Not a problem" asks one optional follow-up in chat ("Want to tell me why? It helps next
  time.") and marks the finding dismissed.
- "Change the fix" focuses the chat input prefilled with "For the button names, instead…".
- Esc closes the panel.

### 6.6 Chat item types (`features/chat/items/*`)

| Type | Look | Notes |
|---|---|---|
| `fitts.message` | Plain text, max-width 92% | Can include **bold** spans |
| `user.message` | Cobalt-tint bubble, right-aligned, radius 16 16 4 16 | Optional "SPOKEN" tag; optional "pointing at #id" chip |
| `fitts.thinking` | Lilac-tint block, "Thinking:" bold prefix | Reasoning summaries |
| `steps` | Dashed "Show N steps I took" button | Expands to an action list (mono action + cost) |
| `finding` | White card, 1px ink | Badge, heuristic · agreement, title, "See evidence and fix" |
| `question` | Sun-tint card | Label "When you get a sec · I'm testing other pages meanwhile" (non-blocking) or "I need you · paused" (blocking); answer buttons |
| `approval.batch` | White card | "8 fixes are ready" + "Fix all 8" / "Only the 3 serious" / "Review each" |
| `fix.result` | Mint-tint row | "Fixed and verified ✓ · <title>", View PR, Undo |
| `brief` | Sun-tint card | Interview only (§6.3) |
| `quick-replies` | Pill buttons | Disappear after one is used |
| `lookfeel` | Lilac-tint card | Redesign (§6.7) |
| `directions` | Three option buttons | Redesign |
| `progress` | Checklist card | ✓ done (mint-ink), ◐ in progress (cobalt-ink), ○ pending (muted) |
| `wording` | Sun-tint card | "Wording changed · undo each one separately" + Keep / Undo this |
| `state` | Card | Edge-case cards from §7.7 |
| `driving` | Card | "You're driving. I'm watching." + "Hand back to Fitts" |

Every Fitts item shows in the list, and the same text is what Fitts would speak.
New items scroll the list to the bottom unless the user has scrolled up; in that case a
"New messages ↓" pill appears.

### 6.7 Redesign variant — `Redesign.html` (project "hartwell-site", Autonomous)

**While a redesign is proposed or applied:**
- The site map and tray collapse.
- The site view becomes a full-height before/after comparison of the mock Hartwell site.
- The chat is 420px.

**Chat sequence:**
1. `lookfeel` card explaining the mismatch.
2. Message: "I mocked up three calmer directions and applied the one closest to what you
   described: quiet and dignified. Pick another anytime."
3. `directions` card. The selected option has a 2px cobalt border; picking another swaps
   the "AFTER" pane.
4. `progress` card "Applying the look", with "Undo redesign" and "Adjust it".
5. `wording` card: "Party packages" → "Service options".

**Mode behavior:**
- **Autonomous:** applies automatically.
- **Ask modes:** stop after the `directions` card and wait for the user to pick.

The site-view toolbar shows "Before / after" (on) and "Every page".

### 6.8 Workspace · Done — `Done.html`

**Layout:** preview site view (520px) + run summary panel (flex).

**Preview site view:**
- URL `localhost:5180/compose`.
- Caption "Preview branch `fitts/preview-run-7` · all 24 fixes combined".
- Shows the "fixed" version of the mock Demo Chat site.

**Run summary header:**
- Avatar, Fitts's closing message.
- Run picker select ("Run #7 · today", "Run #6 · yesterday", …). Picking a past run loads
  that run's mock summary.
- "Export report" (save dialog, writes markdown).
- "New run" (primary). Starts the Interview again with the brief prefilled; Fitts asks
  "Anything changed since last time?"

**Body (scrolls):**
- Four stat tiles: Found (coral-tint), Fixed & verified (mint-tint), Pull requests
  (cobalt-tint), Spent (sun-tint).
- Math line: "31 found = 24 fixed + 2 rolled back + 3 you marked 'not a problem' + 2
  suggestions without enough evidence."
- **"What I changed" list**, each row: badge, title, PR link (mono), cost, Undo.
  - Rolled-back rows: dashed danger border, danger-tint background, "Try again" (sun).
  - "See all 26 changes" expands the list.
  - **Undo (mock):** the row turns muted, "Undone · PR #13 closed" with a "Redo" link;
    stats update.
  - **Try again:** the row becomes "Retrying…" and resolves to "Fixed and verified ✓"
    after 3s.
- **"Where the $13.92 went":** a stacked bar (cobalt fixes, lilac reviewers, mint
  crawling, sun summing up, coral images/outlines/voice) plus a legend with amounts.

### 6.9 Project menu — `Projects.html`

- **Opens from:** the project button or ⌘P.
- **Placement:** popover under the button, 440px wide.
- **Contents:**
  - Search input, focused on open; filters the list.
  - Project rows, each a button with a status dot, name and a caption:
    - "current" (cobalt-tint row)
    - "running in the background · step 18" (cobalt dot, "Running")
    - "never audited" (hollow dot)
  - "+ Add a project" (dashed). Opens the Add-project dialog.
  - Footnote: "⌘P to switch. Each project keeps its own brief, findings, runs and
    spending. One run at a time: starting a second asks to pause the first. A run in the
    background still notifies you when it needs you."

**Switching rules:**
- Switching projects keeps the other project's run going (the mock engine keeps ticking it).
- Starting a run while another project's run is active opens a confirm:
  "Pause hartwell-site's run to start this one?" with "Pause it and start" / "Cancel".

### 6.10 Brief popover

- Opens from the header Brief button.
- A 360px popover with editable fields: For, Who, Feel, Pain points, Key flows, Out of
  scope.
- "Save" updates the project brief and posts a chat note: "Got it, I'll keep that in mind
  from here."

### 6.11 Add a project — `AddProject.html`

**Modal, 640px.** Two tabs:

- **Code on this computer** (audit and fix):
  - folder field + Browse
  - mock detection list (framework, dev server command with a "Change" link, GitHub
    repo, plugin warning)
  - checkbox "Install the Fitts plugin with a small pull request"
  - Name field
- **Live site only** (audit only):
  - URL field
  - verification instructions with the token file path and a copy button
  - "Check now" (mock: succeeds after 1s)

**Primary button:** "Add and open". Closes the dialog, switches to the new project and
starts its Interview.

### 6.12 Background shape field (`features/background`)

- **Rendering:** a full-window `<Canvas>` fixed behind the UI (`z-index: 0`), transparent
  background, gentle studio lighting (one key light upper-left, ambient fill).
- **Materials:** `MeshStandardMaterial`, roughness 0.45, metalness 0, matching the
  gradients in the references.
- **Shapes and colors:**

  | Shape | Color |
  |---|---|
  | Sphere | coral `#FF6B5B` |
  | Rounded box | cobalt `#3D5AFE` |
  | Torus | sun `#FFC53D` |
  | Capsule | mint `#2BD9A0` |
  | Square pyramid (cone, 4 segments) | lilac `#B69CFF` |
  | 3–4 small spheres and boxes | mixed |

- **Physics (`@react-three/rapier`):**
  - zero gravity
  - slow random drift impulses every 4–8s
  - restitution 0.6, linear damping 0.3, angular damping 0.4
  - invisible walls at the window edges; shapes collide with each other
- **Cursor:**
  - A kinematic sphere collider (radius 40px in world units) follows the pointer, so
    shapes bump away from the cursor.
  - Pointer events are read from `window`, because the canvas sits under the UI.
- **Drag and throw:**
  - On pointerdown, if the event target is the canvas (not UI), raycast; if a shape is hit,
    grab it and switch it to kinematic.
  - On release, restore it to dynamic with the pointer velocity.
- **Modes:**

  | Mode | Where | Shapes | Speed | Scale |
  |---|---|---|---|---|
  | `lively` | Welcome | 10 | full | 1.0 |
  | `calm` | Workspace | 6, biased to the edges | 40% | 0.8 |
  | `still` | Setting, or reduced motion | static layout | none | — |

- **Event reactions:**
  - **Fitts speaking:** all shapes pulse (scale ×1.04, 600ms ease).
  - **New finding:** one shape in the severity color drops in from the top edge.
  - **Run finished:** a gentle burst outward from the center.
- **Performance:**
  - cap at 30fps
  - pause rendering when the window is hidden or blurred
  - pause while the BeforeAfterSlider is being dragged
- **Settings** (§6.13): "Floating shapes" on/off and "Shape movement" Still / Gentle /
  Lively.

### 6.13 Settings — `Settings.html`

**Layout:** full window view (not a modal). Title "Settings" and "Back to workspace"
(Esc also returns). Left nav, 210px, four tabs; content to the right. No window scroll; a
section scrolls internally if needed.

**Run & permissions**
- **Permissions card:**
  - four radio rows (the selected row has a 2px cobalt border and cobalt-tint fill)
  - note "Destructive actions and pushes to GitHub **always** ask, in every mode above."
- **Dangerous mode box:**
  - dashed danger border
  - typed-confirmation input "I understand Fitts may delete data". When it matches, a
    toggle enables Dangerous mode.
  - a preview of the red banner
- **Budget & models card:**
  - cap input; caption "Fitts warns at 80% and pauses to ask at 100%."
  - model profile segmented control: Quality / Economy / Open weights. Open weights is
    disabled with "Add a Baseten key first" until a Baseten key exists.
  - Contributor mode checkbox

**Voice & appearance**
- "Fitts speaks out loud" toggle
- Voice select ("Fitts (ElevenLabs)", "System voice (no key)") + "Preview" (mock:
  `speechSynthesis` says "Hi, I'm Fitts.")
- "How you talk to Fitts" select: "Hold Option + Space" / "Always listening for 'Fitts'" /
  "Typing only"
- The note about wake words and the chime
- "Floating shapes" toggle and "Shape movement" slider

**API keys**
- Rows for Meta Model API (required), ElevenLabs and Baseten
- Each row: status chip ("Works" / "Not added"), "Replace" / "Add key" (inline masked
  input)
- Note: "Keys are encrypted with your OS keychain and only sent to their own provider."

**Projects**
- List of projects with Rename and Remove. Remove confirms, and only removes Fitts's data,
  never the user's folder.

**Dangerous mode banner:** when Dangerous mode is on, a red banner
"PERMISSIONS SKIPPED · localhost only · ends with this run" + "Turn off" appears above the
workspace header for the rest of the run.

---

## 7. Behavior rules

### 7.1 Permission modes (simulated by the mock engine)

| Mode | Benign clicks/typing | Form submits / state changes | Code fixes | Redesign | Destructive | Push/PR |
|---|---|---|---|---|---|---|
| Plan only | — (observes only) | — | — | proposes only | — | — |
| Ask every action | asks (approval card) | asks | asks | asks | red modal | asks |
| Ask when unsure | does | asks if unsure | asks (batched) | asks | red modal | asks |
| Autonomous | does | does | does, all undoable | applies automatically | red modal | asks |
| Dangerous (Settings) | does | does | does | applies | does (localhost only) | does |

The mode change takes effect at the next action. Fixes already in progress finish;
switching out of Autonomous makes them wait for approval before being pushed.

### 7.2 Stopping, pausing, interjecting

- **Stop current action:** ⌘. / Ctrl+., the red stop button, or saying "Fitts, stop".
  - The current step is cancelled.
  - The chat shows the `state` card "Stopped. What should I do instead?" with Resume /
    Skip this step / Take the wheel.
  - The run is paused.
- **Pause:** Fitts finishes the click in progress, then holds. The status reads "Paused".
  The header button becomes "Resume".
- **Stop run:** confirm card "Stop this run? I'll keep all 12 findings. The 2 fixes I'm
  working on get thrown away. Nothing has touched your branch." with Stop run (danger) /
  Keep going. Confirming goes to Done with partial results.
- **Interjecting:**
  - A message typed while Fitts is mid-action is queued and shown in the Queued row. It is
    delivered after the current step.
  - "Interrupt now" stops the action and delivers the message immediately.
  - "Fitts, …" voice messages always interrupt.
- **Esc:** only closes the topmost overlay (menu → popover → panel → modal). It never
  stops Fitts.

### 7.3 Take the wheel

1. Fitts finishes its current click.
2. Then:
   - the status becomes "You're driving"
   - highlights and the ghost cursor hide
   - the `driving` card appears in chat
   - the header shows "Hand back to Fitts"
3. The user clicks freely in the mock site. In the mock, each click is logged as
   "You clicked <label>" in a collapsed steps item.
4. On hand-back, Fitts says: "Thanks. You went through <path>. Want me to test that path
   properly?" with Yes / No.
5. In Phase 1, "Yes" just adds a "Testing your path" `progress` item.

### 7.4 Point at something

1. The cursor becomes a crosshair over the site view.
2. Hovered elements get a dashed cobalt outline.
3. A click attaches a chip "pointing at #<element id>" to the message box and focuses it.
4. The chat shows the hint "Pointing: click an element" until then.
5. Esc cancels.

### 7.5 Voice (UI only in Phase 1)

- **Mic button:**
  - press-and-hold (or hold ⌥Space / Alt+Space) shows "Listening…" in the status
  - release sends the canned transcript for the current scenario
- **"Mic on" chip:** visible while listening, or always in "Always listening" mode.
- **Speaking:** if "Fitts speaks out loud" is on, Fitts's chat lines are spoken with
  `speechSynthesis`, and the avatar pulses while speaking.
- **Wake word:** in "Always listening" mode, only messages starting with "Fitts" count as
  commands. A chime (a short sine blip via WebAudio) plays when listening starts and stops.

### 7.6 Undo semantics (as displayed)

- **Before a PR is merged:** Undo closes the PR and deletes the branch ("Undone · PR #13
  closed").
- **After it's merged:** Undo opens a revert PR ("Revert PR #21 opened").
- The mock shows the first case. A mock "merged" flag on one item shows the second.

### 7.7 Edge-case states (`States.html`)

Each is a `state` chat card, a modal or a system notification, reachable from the
Scenario panel:

- Stop run confirm
- Stopped one action
- You're driving
- Uncommitted changes before the audit:
  - "You have 3 files you haven't committed…"
  - Buttons: "Save them and continue" / "I'll commit first"
- Login wall:
  - "/settings needs an account"
  - Buttons: Take the wheel to log in / Add test login / Skip page
- Batch approval
- Site down:
  - "Your site stopped responding" with the last dev-server output
  - Buttons: Restart server / I'll fix it, wait
- Budget reached:
  - "I've reached your $20 cap"
  - Buttons: Add $10 / Finish on Economy / Stop here
- API trouble, with a live retry countdown: "Retrying in 12 seconds, attempt 2 of 5"
- Reopen after crash: "Pick up where we left off?" with Resume run / See summary
- Background project needs you:
  - a real Electron `Notification` "Fitts needs you · Can I submit the contact form with
    test data?"
  - clicking it switches to that project with the question open
- Nothing found:
  - "Nothing here worth changing", with "See what I checked" listing the checks
- Returning-user home: Welcome screen with a "Welcome back" project list instead of the
  setup card

### 7.8 Destructive-action gate — `Gate.html`

**Trigger:** the mock engine raises a `gate` request at a scripted moment, in every mode
except Dangerous.

**Modal:**
- `role="alertdialog"`, scrim 62%
- red header with a warning icon: "This could delete real data"
- body line: "I want to tap "Delete conversation" on /contacts/grandma to see if it asks
  first or lets you undo. Before I do, I need a clear yes from you."
- detail grid: I'd click / I'm holding / Testing / Your mode
- checkbox "I understand this may delete data on localhost:5173"
- buttons:
  - "Don't do it" (dark, focused by default)
  - "Test something else"
  - "Allow once" (danger outline, disabled until the box is checked)
- caption about the unlock

**Behavior:**
- Esc means "Don't do it".
- The run stays paused while the modal is open.
- The decision is posted to chat as a small `fitts.message`.

### 7.9 Keyboard shortcuts

| Action | macOS | Windows/Linux |
|---|---|---|
| Stop current action | ⌘. | Ctrl+. |
| Pause / resume run | ⌘⇧P | Ctrl+Shift+P |
| Hold to talk | ⌥Space (hold) | Alt+Space (hold) |
| Project menu | ⌘P | Ctrl+P |
| Settings | ⌘, | Ctrl+, |
| Focus message box | ⌘L | Ctrl+L |
| Close topmost overlay | Esc | Esc |
| Scenario panel (dev builds only) | ⌘⇧D | Ctrl+Shift+D |

---

## 8. Fitts's voice and copy rules

**Tone:** warm, conversational and concise. First person, contractions, plain words. Every
sentence carries information.

**Never:**
- filler ("Awesome!", "Let's dive in", "Great question")
- emoji
- exclamation marks, except a greeting ("Hi Allen!")

**Explain effects on people, then the rule:** "people can't tell if they're moving on or
sending (H4)".

**Spoken lines** (the first line of any card) stay under about 25 words.

**Canonical strings.** Keep them exactly; put all of them in `copy.ts`.

| Where | String |
|---|---|
| Interview opener | "Hi {name}! Before I touch anything, I'd love to hear about this site. What's it for?" |
| Interview follow-up | "Got it. I can see the {screen} screen right now. Where do they get stuck?" |
| Interview tie-back | "That gives me two things to test first: whether sending shows any feedback, and whether the buttons agree on their names. **How should the app feel when they open it?**" |
| Ready bar | "I know enough to start" |
| First findings | "Found the first two from your list. The recipient shows as "(null)", and this button says NEXT while the last one said Send Text." |
| Non-blocking question label | "When you get a sec · I'm testing other pages meanwhile" |
| Done | "All done. I verified 24 fixes and opened 9 pull requests. Two changes didn't pass my checks, so I rolled them back. Want me to try those again with a different approach?" |
| Redesign | "You told me this site is for families who just lost someone. Hot pink, confetti shapes and a bouncy font read as celebratory, which can feel hurtful at a hard moment." |
| Hand back | "Thanks. You went through {path}. Want me to test that path properly?" |
| Stopped | "Stopped. What should I do instead?" |

---

## 9. Data model and mock run engine

### 9.1 Types (`packages/schema/src/index.ts`)

```ts
export type Mode = 'plan' | 'ask-every' | 'ask-unsure' | 'autonomous' | 'dangerous';
export type Severity = 0 | 1 | 2 | 3 | 4;
export type Heuristic = 'H1'|'H2'|'H3'|'H4'|'H5'|'H6'|'H7'|'H8'|'H9'|'H10';
export type Lens = 'usability' | 'accessibility' | 'performance' | 'look-and-feel' | 'ergonomics' | 'content';
export type RunPhase = 'interview' | 'audit' | 'done';
export type RunActivity = 'idle' | 'acting' | 'paused' | 'user-driving' | 'waiting-on-user' | 'redesigning';

export interface Project {
  id: string; name: string; kind: 'local' | 'live';
  folder?: string; url: string; framework?: string; devCommand?: string; repo?: string;
  brief: Brief; lastRunId?: string; createdAt: string;
}
export interface Brief { for?: string; who?: string; feel?: string; pain?: string; flows?: string; outOfScope?: string }

export interface Finding {
  id: string; runId: string; severity: Severity; heuristic?: Heuristic; lens: Lens;
  title: string; finding: string; fix: string; route: string;
  agreement: { agreeing: number; total: number; who: string[] };
  evidence: string[]; elementRef?: string; stepIndex: number; atMs: number;
  diff?: { files: string[]; lines: { kind: 'add' | 'del'; text: string }[] };
  status: 'open' | 'dismissed' | 'fixing' | 'verified' | 'pr-opened' | 'rolled-back' | 'undone';
  prNumber?: number; costUsd?: number;
}

export interface Change {
  id: string; findingIds: string[]; kind: 'fix' | 'batch' | 'redesign' | 'wording';
  title: string; severity?: Severity; prNumber?: number; costUsd: number;
  status: 'verified' | 'rolled-back' | 'undone' | 'retrying'; merged?: boolean; reason?: string;
}

export interface GateRequest {
  id: string; action: string; route: string; heldRequest: string; testing: string;
}

export type ChatItem =
  | { id: string; type: 'fitts.message'; text: string }
  | { id: string; type: 'user.message'; text: string; spoken?: boolean; pointingAt?: string }
  | { id: string; type: 'fitts.thinking'; text: string }
  | { id: string; type: 'steps'; steps: { label: string; costUsd: number }[] }
  | { id: string; type: 'finding'; findingId: string }
  | { id: string; type: 'question'; blocking: boolean; text: string; options: string[]; answer?: string }
  | { id: string; type: 'approval.batch'; findingIds: string[]; serious: number }
  | { id: string; type: 'fix.result'; changeId: string }
  | { id: string; type: 'brief' }
  | { id: string; type: 'quick-replies'; options: string[]; used?: boolean }
  | { id: string; type: 'lookfeel'; text: string }
  | { id: string; type: 'directions'; options: { id: string; name: string; swatches: string[] }[]; selectedId?: string }
  | { id: string; type: 'progress'; title: string; items: { text: string; state: 'done' | 'doing' | 'todo' }[] }
  | { id: string; type: 'wording'; from: string; to: string; decision?: 'keep' | 'undo' }
  | { id: string; type: 'state'; stateKind: EdgeStateKind }
  | { id: string; type: 'driving' };

export type EdgeStateKind =
  | 'stop-run-confirm' | 'stopped' | 'uncommitted' | 'login-wall' | 'site-down'
  | 'budget' | 'api-trouble' | 'reopen' | 'nothing-found';

export interface RunState {
  runId: string; projectId: string; phase: RunPhase; activity: RunActivity; mode: Mode;
  step: number; stepEstimate: number; elapsedMs: number; nowText?: string;
  routes: { path: string; depth: number; status: 'done' | 'testing' | 'queued'; issues: number; label?: string }[];
  controlsTried: { done: number; total: number };
  findings: Finding[]; changes: Change[]; chat: ChatItem[]; queued: string[];
  overlays: { problems: { ref: string; pin: number }[]; attention?: { ref: string; label: string } };
  gate?: GateRequest; rewindStep?: number; fixingCount: number;
  cost: { spentUsd: number; capUsd: number; byPhase: Record<'fixes'|'reviewers'|'crawling'|'summing'|'media', number> };
}
```

### 9.2 RunEngine interface (`state/engine.ts`)

The UI talks only to this interface. Phase 2 implements it over Electron IPC.

```ts
export interface RunEngine {
  getState(projectId: string): RunState | undefined;
  subscribe(projectId: string, fn: (s: RunState) => void): () => void;

  startInterview(projectId: string): void;
  answerInterview(projectId: string, text: string): void;
  startAudit(projectId: string): void;            // also "Skip, just look around"
  pause(projectId: string): void;
  resume(projectId: string): void;
  stopAction(projectId: string): void;            // ⌘.
  stopRun(projectId: string): void;
  takeWheel(projectId: string): void;
  handBack(projectId: string): void;
  sendMessage(projectId: string, text: string, opts?: { pointingAt?: string; spoken?: boolean }): void;
  interruptNow(projectId: string): void;
  answerQuestion(projectId: string, itemId: string, answer: string): void;
  approveFixes(projectId: string, findingIds: string[]): void;
  dismissFinding(projectId: string, findingId: string): void;
  respondGate(projectId: string, gateId: string, decision: 'deny' | 'other' | 'allow'): void;
  setMode(projectId: string, mode: Mode): void;
  pickDirection(projectId: string, directionId: string): void;
  decideWording(projectId: string, itemId: string, decision: 'keep' | 'undo'): void;
  undoChange(projectId: string, changeId: string): void;
  retryChange(projectId: string, changeId: string): void;
  rewindTo(projectId: string, stepIndex: number | null): void;
}
```

### 9.3 MockRunEngine (`state/mock-engine.ts`)

- **Script player:** each scenario is a list of beats, `{ atMs, apply(state) }`.
  - A 1Hz-or-faster ticker advances `elapsedMs` and applies due beats.
  - Speed multiplier 1× / 2× / 4× comes from the Scenario panel.
- **Gating beats:** a beat can be gating, with `waitFor: 'question:<id>' | 'gate' |
  'approval'`. The player halts until the user acts.
- **Mode awareness:**
  - Beats with `requires: 'approval'` produce an approval card in Ask modes and auto-apply
    in Autonomous.
  - The redesign beat behaves the same way (§6.7).
- **User actions** mutate state immediately and may append scripted responses (for
  example, a Fitts reply 900ms after `sendMessage`).
- **Background projects:** `subscribe` works per project, and the ticker keeps running for
  runs in non-visible projects.
- **Unit tests** cover:
  - beat ordering
  - pause/resume
  - stopAction
  - gating
  - mode switching mid-run
  - undo/retry state changes

### 9.4 Mock sites (`mock/sites/`)

Self-contained React components rendered inside the site view, styled as plain,
slightly-bad websites. They use system fonts and do not use app tokens.

**DemoChatSite (project demo/chat):**
- **Screens:** Inbox → Compose (step 1: To, step 2: message) → Confirm.
- **Seeded flaws:**
  - "(null)" recipient
  - labels NEXT / Send Text / Create Message
  - no back button
  - no confirmation after sending
  - tiny send target
  - search that "refetches on every keystroke" (show a spinner per keystroke)
- **"Fixed" variant (Done preview):**
  - consistent Next/Send labels
  - Back button
  - "Sent to Grandma ✓" confirmation
  - larger type and targets
- Every interactive element has a stable `data-ref` used by overlays and "point at".

**HartwellSite (project hartwell-site):**
- **"Now":** playful version (hot pink, confetti dots, bouncy rounded type, "Party
  packages", rotated "Book now" pill).
- **Three "after" directions:**
  - Quiet & dignified: navy/stone, serif (Fraunces, bundled)
  - Warm & personal: brown/caramel
  - Classic & formal: black/gray

### 9.5 Scenarios (`mock/scenarios/`)

**A. demo/chat · Ask when unsure** (main flow, about 100s at 1×)

| t (s) | Beat |
|---|---|
| 0 | Interview opener (phase interview, user drives) — gating on answers |
| — | After "Start the audit": phase audit, activity acting, site map seeds 8 routes |
| 2 | Fitts message "Starting with the compose flow, since that's where you said people get stuck." |
| 6 | steps item (5 steps), attention highlight on Compose button, ghost cursor moves |
| 10 | thinking line about H6 recall |
| 14 | Finding: "(null)" shown as a name — Sev 3 H2, coral pin 1 |
| 18 | Finding: One action, three names — Sev 3 H4, 4/5 agree; first-findings message |
| 24 | Non-blocking question "/admin — should I test it too?" (run continues) |
| 30 | Finding: No confirmation after sending — Sev 4 H1 |
| 34 | approval.batch "3 fixes are ready" (Ask) → on approve: fixingCount=2, "Fixing now" |
| 44 | fix.result: "Show 'Sent' confirmation" verified, PR #13 |
| 50 | Finding: Search refetches every keystroke — Sev 2 Performance |
| 56 | Gate request: Delete conversation (gating) |
| 66 | Finding: Send target is 28 × 20 px — Sev 1 Accessibility |
| 72 | fix.result: "One name per action" verified, PR #12 |
| 80 | Rolled-back change: spacing on /settings broke phone layout |
| 90 | phase done, closing message, stats from fixture (31/24/9/$13.92) |

**B. hartwell-site · Autonomous redesign** (about 40s): the lookfeel beat, directions,
progress ticking (✓, ✓, ◐ 9 of 14 pages, ○ PR), wording card, then the redesign PR in Done.

**C. Edge states:** a single-state scenario for each item in §7.7.

### 9.6 Scenario panel (dev builds only, ⌘⇧D)

A floating 320px panel, bottom-left, with:
- Scenario list:
  - Welcome (first launch)
  - Welcome back
  - Interview
  - Audit (Ask)
  - Audit (Autonomous)
  - Finding panel (Ask)
  - Finding panel (Autonomous)
  - Gate
  - Redesign
  - Done
  - Settings
  - Project menu
  - Add project
  - Brief
  - each edge state
- Speed 1× / 2× / 4×
- Restart scenario
- Jump to beat
- Toggle "Fitts speaks out loud"

Not rendered in production builds.

---

## 10. Accessibility requirements

- **Semantics:**
  - Every interactive element is a native control or has the correct role.
  - Icon-only buttons have `aria-label`.
- **Focus:**
  - Focus order follows the visual order.
  - Overlays trap focus and restore it on close.
  - The destructive modal focuses "Don't do it".
- **Live regions:**
  - The chat list is `role="log"` with `aria-live="polite"`.
  - Fitts's blocking questions use `aria-live="assertive"`.
- **Contrast:** all text ≥ 4.5:1 (the token pairs in §5.1 meet this). UI boundaries for
  inputs ≥ 3:1 (ink borders do).
- **Color is never the only signal:** severity always has text, and status dots are
  paired with words.
- **Reduced motion:** honored everywhere (shapes still, no emblem animation, instant panels).

---

## 11. Milestones (do in order; each ends green)

**M0 — Scaffold**
- Build:
  - pnpm workspace, electron-vite React/TS app
  - Tailwind v4 + `tokens.css`, local fonts
  - ESLint and Prettier
  - Vitest, Playwright Electron harness, axe helper
  - window rules from §4
- Accept:
  - `pnpm dev` opens a 1440×900 window with `--paper` background
  - min size 1200×720 enforced
  - all scripts run green

**M1 — Design system + gallery**
- Build:
  - every component in §5.4, with all variants and states
  - the logo mark, wordmark lockup and avatar
  - a `/gallery` route (dev only)
- Accept:
  - the gallery visually matches the references
  - axe shows zero serious issues on the gallery
  - the focus ring is visible on every control

**M2 — Schema, engine, scenarios, Scenario panel**
- Build: §9 in full, with no screens yet except a debug view that renders `RunState` as JSON.
- Accept:
  - engine unit tests pass (beats, gating, pause/resume, stopAction, mode change, undo/retry)
  - the Scenario panel switches scenarios

**M3 — App navigation + Welcome + Settings + projects**
- Build:
  - app router (Welcome / Workspace / Settings)
  - Welcome (§6.1) without the emblem animation
  - Settings (§6.13)
  - Project menu (§6.9)
  - Add-project dialog (§6.11)
  - persisted projects and settings
- Accept:
  - a first-launch flow creates a project and lands in a Workspace placeholder
  - ⌘P and ⌘, work
  - the dangerous-mode typed confirm works

**M4 — Workspace shell + Interview**
- Build:
  - the common header (§6.2)
  - site view with DemoChatSite and toolbar
  - chat panel with composer
  - Interview state (§6.3): brief card, quick replies, ready bar
  - Brief popover (§6.10)
- Accept:
  - you can complete the interview by typing or quick replies, then start the audit
  - no window scroll

**M5 — Audit & fix**
- Build:
  - site map
  - overlays (problem / attention / ghost cursor)
  - footer strip
  - all chat item types used by Scenario A
  - Now line, queued row, stop button
  - findings tray, filters, timeline with rewind
  - run controls (pause/resume, stop run confirm, take the wheel, point at something)
- Accept:
  - Scenario A plays to the gate beat
  - stopping, pausing, interjecting (queue + interrupt) and take the wheel all behave as §7.2–§7.4

**M6 — Finding panel + Gate + edge states**
- Build:
  - §6.5 with Ask / Autonomous / Fixing footers
  - BeforeAfterSlider
  - §7.8 gate modal
  - batch approval
  - all §7.7 cards and the real background-project notification
- Accept:
  - Scenario A completes to Done
  - every edge state is reachable from the Scenario panel and is axe-clean

**M7 — Redesign + Done**
- Build:
  - §6.7 with HartwellSite and its three directions
  - §6.8 run summary: stats, math line, change list with undo/redo/try again, cost bar,
    run picker, export report
- Accept:
  - Scenario B plays in Autonomous (auto-apply) and in Ask (waits for a pick)
  - Undo and Try again update the stats

**M8 — Motion + background shapes + voice UI**
- Build:
  - §6.12 shape field with all modes and event reactions
  - Welcome emblem animation
  - avatar pulse
  - speechSynthesis option
  - mic hold and the chime
- Accept:
  - shapes collide, push away from the cursor and can be thrown
  - 30fps cap
  - paused when blurred
  - reduced motion respected
  - the Settings toggles work

**M9 — Polish and self-check**
- Build:
  - keyboard-only pass of every flow
  - verify there's no window scroll at 1440×900 and 1200×720
  - `docs/DECISIONS.md` complete
  - `pnpm build` produces a runnable app
- Accept:
  - all e2e flows (§12) pass
  - axe is zero serious/critical across every scenario
  - a 3-minute manual click-through of Scenario A feels smooth

---

## 12. Tests

- **Unit (Vitest):**
  - mock engine (§9.3)
  - copy-string presence
  - severity/label helpers
  - BeforeAfterSlider keyboard behavior
- **E2E (Playwright `_electron`):**
  1. First launch → setup → interview → start audit → open finding → Fix it → gate → deny →
     done → undo a change.
  2. Autonomous redesign: pick another direction, undo wording.
  3. Project switching while a background run continues; a notification-click lands on the
     question.
  4. Stop/pause/interject: ⌘. shows the Stopped card; Esc closes the Finding panel without
     stopping.
  5. Settings: Open weights disabled until a Baseten key exists; dangerous-mode confirm.
- **Accessibility:** `@axe-core/playwright` on every Scenario-panel entry; fail on serious
  or critical.
- **Layout guard:** for each scenario at 1440×900 and 1200×720, assert
  `document.documentElement.scrollHeight <= innerHeight` and the same for the width.

---

## 13. Hand-off to Phase 2 (keep these seams clean)

- **Engine:** `RunEngine` stays the only contract. Phase 2 adds `IpcRunEngine` (renderer)
  backed by the real agent in an Electron utility process. Delete nothing from the mock;
  it becomes the demo/replay mode and the test fixture.
- **Site view:** mock site components are rendered through a `SiteSurface` interface
  (`render`, `getElementRect(ref)`, `snapshot(step)`). Phase 2 provides a
  `WebContentsViewSurface` with overlays injected into the page.
- **Shared types:** types live in `packages/schema` so main, preload and renderer share
  them.
- **Real dependencies:** voice, notifications, keychain and dialogs already go through the
  preload bridge, so Phase 2 can swap in real implementations.

---

## Appendix A — first prompts for Claude Code

1. "Read CLAUDE.md and docs/SPEC-phase1.md fully. Then plan M0 only. Show me the plan
   before writing code."
2. After each milestone: "Run typecheck, lint, test and test:e2e. Fix failures. Then
   summarize what you built against the M<n> acceptance checks and commit."
3. For visual work: "Open docs/design-reference/<Screen>.html and match its layout,
   spacing, colors and copy. List any differences you chose to keep in DECISIONS.md."

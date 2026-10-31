# Fitts — Phase 3 build spec: Fitts decides

Version 0.2 · Oct 31, 2026 · Draft for Allen's approval · Owner: Allen Zheng
Builds on `docs/SPEC-phase2.md` (the real agent, as built) and `docs/DECISIONS.md`. Where this
spec is silent, Phase 2's spec and decisions apply. Where they disagree, this spec wins.

**Nothing in this spec is built until Allen approves it.** v0.2 folds in Allen's answers to
v0.1's open questions (§7) and the end of the hard step cap (§1.5).

---

## 0. Goal and what changes

Phase 2 runs a fixed script: interview → crawl → probes → reviewers → theme-fit → fixes and a
redesign → done. It works, but it can't take a turn. A message sent mid-audit gets "Got it,
I'll keep that in mind" and changes nothing. A redesign the owner dislikes has no next round.
The pictures of directions are AI images that can't draw faithful UI.

Phase 3 changes three things, in this order:

1. **Fitts decides what to do next.** The script's stages become *abilities*. After the
   interview, a decision step on `muse-spark-1.3` picks the next ability from what it knows:
   the brief, coverage, findings so far, the owner's messages, the budget. The owner can steer
   at any time, and always has the final say.
2. **Style boards replace AI pictures.** A redesign direction is shown as a real HTML/CSS
   sheet of components in that direction: nav, buttons, a card, a form, the type scale, the
   colors, a hero. Pictures from the image model are used only for the icons, illustrations
   and art placed on the sheet. The owner gives feedback and gets a new round; the final
   design gets a review (what works, what doesn't) before Fitts applies it.
3. **The mirror gets tabs.** Links that leave the site, and links that open a new tab, open
   in the mirror in their own tab, with a strip across the top. Fitts never tests a page off
   the site.

What does **not** change: the 22-method `RunEngine` interface and the Phase 1 UI contracts
(§1.3 below lists the additions), the probes, the reviewer panel and aggregator, the fix
pipeline and PRs, the gate, the ledger, voice, persistence and replay.

**Phase 3 is done when:**

1. A run on `demo/chat` in Ask-when-unsure reaches the same findings and PRs as Phase 2, with
   Fitts choosing the order, and `pnpm bench:chat` stays at or above Phase 2's recall.
2. Mid-audit, "Fitts, skip the settings pages and look at checkout" changes what it does
   next, visibly, within one step.
3. On Allen's portfolio, a redesign goes through at least two rounds of boards from feedback,
   a final review, and one PR; the owner can send it back after the review.
4. A "Log in with Google" button and an outside link both open in a second tab of the mirror
   with the strip showing where you are; closing the tab returns to the site.
5. Every guarantee in §1.4 holds in a test that tries to break it.

---

## 1. The agent loop

### 1.1 Abilities

An ability is a function the loop can call. Each already exists in Phase 2 as a stage; the work
is to give each a uniform signature and let the loop call them in any order.

| Ability | What it does | From Phase 2 |
|---|---|---|
| `explore(route?)` | Crawl: one page at a time, every primary control, probes on each page | §6.1 crawl loop, §7 probes |
| `review(routes)` | The five-reviewer panel on pages explored since the last review | §8.1 |
| `check_theme()` | Theme-fit verdict on what's been seen | §8.3 |
| `propose_looks(feedback?)` | Three directions as style boards (§2) | the design library |
| `revise_looks(feedback)` | A new round of boards from the owner's feedback | new |
| `apply_look(id)` | The redesign as one fix job, then the final review (§2.4) | §8.3, §9 |
| `fix(findingIds)` | The fix pipeline, per mode | §9 |
| `phone_pass()` | The phone-width sweep | §6.1 |
| `check_links()` | Links and network, at the end | §7 |
| `ask(question, options)` | A blocking question card | `choose` |
| `say(text)` | A chat line | `say` |
| `finish()` | FINALIZE and Done | §6.1 |

Abilities keep their own state (coverage, pages, findings) in the orchestrator exactly as now.
What's new is the thing that calls them.

### 1.2 The decision step

Between abilities, one Spark call with tools (one per ability) picks the next. It sees:

- the brief, and every owner message so far (the last 10 in full, the rest as a summary)
- coverage: routes queued, testing, done, "same page"; controls tried and left
- findings so far: count by severity, the titles of the worst five
- what was done: the last 8 abilities and their outcomes
- the budget: spent, cap, and the cost of each ability so far
- the stall count (§1.5): steps in a row with no progress
- the mode (Plan only, Ask every action, Ask when unsure, Autonomous, Dangerous)
- whether the site is live (no code: no `fix`, no `apply_look`)

The prompt (`docs/prompts/decide.md`) says what a good audit looks like: explore before you
review, review a few pages at a time, check the theme once you've seen enough, don't propose
looks the owner didn't ask about unless the theme doesn't fit, fix when you have something
worth fixing, finish when coverage is complete or the owner says so. It's told these are habits,
not rules; the owner's messages come first.

**Cost.** A decision is one short call (reasoning minimal, ≤ 400 output tokens): about $0.002.
To keep a 200-step run from making 200 of them, `explore` runs until its page is done or 12
steps pass, whichever is first, before the loop decides again. A run on Allen's portfolio (30
pages) adds roughly 60 decisions, under $0.20.

**Fallback.** When the call fails or returns nothing usable, `ScriptedDecider` picks what the
Phase 2 script would have: the same order as today. The run never stalls on the decider.

### 1.3 Fitts talks

Fitts is conversational (Allen's answer to v0.1's first question). Whenever it notices
something or decides something, it says so in the chat, in a line or two, the way it would to
someone sitting beside it: "Three of these pages are the same template, so I'll test one and
move on." "Your checkout asks for a phone number but never says why." It doesn't wait for a
stage to end to say what it thinks.

Talking runs beside the work, not instead of it. A `converse` call on Spark answers every
owner message within a step or two, in Fitts's voice, with what it's doing right now as
context, while the ability underway carries on; the same message also reaches the next
decision (§1.4). So the owner can ask "what do you think of the nav?" during a crawl and get an
answer, and "skip the settings pages" and see it happen. The reply says when something will
change course ("Will do, after this page") and when it won't ("I'll keep that in mind for the
report").

Lines Fitts says on its own are cheap (no model call: they're the abilities' own copy) or come
from the decision step's `say`. The debug panel shows every decision in full; the chat shows
what matters to the owner.

### 1.4 The owner steers

Every message the owner sends during the audit goes into the next decision, whether it's typed,
spoken, or sent while pointing, as well as getting a reply (§1.3). Nothing is acknowledged
with a canned line anymore.

Pivots the loop must handle, with tests:

- **"Skip X" / "look at Y next"**: coverage marks X skipped ("you said to skip it"); Y moves to
  the front of the queue.
- **"Stop testing, just fix what you have"**: `review` on what's seen, then `fix`, then
  `finish`.
- **"I don't like the look" (any time)**: `check_theme` if not done, then `propose_looks`.
- **"That's not a problem"** while pointing at an element: the finding for that element (if
  any) is dismissed, and the reviewers are told so for the rest of the run.
- **"Try that again"**: the last ability runs again.
- **"Go on" / "I'm done"**: resumes, or `finish`.

`interruptNow` and the queue work as now: a queued message is delivered at the next decision;
interrupt ends the current ability early and decides.

`RunEngine` gains no methods. `sendMessage` opts gain nothing. The UI's `Now:` line shows the
ability in words ("Looking at /checkout", "Thinking about what's next").

### 1.5 No hard cap: progress, not steps

The 200-step cap is gone (built in round 4, before this spec; the ceiling is now 1000 and the
budget bounds a run long before it). A run ends when coverage is complete, when the owner says
so, or when Fitts is going in circles:

- A step that tries no new control, finds no new page and finishes no page is **no progress**.
- Eight no-progress steps in a row on one page: the page's untried controls are skipped
  ("going in circles") and Fitts moves on, and says so.
- Twenty-four in a row anywhere: the crawl ends, and Fitts says what was left.

In Phase 3 the decider sees the stall count and is asked to change course itself first (another
page, a different control, a different kind of input); the code's skip-and-move-on is the
backstop when it doesn't.

### 1.6 Guarantees that stay in code

The decider chooses *which* ability; it never gets to skip what an ability does inside.

| Guarantee | Where it's enforced |
|---|---|
| A fix is verified before its PR opens | `fix` (the pipeline, §9.2), unchanged |
| Destructive actions ask first; writes are held | the gate (§13), unchanged, inside `explore` |
| Every page and control is tried, or skipped with a reason, before `finish` | `finish` refuses while coverage is incomplete unless the owner said to stop; it says what's left |
| A run never ends unreviewed | `finish` refuses until the phone pass, the link check and the review have run (built in Q0) |
| A decider can't spin on a refusal | the decision after a refused one comes from `ScriptedDecider` (built in Q0) |
| The budget cap holds | `BudgetGuard` before every ability and every model call, unchanged |
| A run that goes in circles moves on, then ends (§1.5) | the loop, unchanged |
| Live sites are audit-only | `fix` and `apply_look` are not offered to the decider for a live origin |
| Plan only never clicks or types | `mayAct`, unchanged |
| The owner has the final say on a redesign | `apply_look` only runs after `pickDirection`, or in Autonomous after the final review passes (§2.4) |

A test for each: a fake decider that tries the wrong thing, and the code refusing it.

---

## 2. Style boards

### 2.1 What a board is

A board is one HTML file, built by code (not a model), from a direction's parts in
`packages/styles`: its color scheme (re-hued to the brand if the owner kept one), type pairing,
shape language, layout, decorations, motion and density. It shows, top to bottom:

1. **The name and a line** about the direction, in Fitts's words (from the compose call).
2. **Colors**: the palette as swatches with their roles (background, surface, text, muted,
   accent, accent text), each pair's contrast ratio.
3. **Type**: the heading and body faces at the scale (display, h1, h2, h3, body, small), real
   fonts from `main/fonts` (downloaded once, served from the board's folder).
4. **Components**, each labeled: nav bar · buttons (primary, secondary, quiet, disabled) · a
   text field with label, help and an error · a select · a checkbox and a switch · a card ·
   a table row · tags · a toast · a modal header.
5. **A hero**: a heading, a line and a button, with the direction's decoration (gradient
   mesh, grain, grid, a three.js part if the direction has one).
6. **Motion**: a hover and a page-in, as the motion part says; still under reduced motion.

The copy on the board is the owner's own (Allen's answer: yes): the site's name, its real h1,
a real button label and a real field label from the crawl's snapshots, so the owner sees their
site's words, not lorem ipsum. Nothing on the board is a page of the site: it shows what the parts would look
like, not what the redesigned pages would be.

### 2.2 Pictures on the board

The image model (SAM, through `media.edit`) makes only *assets*: an icon set in the direction's
stroke, one illustration for the hero if the direction's decoration calls for one, and a
pattern tile when the decoration is a pattern. Each asset is saved under the run's assets and
placed on the board by code. When the model fails, the board shows the component without it;
no board is ever withheld for a missing picture.

Assets are made once per direction and reused across rounds unless the direction's stroke or
hue changes.

### 2.3 Rounds

`propose_looks` posts a `directions` item with three boards. The item gains, per option, a
`board` asset (the HTML) and keeps `swatches`. The DirectionViewer shows the board in a
sandboxed iframe (`sandbox=""`, no scripts except the vendored three.js for 3D parts, no
network), scrollable, with the arrows and "Choose this one" as now, plus a message box:
"What would you change?".

Feedback, spoken or typed, in the viewer or in the chat, runs `revise_looks(feedback)`:

- The compose call gets the three boards' parts, the feedback, and the brief, and returns
  three new directions. It's told to keep what wasn't mentioned and change what was, and to
  say in each direction's `changes` what it changed and why.
- Boards are rebuilt. The new `directions` item says "Round 2" and what changed, in a line.
- There's no limit on rounds. The budget cap applies; a round is about $0.15 (one compose
  call, assets reused).

"None of these" is a button on the item: it asks "What's off about them?" and runs a round
from the answer.

### 2.4 The final review

`apply_look` runs the redesign (one fix job, as now) and verifies it (page probes and the
style check). Then, before the PR opens, it posts a `review` item: the redesigned pages as
before/after shots (the versions mechanism serves the branch, so the owner can use it), and
the question "What works, and what doesn't?". The owner's answer goes to one more fix job on
the same branch; "It's good" (or "Open the PR") opens the PR. "Start over" goes back to the
boards with the answer as feedback.

In Autonomous mode, Fitts reviews the redesign itself against the chosen board's parts and
the brief (the style check, extended with the parts' rules) and opens the PR when it passes
(Allen's answer: Autonomous may open the PR); the review item still posts, with "Send it
back" on it, which reopens the branch for one more job.

### 2.5 What goes away

Muse Image mockups of directions (§10 of Phase 2) and the `mockup` field on options. The
image model stays for SAM outlines on findings and for board assets. The three directions'
rules, the design library, fonts and the style check stay as they are.

---

## 3. Tabs in the mirror

### 3.1 Behavior

The site window becomes a set of tabs. Tab 1 is the site. A link that leaves the site's
origin, a `target="_blank"` link, or `window.open` opens tab 2 (3, 4…) in the mirror. Each tab
is its own offscreen `WebContents` in the project's session, streamed to the canvas when
selected. A strip across the top of the site view shows the tabs: favicon, title, a close
button, and "Your site" on the first.

A tab that isn't the site shows a bar under the strip: "You're on google.com, not your site.
Fitts doesn't test here." with "Back to your site". Closing the last off-site tab returns to
tab 1. Sign-in flows that redirect back to the site's origin in the same tab close that tab
and land on tab 1 (so "Log in with Google" works without the owner closing anything).

Fitts never acts in an off-site tab. The crawler, probes and reviewers only see tab 1.
The `links` probe keeps checking outside links by fetching them from main, as now, and never
opens them.

At most 6 tabs; the oldest off-site tab closes when a seventh opens, with a toast. **The
site's own tab is always open**: it has no close button, it can't be closed by the page
(`window.close` is ignored there), and it's never the one that makes room for a seventh.

### 3.2 The user drives, Fitts doesn't

Tabs only open from the owner's own clicks: during the interview, Take the wheel, the Done
preview, and the fix preview. While Fitts is acting, an off-site navigation it causes is
blocked as now (the feedback probe records that the page did respond), so the audit never
drifts off the site.

### 3.3 Surface

`SiteStatus` gains `tabs: { id; title; url; favicon?; site: boolean }[]` and `activeTab`.
`SiteBridge` gains `selectTab(id)`, `closeTab(id)`, `backToSite()`. Input, cursor, device
and the overlays apply to the selected tab; overlays only draw on tab 1. Rewind, before/after
and versions apply to tab 1 only.

---

## 4. Schema and interface changes

- `RunState.ability?: { name: string; since: number }`: what Fitts is doing, for `Now:` and
  the debug panel.
- `RunEvent` gains `ability.started` and `ability.finished { name, outcome }` (and the
  reducer sets the field). The event log stays replayable.
- `directions` options: `+ board?: string` (asset), `+ round: number` on the item,
  `- mockup`.
- New chat item `type: 'review'`: `{ changeId, pages: { route; before?; after }[], answer? }`.
- `RunEngine`: no new methods. `pickDirection` and `sendMessage` carry everything.
- `SiteStatus`, `SiteBridge`: §3.3.

---

## 5. Milestones

Each ends green (typecheck, lint, unit, e2e) and committed to main.

| # | Milestone | Acceptance |
|---|---|---|
| Q0 | Abilities: each Phase 2 stage callable on its own with a uniform signature; `ScriptedDecider` reproduces today's order | The run test suite passes unchanged on the scripted decider; `bench:chat` equal to Phase 2 |
| Q1 | The decision step: `SparkDecider`, prompt, `converse`, the owner's messages in the loop, the pivots in §1.4, the guarantees in §1.6 with their tests | On demo/chat with fixtures, "skip settings, look at checkout" changes the next step; each guarantee test passes; a run with a failing decider finishes on the fallback |
| Q2 | Boards: the builder in `packages/styles/board/`, fonts, assets from SAM, the viewer's iframe | Each of the 22 schemes × 3 pairings builds a board that passes the contrast probe; the viewer shows it; no network from the board |
| Q3 | Rounds and the final review: `revise_looks`, "None of these", the `review` item, "Send it back" | Two rounds on hartwell fixtures; the review posts before the PR; "Start over" returns to boards |
| Q4 | Tabs: the strip, off-site tabs, the bar, sign-in return, limits | e2e: a `_blank` link and an outside link open tabs; closing returns; the site's tab can't be closed; the crawler never leaves tab 1 |
| Q5 | Real runs on Allen's portfolio and openteamsheets.com; DECISIONS; the walkthrough | §0's definition of done, by hand, under the spend cap |

Order: Q0, Q1 first (the engine), then Q2, Q3 (boards), then Q4 (tabs). Q4 is independent
and can move earlier if the engine work stalls.

**Cut order if behind**, cut first at the top:
1. The three.js hero on boards (keep the CSS decorations)
2. Autonomous self-review of a redesign (keep the owner's review)
3. Tab limits and sign-in return (keep tabs and the bar)
4. Illustrations from SAM (keep icons)

---

## 6. Testing

- **Unit:** the decider's input builder (what it sees is exactly §1.2); the scripted fallback
  order; each pivot; `converse` replies while an ability runs; each guarantee against a
  hostile fake decider; the board builder's
  output (valid HTML, every component present, contrast); the tab model.
- **Integration (no network):** a recorded decider's tool calls drive a run on the fake site;
  rounds on recorded compose responses.
- **E2E:** interview → Fitts decides → findings → fix → done, on the test build; a pivot by
  typed message; boards in the viewer with a round; the review item; tabs.
- **Live smoke:** `pnpm smoke:live` gains a pivot and a round, $3 cap.
- **Benchmark:** `pnpm bench:chat` must not drop.

---

## 7. Allen's answers (Oct 31)

The v0.1 questions, answered:

1. **How chatty:** decently chatty and conversational. Whenever Fitts notices or thinks
   something, it says so, and it can talk about other things while it works (§1.3).
2. **Autonomous redesigns:** Fitts may open the PR itself (§2.4).
3. **Boards with the site's words:** yes (§2.1).
4. **Tabs:** at most 6, and the site's own tab is always open (§3.1).

And one more from Allen: no hard cutoff at 200 steps; detect going in circles instead (§1.5).

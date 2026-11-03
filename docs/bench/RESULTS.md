# Baseline comparison: results

The plan, arms and metrics are in `PLAN.md`, committed before any run. Each row is one run,
including the bad ones. Nothing is averaged or merged across runs. Recall is planted issues
matched (overall, then S1 structure-detectable and S2 judgment or visual). Precision is the share
of shown findings that match a planted issue, strict and at severity ≥ 2. Cost is the run's
ledger; wall time is the run's own.

## demo/chat (33 planted: 19 S1, 14 S2)

| Run id | Date (UTC) | Arm | Commit | Recall | S1 | S2 | Precision (strict) | Precision (sev ≥ 2) | Unplanted at sev ≥ 2 | Cost | Wall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| axe-1 | 2026-11-03 09:09 | (a) axe alone | 596f9b2 | 4/33 | 4/19 | 0/14 | 50% (4/8) | 50% (4/8) | 4 | $0 | 66 s |
| — | — | (b) Lighthouse | — | skipped: not installed, and PLAN.md allows no new install | | | | | | | |
| probes-1 | 2026-11-03 09:17 | (c) Fitts, probes only | 596f9b2 | 25/33 | 18/19 | 7/14 | 69% (25/36) | 93% | 2 | $0 | 399 s |
| econ-1 | 2026-11-03 09:30 | (d) Fitts Economy | 46ea654 | 28/33 | 19/19 | 9/14 | 68% (28/41) | 88% | 4 | $0.17 | 787 s |
| econ-2 | 2026-11-03 09:45 | (d) Fitts Economy | af7561f | 28/33 | 19/19 | 9/14 | 72% (28/39) | 88% | 4 | $0.15 | 845 s |
| qual-1 | 2026-11-03 10:11 | (e) Fitts Quality | 76aca50 | stopped | | | | | | $1.31 | 1500 s (limit) |
| open-1 | 2026-11-03 10:28 | (f) Fitts Open | 9d3e22d | 26/33 | 19/19 | 7/14 | 70% (26/37) | 87% | 4 | $1.56 | 1026 s |
| qual-2 | 2026-11-03 10:42 | (e) Fitts Quality | 90df544 | 28/33 | 19/19 | 9/14 | 68% (28/41) | 88% | 4 | $1.79 | 842 s |
| qual-3 | 2026-11-03 11:45 | (e) Fitts Quality | f5099c9 | 28/33 | 19/19 | 9/14 | 67% (28/42) | 85% | 5 | $1.84 | 980 s |
| open-2 | 2026-11-03 10:56 | (f) Fitts Open | deac895 | 27/33 | 19/19 | 8/14 | 71% (27/38) | 87% | 4 | $1.42 | 802 s |
| nojudge-1 | 2026-11-03 11:11 | (g) Economy, no judge | 2365e70 | 28/33 | 19/19 | 9/14 | 74% (28/38) | 90% | 3 | $0.09 | 939 s |
| nojudge-2 | 2026-11-03 11:28 | (g) Economy, no judge | bf796c1 | 28/33 | 19/19 | 9/14 | 70% (28/40) | 90% | 3 | $0.08 | 980 s |

## The held-out app (sealed answer key)

Blind runs, recorded before the key was revealed. Scored after the reveal, against the key whose
SHA-256 is in the app's README.

| Run id | Date (UTC) | Arm | Commit | Findings | Scored after reveal | Unplanted but real | Cost | Wall |
|---|---|---|---|---|---|---|---|---|
| heldout-fitts-1 | 2026-11-03 11:59 | Fitts Economy (blind) | 9729478 | 20 shown (sev 4: 6, 3: 8, 2: 1, 1: 5) + 4 suggestions, 16 pages | 6/16 (S1 4/8, S2 2/8); precision 30% (6/20), 33% at sev ≥ 2 (5/15); traps tripped 1/3 (T1, at sev 1) | 2 of the 14 unmatched (1 a side effect of P12); 3 unsure; 9 false | $1.55 | 12.1 min |
| heldout-axe-1 | 2026-11-03 12:01 | axe alone (blind) | 9729478 | 2 (sev 4: 1, 3: 1), on the 15 routes Fitts reached | 2/16 (S1 2/8, S2 0/8); precision 100% (2/2); traps tripped 0/3 | none unmatched | $0 | 123 s |

### Scoring the held-out runs (after the reveal, Nov 3)

The key (`heldout-key/PLANTED.md`, committed to the app's repo as `6d2fd7f`) hashes to
`61376c3a5dc6ec4dd8c6b097d35dac7231e425affbda8c8bb4d39f510ab33469`, the SHA-256 sealed in the
app's README before the runs. 16 planted problems (8 S1, 8 S2) and 3 traps.

Scored by hand, since `planted.ts` is demo/chat's key, with its rule: a finding matches when it
names the planted problem on its screen or element. Suggestions don't count either way.

| Planted | Stratum | Fitts Economy | axe alone |
|---|---|---|---|
| P01 search field has no label | S1 | missed | missed |
| P02 hint text at 1.9:1 | S1 | "Text is too faint to read" (1.9:1, /settings) | color contrast, /settings |
| P03 heart button has no name | S1 | "Icon buttons have no accessible name" (`fav-…`) | "Buttons must have discernible text", / |
| P04 no focus outline on buttons | S1 | "No visible focus when using the keyboard" (/rentals) | missed |
| P05 frame sizes are clickable divs | S1 | "Frame size cannot be selected" | missed |
| P06 22 px extras steppers | S1 | missed (its small-target finding is a /rentals control) | missed |
| P07 rider errors name no field | S1 | missed | missed |
| P08 "Cancel" means both things | S1 | missed | missed |
| P09 pay bar hides the terms on phones | S2 | missed | missed |
| P10 Save gives no sign it worked | S2 | "“Save changes” does nothing visible" (sev 1) | missed |
| P11 Pay has no loading state, books twice | S2 | missed | missed |
| P12 promo banner shifts the grid | S2 | "Page content jumps after loading" | missed |
| P13 hourly prices, daily-only booking | S2 | missed | missed |
| P14 "Free cancellation" vs a 50% fee | S2 | missed | missed |
| P15 kids' bike, adult height minimum | S2 | missed | missed |
| P16 confirmation is a dead end | S2 | missed (the run never paid, so it never saw it) | missed |
| T1 skip link off-screen until focus | trap | **tripped**: "“Skip to main content” does nothing visible" (sev 1) | clear |
| T2 decorative card images, `alt=""` | trap | clear | clear |
| T3 delete account needs DELETE typed | trap | clear | clear |

What it says: on an app nobody tuned Fitts for, it found 6 of 16 against axe's 2, the same
probes-first pattern as demo/chat, but it missed most of the judgment issues. The ones about the
app's purpose (P13–P16) and the checkout's last step (P09, P11) were never reached or never
judged: the crawl didn't complete a booking. Precision was low. 14 shown findings match nothing
planted, including four at sev 4 on things the key says work as intended ("Keyboard focus gets stuck" on
Settings, "A link goes to the wrong page", "Rent button opens wrong bike", "Renting has no total
or confirmation"). They're kept as they came out in `docs/bench/heldout/`.

### The 14 unmatched findings, checked against the running app (Nov 3)

Each one reproduced in a browser against `npm run dev` (desktop 1280×800 and phone 390×844, a
fresh profile, plus a saved bike where the finding needs one). The strict precision above (6/20)
is the pre-registered number and stays as it is; this column only says which of the rest are real.

| Fitts's finding (sev) | Verdict | What the app does |
|---|---|---|
| Rent button opens wrong bike (4) | false | Rent asks for a frame size; with one picked it opens `/book/dates` for Harbor Cruiser. |
| Renting has no total or confirmation (4) | false | Rent starts a three-step checkout; its summary has a Total line and nothing is charged before Review & pay. |
| Keyboard focus gets stuck (4), /settings | false | Tab moves from Name through every field, Save, Delete and on to the header. |
| A link goes to the wrong page (4), /settings | false | "Email me a reminder…" is a checkbox label; clicking it toggles the box. The form has no links. |
| No back or cancel in this flow (3), /rentals | false | /rentals is a list page, not a flow, with the full header nav. |
| “Type” does nothing visible (1) | false | Type filters the grid (Kids → 1 bike) and the count line updates. |
| “Sort by” does nothing visible (1) | false | Sort reorders the grid. |
| Main action is hard to reach (1) | false | 4.3 bits is an ordinary reach, not a problem a person would notice. |
| “Skip to main content” does nothing visible (1) | false (trap T1) | The skip link shows on focus and moves focus to `main`. |
| Going back loses what you typed (3) | **real** | Pick Type: Electric, open a bike, press Back: the filter is "All" again and all 8 bikes show. Unplanted; sev 2 would fit better than 3. |
| The focused control is hidden (2) | **real, from P12** | At 1280×800 a focused heart button at the bottom of the view is pushed below it when the promo banner lands. The planted layout shift (P12), seen through the keyboard. |
| Too many text sizes (3) | unsure | Measured right: 7 sizes on /. Whether 7 is too many is a style call. |
| Spacing is inconsistent and off-grid (3) | unsure | Measured right: the heart button's padding is 1px 6px. Nothing a person would notice. |
| Tap target is too small (3), /rentals | unsure | Measured right: a saved bike's name link is 114×21. A link alone in a list likely passes WCAG 2.5.8 on spacing. |

All four sev-4 false alarms are Fitts's errors. Two look like the crawl crediting a control with
something it didn't do (a Rent tap "opening a different bike", a checkbox "going" to a link from
another page); one is the keyboard sweep reporting focus stuck where Tab moves on; one is a
reviewer judging the Rent button without following it into checkout.

### After the held-out run: the crawl fixes, validated elsewhere

The held-out run never completed a booking (its date and time fields were typed into, and the
booking journey was dropped because it ends in a payment; DECISIONS, Nov 3). The fixes were
validated on Basil & Ember and demo/chat only. The held-out app was not rerun, so the blind row
above stays the result.

| Run id | Date (UTC) | App | Commit | What it checked | Result | Cost |
|---|---|---|---|---|---|---|
| be-val-1 | 2026-11-03 17:00 | Basil & Ember web | 5858790 | journeys with dates, selects and a checkout | Reserve a table done (date, time and party picked); Order pizza stopped at "View cart & checkout" (fixed in cdde420); bench wait reached | $0.62 |
| be-val-2 | 2026-11-03 18:26 | Basil & Ember web | cdde420 | the same, after the checkout fix | Order pizza went through the cart and pickup details to /confirmation, then ran out of actions (15) before calling its goal met; 3 of 5 journeys done; paused at the bench's $2 cap. The pickup times on offer weren't checked (the reviewers never saw the options; fixed next) | $2.26 |
| chat-val-1 | 2026-11-03 18:43 | demo/chat | cdde420 + PAYS | no regression on the scored app | 28/33 (S1 19/19, S2 9/14), 90% at sev ≥ 2, 3 unplanted | $0.16 |
| be-val-3 | 2026-11-03 19:27 | Basil & Ember web | 7725020 | the pickup times on offer, with the options and the site's hours given to the reviewers (real clock, $4 cap) | **"Pickup times offered when shop is closed"** (sev 4, /checkout): "offers early-afternoon times like 1:45–3:30 PM even though the site says it opens at 4pm Tue–Thu". Also a suggestion that "All day" contradicts the posted hours. 21 shown, 9 suggestions, 25 pages | $2.19 |
| be-val-4 | 2026-11-03 22:37 | Basil & Ember web | 9bc33da | the two false /reserve sev-4s fixed at the cause (date-input Tabs; a stale ref → href) | **"Keyboard focus gets stuck" gone**, and /reserve has no wrong-page finding. Still shown: "A link goes to the wrong page" (sev 4), Home's "Hours & directions" "went to" the page it was on (a missed click; fixed next). No pickup-time finding: the run was 5:37–6:05 PM ET, when every slot (now + 30 min, for two hours) falls inside the posted 4–10 PM, so there was nothing to find. 21 shown, 8 suggestions, 25 pages | $1.91 |

## Basil & Ember web (no answer key)

Qualitative: what each arm found.

### Notes on the demo/chat runs

- **axe-1.** The harness opened pages without a browser context, which `@axe-core/playwright`
  refuses; fixed (a context per viewport) before the only scored run. Same matcher as Fitts:
  "Buttons must have discernible text" on `#thread-call` counts as unplanted because planted #17 is
  the icon buttons on the conversation header, and the matcher wants that element.
- **probes-1.** Missed #6, #15, #16, #18, #21, #22, #25 and #33: the ones that need reading the
  page's meaning (jargon, grouping, a missing empty state, dates) or a fault the crawl didn't
  inject. Its two unplanted sev ≥ 2 findings are the 200% text and text-spacing checks.
- **econ-1.** Missed #6, #14, #15, #18, #25. Unplanted at sev ≥ 2: the 200% text and text-spacing
  checks, "Search dumps dozens of identical results" (the 20,000-item list, matched to no planted
  wording), and the Rate-us pop-up finding that the matcher didn't join to #29.
- **econ-2.** Missed #6, #14, #15, #16, #18 (it found #25 this time, and lost #16). Unplanted:
  the 200% text and spacing checks, the Rate-us pop-up, and "Tapping a contact does nothing" on
  Grandma's row (sev 4).
- **qual-1, stopped.** Hit the bench's 25-minute wait while still reviewing /search and /settings.
  Fitts paused three times on "I can't reach Meta's models" (the Wonder calls failing), so the
  run never reached its findings proposal. Not scored; $1.31 spent.
- **open-1.** Missed #6, #14, #15, #18, #21, #22, #25. Unplanted: the 200% text and spacing
  checks, the Rate-us pop-up, and "Privacy page shows no settings" (sev 4).
- **qual-2.** Missed #6, #14, #15, #18, #25, the same five as econ-1. Unplanted: the 200% text and
  spacing checks, the Rate-us pop-up, and "Same contact tap leads different places" (sev 3).
- **open-2.** Missed #6, #14, #15, #18, #21, #25 (found #22, the jargon, this time). Unplanted:
  the same four as open-1.
- **nojudge-1.** Missed #6, #14, #15, #18, #25. Without the Wonder judge there's no Rate-us pop-up
  finding (the judge's), so one fewer unplanted; recall is the same as Economy with the judge.
- **nojudge-2.** The same misses and unplanted findings as nojudge-1.
- **qual-3.** Missed #6, #14, #15, #18, #25. Unplanted: the 200% text and spacing checks, the
  Rate-us pop-up, "Tapping contacts does nothing" and "Empty conversation shows blank page".

### Summary (demo/chat)

axe alone: 4/33 (S1 4/19, S2 0/14) · Fitts probes only: 25/33 (S1 18/19, S2 7/14), free ·
Fitts Economy: 28/33 both runs (S1 19/19, S2 9/14), $0.15–0.17 · Quality: 28/33 both scored runs,
$1.79–1.84 (one more run stopped on unreachable models) · Open: 26–27/33, $1.42–1.56 · Economy
without the judge: 28/33 both runs, $0.08–0.09. Paid baseline spend: $8.41 of the $25 budget.

What it says: Fitts's deterministic probes carry the structural issues (S1) almost alone; the
models add the judgment and visual ones (S2: 7 → 9 of 14). On this app the bigger models and the
judge didn't add recall over Economy, and the judge cost one extra unplanted finding (the Rate-us
pop-up, which the matcher doesn't join to #29). Five planted issues no arm found: #6, #14, #15,
#18 and #25 (Economy found #25 once).

### Notes on the held-out runs

- Both runs were made with the key sealed: `heldout-key/` was never opened, listed or searched.
  The findings are committed as they came out (`docs/bench/heldout/fitts-economy-1.json`,
  `axe-1.json`), so their commit predates the reveal, and will be scored against the key, after its SHA-256 is checked, once it's
  revealed.
- **heldout-fitts-1.** The brief, answered as an owner would and with nothing from the key: "It's a
  bike rental shop. People should be able to find a bike and book it quickly, on a phone or a
  laptop." / "Mostly commuters and tourists, a lot of them on their phones." / "Booking a bike
  should take a couple of minutes, start to finish." The first try stopped at the interview
  (it asked a follow-up the bench didn't answer); the bench now answers follow-ups. That try spent
  nothing.
- **heldout-axe-1.** The routes Fitts reached, without the `/*` pattern from the App Model.

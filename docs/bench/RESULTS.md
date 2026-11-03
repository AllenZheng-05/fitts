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

| Run id | Date (UTC) | Arm | Commit | Findings | Scored after reveal | Cost | Wall |
|---|---|---|---|---|---|---|---|
| heldout-fitts-1 | 2026-11-03 11:59 | Fitts Economy (blind) | 9729478 | 20 shown (sev 4: 6, 3: 8, 2: 1, 1: 5) + 4 suggestions, 16 pages | pending the key | $1.55 | 12.1 min |
| heldout-axe-1 | 2026-11-03 12:01 | axe alone (blind) | 9729478 | 2 (sev 4: 1, 3: 1), on the 15 routes Fitts reached | pending the key | $0 | 123 s |

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

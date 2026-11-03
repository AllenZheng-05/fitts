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

## The held-out app (sealed answer key)

Blind runs, recorded before the key was revealed. Scored after the reveal, against the key whose
SHA-256 is in the app's README.

| Run id | Date (UTC) | Arm | Commit | Findings | Scored after reveal | Cost | Wall |
|---|---|---|---|---|---|---|---|

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

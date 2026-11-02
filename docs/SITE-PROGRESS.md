# Site progress

Working log for the fitts.allenzheng.com redesign (docs/SPEC-site.md), on branch
`site-redesign`. Judgment calls are in docs/SITE-DECISIONS.md.

## Steps

| #   | Step                                                          | Status |
| --- | ------------------------------------------------------------- | ------ |
| 0   | Save the spec                                                 | done   |
| 1   | Home, Download, the field, still image, shell, 404, claims    | done   |
| 2   | What Fitts checks, from the code, drift test, How well it works | done |
| 3   | How it works                                                  | todo   |
| 4   | Showcase scaffold and the media manifest                      | todo   |
| 5   | Checks, e2e, and the Fitts audit                              | todo   |

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

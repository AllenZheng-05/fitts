# Fitts on Bootstrap's examples

One paid Fitts run on an open-source site nobody here wrote, with every finding checked by hand.

| | |
| --- | --- |
| App | [Bootstrap](https://github.com/twbs/bootstrap)'s docs site, starting at its Examples page (MIT) |
| Commit | upstream tag `v5.3.8`, `25aa8cc0b32f0d1a54be575347e6d84b70b1acd7`, plus one local commit adding `"fitts": {"startPath": "/docs/5.3/examples/"}` to package.json so Fitts starts on the examples, not the docs home |
| Fitts | apps/desktop at `284dfed` (Phase 4 U9), Economy profile, **audit only** (stops at the fix approval card) |
| Run | Nov 3, 2026, 17:03–17:24 UTC, 11 model calls, 1,000 crawl actions |
| Cost | **$1.39** ($3.00 cap) |
| Shown | 30 findings, 0 suggestions |
| Verdicts | **9 confirmed, 15 false positives, 6 unsure** |
| Fixes | none (audit only; see "Why audit only") |

Brief given to Fitts: "Bootstrap's examples: starter pages (sign-in, checkout, pricing,
dashboard and more) that developers copy to start their own sites. They should be clear,
accessible and work well on phones and from the keyboard."

## How it was run

- The clone's `origin` is a local bare repo; nothing can be pushed upstream. Nothing was filed.
- `npm ci`; Fitts ran the project's dev command (Astro on port 9001).
- Harness: a local copy of `tests/bench/audit.bench.ts`, not committed.
- Hand checks: headless Edge through Playwright against `npm run astro-dev`, with axe (page
  plain, with the Astro dev toolbar removed, and with the search dialog open), computed styles
  and boxes at 1440, 1280, 992 and 991 px, the tab order with time for smooth scrolling, element
  positions over time, the dark theme, blocked images, and the requests made while searching.
  Upstream issues searched with the GitHub API.

**Why audit only.** On TodoMVC (same day) every fix failed to verify because Fitts can't move a
non-Vite dev server to another port; Astro's script here has `--port 9001` written in, so the
fix branch's server would fail the same way and spend the cap on retries. See
[oss-todomvc-react.md](oss-todomvc-react.md), "The fix".

## The crawl went in a loop

Fitts listed 59 pages (the links it found) but used almost none of them. Of its 1,000 actions,
**991 were clicks on "Skip to main content"** on the Examples page. The other nine: the search
button, typing in search, the version menu, the theme toggle, three links that open in a new
tab (Webpack, its StackBlitz link, "Please open an issue."), "Cheatsheet RTL", and "Masonry", the
only click that reached an example. So every finding but one is about the Examples index and the
docs chrome around it (navbar, search dialog, footer), not about the examples themselves:
checkout, sign-in, pricing and dashboard were never opened.

The skip link moves focus without changing the URL or the screen much, so the crawler kept
treating it as untried. It stopped at its 1,000-step limit, after 21 minutes, on $1.39.

## Findings and verdicts

All routes are `/docs/5.3/examples` unless noted. "Docs chrome" means the docs site's navbar,
search or footer, not an example.

| # | Sev | Finding (as Fitts titled it) | Verdict |
| --- | --- | --- | --- |
| f1 | 3 | Tap target is too small | False positive |
| f2 | 2 | Too many font families | False positive |
| f3 | 2 | Heading levels should only increase by one | **Confirmed** (best practice) |
| f4 | 3 | Elements must have their visible text as part of their accessible name | **Confirmed** (third-party search) |
| f5 | 2 | Document should not have more than one banner landmark | **Confirmed** (best practice) |
| f6 | 2 | Landmarks should have a unique role or … accessible name combination | **Confirmed** (best practice) |
| f7 | 3 | Links must be distinguishable without relying on color | **Confirmed** |
| f8 | 1 | Text gets cut off on small screens | False positive |
| f9 | 4 | Keyboard focus gets stuck | False positive (dev only) |
| f10 | 3 | The focused control is hidden | False positive |
| f11 | 4 | A control moves just as you reach for it | False positive |
| f12 | 3 | A link goes to the wrong page | False positive |
| f13 | 2 | Document should not have more than one contentinfo landmark | **Confirmed** (search dialog open) |
| f14 | 3 | Interactive controls must not be nested | **Confirmed** (third-party search) |
| f15 | 3 | All touch targets must be 24px large, or leave sufficient space | Unsure |
| f16 | 4 | ARIA attributes must conform to valid values | Unsure |
| f17 | 2 | No back or cancel in this flow (`/masonry`) | False positive |
| f18 | 1 | "Skip to main content" does nothing visible | False positive |
| f19 | 2 | Tap target is too small on a phone | Unsure |
| f20 | 1 | Text gets cut off … Just under the breakpoint · 991×1288 | False positive |
| f21 | 1 | Text gets cut off … At the breakpoint · 992×1290 | False positive |
| f22 | 2 | Tap target is too small on Laptop · 1280×800 | False positive |
| f23 | 2 | Tap target is too small on Text at 200% · 1280 wide | Unsure |
| f24 | 2 | Text breaks with wider spacing on Text spacing · 1280 wide | Unsure |
| f25 | 2 | Tap target is too small on Text spacing · 1280 wide | Unsure |
| f26 | 2 | Text is too faint to read on Dark · 1280×800 | **Confirmed** (known, fixed in v6) |
| f27 | 3 | Search sends a request on every keystroke | False positive |
| f28 | 2 | No sign the page is loading (`/examples/`) | False positive |
| f29 | 3 | The page breaks when a request fails (`/examples/`) | False positive |
| f30 | 3 | The page jumps while you use it (`/masonry`) | **Confirmed** |

### Confirmed

- **f3.** axe `heading-order` (best practice): the footer's `<h5>Links</h5>` skips levels.
- **f4.** axe `label-content-name-mismatch` (tagged WCAG 2.5.3): the search button shows
  "Search" and the keys "Ctrl K", and its name is "Search (Ctrl+K)". The name does start with the
  visible word, so the harm is small. The button is Algolia's DocSearch, not Bootstrap's code.
- **f5, f6.** axe `landmark-no-duplicate-banner` and `landmark-unique` (best practice) on the
  docs navbar `<header>`.
- **f7.** axe `link-in-text-block` (WCAG 1.4.1): in the footer, "Bootstrap team", "our
  contributors", "MIT" and "CC BY 3.0" differ from the text around them only by color, at 2.22:1
  (3:1 is needed without an underline). Docs chrome.
- **f13.** With the search dialog open, DocSearch's own footer makes a second `contentinfo`
  landmark next to the docs footer (best practice).
- **f14.** axe `nested-interactive` (tagged WCAG 4.1.2) on `.DocSearch-Container` with the
  dialog open: the dialog's container has focusable children. Third-party.
- **f26.** In the dark theme, "Download source code" (`.btn-outline-secondary`) and each "Edit
  in StackBlitz" (`.link-secondary`) are #6c757d on #212529: 3.28:1. Reported upstream as
  twbs/bootstrap#39484, closed in March 2026: "Improved in v6 where we're doing `light-dark()`
  functions on theme colors." Still true in v5.3.8.
- **f30.** The Masonry example shifts its cards after load (layout-shift score 0.123 at
  0.22 s, over the 0.1 guideline): the Masonry library positions the cards once it runs. Fitts
  timed it after its own tap; it happens on load either way.

### False positives

- **f1, f22.** "Edit in StackBlitz" (121×21 px) and the Carbon ads link: smaller than 24 px
  tall, but WCAG 2.5.8 also passes a target with enough space around it, and axe's
  `target-size` rule passes them at 1440 px. f22 repeats f1 at 1280 px.
- **f2.** Titled "Too many font families", but the page uses two (system-ui and a mono stack).
  The evidence is seven font sizes, which is ordinary on a long page with display headings.
- **f8, f20, f21.** "Text cut off" on the navbar's version button. Measured at 1280, 992 and
  991 px: `scrollWidth` equals `clientWidth` and the text is visible. The button holds a visually
  hidden "(switch to other versions)", which is clipped on purpose; that's most likely what the
  probe measured.
- **f9.** Focus "stuck" on `astro-dev-toolbar`: Astro's toolbar exists only in development.
- **f10.** "Headers", "Heroes" and "Footers" were 0–40% visible when focused. The page has
  `scroll-behavior: smooth`, so the browser was still scrolling. Waiting 0.7 s after each Tab,
  every example link was fully in view.
- **f11.** Controls "moved just before the tap": their positions are the same at load and 3 s
  later. What moved them was Fitts's own scrolling (the skip link, smooth scrolling to each
  target).
- **f12.** "A link goes to the wrong page": "CDN starter" and "Edit in StackBlitz" open GitHub
  and StackBlitz in a new tab (`target="_blank"`), so the page Fitts was on stayed put. The
  "Headers" line says its link "says /docs/5.3/examples/cheatsheet-rtl", which is a stale element
  reference in Fitts, not the page's link.
- **f17.** "No back or cancel in this flow" on Masonry, "going back lost what I typed": it's a
  static demo page with no form, and nothing was typed.
- **f18.** The skip link scrolls to `#content` (401 px) and the next Tab lands in the main
  content, as it should. Checked at 0.1 s, the smooth scroll had barely started.
- **f27.** "40 requests for 8 characters typed": the 40 were the Examples page's thumbnail
  images loading. Search itself sent 8 requests to Algolia for 8 characters, which is how
  DocSearch's instant results work.
- **f28.** No loading indicator while a thumbnail image takes 3 s: the page is usable and the
  image's space is already reserved. A spinner for each thumbnail would be worse.
- **f29.** "Crashes (an uncaught error) when … .png fails": with every example image blocked,
  the page throws no error and still works.

### Unsure

- **f15, f16.** Seen at step 3, with the search dialog open after typing. With the dialog open
  but nothing typed, axe didn't report `target-size` (f15, DocSearch's logo link) or
  `aria-valid-attr-value` (f16, `#docsearch-input`, likely an `aria-activedescendant` while
  results load). Not reproduced; third-party either way.
- **f19, f23, f25.** Tap targets at 320 px, 200% text and wider text spacing: likely the same
  links as f1, but not measured in those cells.
- **f24.** "Text clipped with wider spacing" on the same version button as f8; not measured with
  the spacing applied.

## What Fitts missed

- **The examples themselves.** Of the 40 example pages (with the RTL versions), only Masonry was
  opened, so their
  forms (checkout's validation, sign-in, the floating labels), their navbars and offcanvas menus,
  and the dashboard went unchecked. That was the brief.
- **Dark mode beyond the index.** Only the Examples page was checked in the dark theme.
- **Fitts listed 59 pages**, which reads as coverage. All but the Examples page are still
  "queued" in its final route list; it visited 2.

## For the app (follow-ups, not changed on this branch)

1. Never pick the same control again when the last click on it changed nothing; count a
   same-page anchor link as tried. Stop well before 1,000 identical actions.
2. Leave out dev-only overlays (`astro-dev-toolbar`, Vite's and Next's error overlays) from
   focus and axe checks.
3. Wait for smooth scrolling to end before measuring focus visibility, skip links and "moved
   before the tap".
4. Treat `target="_blank"` links as leaving the page, not as going to the wrong one.
5. Count requests by what caused them: a search box's requests, not every image on the page.
6. Don't report a crash without the error.
7. Use WCAG 2.5.8's spacing exception (axe's `target-size` already does) and fold one element's
   tap-target finding across cells.
8. Report the pages actually visited, not the links found.
9. Pass a port to non-Vite dev servers (same follow-up as TodoMVC).

## Issue drafts

None for Bootstrap. The confirmed problems are best-practice landmarks and headings, the
third-party DocSearch widget (Algolia's, not Bootstrap's), docs-site chrome, or already known
and fixed in v6 (f26, twbs/bootstrap#39484). Bootstrap's AGENTS.md asks for problems checked
against the latest `main` (v6), and nothing here was. The footer links (f7) are the nearest
candidate, but they're docs chrome that v6 redesigns; I'd check v6's docs first.

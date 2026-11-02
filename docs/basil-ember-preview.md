# basil-ember: offline probe preview

Nov 2, 2026. This crawl used Fitts's deterministic probes only, with no model calls and no network
beyond the local dev server (`localhost:5176`). It ran at two sizes:

- desktop: 1280×800
- phone: 390×844, with touch emulated

Each of the 9 routes was loaded directly at both sizes: `/`, `/menu`, `/menu/margherita`, `/cart`,
`/checkout`, `/confirmation`, `/reserve`, `/about` and `/no-such-page`. Three more states were
captured at each size along the in-app path: the cart with a pizza in it, checkout with a pizza in
it, and checkout after submitting the form empty. That makes 24 page states.

The probes were contrast, target size, button and link names, placeholder leaks, font inventory,
spacing, axe (WCAG 2.0–2.2 A/AA plus best practice), overflow, a real Tab focus sweep, keyboard
facts, page facts and the surprise detector. Nothing in the app was changed.

## What the probes found

| # | Problem | Page(s) | Element (source) | Measurement | Sizes |
|---|---|---|---|---|---|
| 1 | The brand link's accessible name doesn't contain its visible text (axe `label-content-name-mismatch`, serious, WCAG 2.5.3) | every page | `header a.brand` ([Layout.tsx:21](../demo/basil-ember/src/components/Layout.tsx#L21)) | It shows "Basil & Ember / Wood-fired pizza" but announces "Basil and Ember home". A voice-control user saying "click Basil & Ember" may miss it. | both |
| 2 | Menu cards announce a different name than they show (same axe rule, serious) | `/`, `/menu`, `/no-such-page` | `a.card` ([MenuCard.tsx:7](../demo/basil-ember/src/components/MenuCard.tsx#L7)) | The visible text is the pizza name, description and price; the accessible name is only "View {name}" | both |
| 3 | The Remove button is a small tap target (WCAG 2.5.8) | `/cart` (with items) | the Remove button in each cart line ([CartPage.tsx:44](../demo/basil-ember/src/pages/CartPage.tsx#L44)) | 66×20px, under 24px tall: no padding, inline styles. It also deletes the line with no confirmation and no undo (seen in the code, not measured). | both |
| 4 | The "Add more from the menu" link is a thin tap target | `/cart`, `/checkout` | the link in the summary panel ([CartPage.tsx:59](../demo/basil-ember/src/pages/CartPage.tsx#L59)) | 388×18px on desktop, 288×18px on phone, under 24px tall | both |
| 5 | The date field shows no focus | `/reserve` | `input#rv-date` ([ReservePage.tsx:60](../demo/basil-ember/src/pages/ReservePage.tsx#L60)) | No visible change when focused with Tab. It's the only control on any page that failed the sweep; everything else shows the ember outline. | both |
| 6 | Unknown URLs show the home page (soft 404) | `/no-such-page` (any unknown path) | `<Route path="*" element={<Home />}>` ([App.tsx:24](../demo/basil-ember/src/App.tsx#L24)) | The path stays `/no-such-page` and the full home page renders, with no "not found" message | both |
| 7 | Heading levels skip (axe `heading-order`, moderate, best practice) | `/menu`; `/menu/margherita`; every page except `/` | card `h3` under no `h2` ([MenuCard.tsx:12](../demo/basil-ember/src/components/MenuCard.tsx#L12)); item page `h3` ([ItemPage.tsx:51](../demo/basil-ember/src/pages/ItemPage.tsx#L51)); footer `h4` ([Layout.tsx:39](../demo/basil-ember/src/components/Layout.tsx#L39)) | The heading level jumps by more than one | both |
| 8 | Section kicker text sits at the contrast line | `/` | `.sec-head span.kicker` ([index.css:80](../demo/basil-ember/src/index.css#L80)) | Measured 4.5:1 (12.5px bold, `#bc4622` on cream `#f5efe4`, about 4.55:1 by hand). Borderline: the review may drop it. | both |
| 9 | 16 font sizes across the site | every page | site-wide | 22, 12, 14.5, 14, 12.5, 76, 18, 15, 13, 17, 13.5, 44, 16, 20, 19 and 42px, in 2 families (Fraunces, DM Sans). Many half-pixel steps; a look-and-feel note. | both |
| 10 | Off-scale spacing values | every page | footer links (3px), cards (5px), section heads (6px), summary rows (7px), cart button (9px), hero `h1` (14px and 18px) | Values off a 4/8px scale; a look-and-feel note | both |

## What the probes didn't find

- **No horizontal overflow** at 390px on any page.
- **No console errors** on any page.
- **No unnamed buttons or links.**
- **No placeholder-only fields.**
- **No real surprises.** The detector logged three things, and none of them is a finding:
  - a 1px shift of the nav as the fonts load on `/`
  - layout changes right after the crawler's own route change
  - the checkout form growing when its errors appear after the submit click (expected, and right
    after input)
- **No skip link on any page**, which is a minor keyboard note (6 nav links before the content).
- **The empty checkout submit shows clear inline messages**, for example "Please add the name for
  the order." and "Please add a phone number we can reach at pickup." They aren't tied to their
  fields (no `aria-describedby` or `aria-invalid` anywhere in `src/`). No probe in this set
  measures that; Fitts's reviewers would have to raise it.

## Seen in the page text, not by a probe

Checkout's pickup times come from the clock, with no opening hours
([CheckoutPage.tsx:10](../demo/basil-ember/src/pages/CheckoutPage.tsx#L10)). At 2 AM this crawl was
offered 2:45 AM through 4:30 AM pickups. That is a real, very visible bug, but it's a reviewer (model)
finding, not a measurement.

## Verdict for the demo video

The probes alone give about **6 real, visible problems**: #1–#6. Of those, #3–#6 can be shown on
screen:

- tiny Remove button that deletes with no confirmation
- thin link
- date field with no focus ring
- the soft 404

#1 and #2 are real but invisible unless narrated as a screen-reader or voice-control problem. #7–#10
are polish notes.

The app is clean otherwise: it scales well to the phone and has no overflow, broken flows or
errors. So the strongest on-camera moments will come from the reviewers rather than the probes:

- 2 AM pickup slots
- Remove with no undo
- errors not tied to their fields

To be sure of a punchy video, add one or two problems people feel right away, such as a slow add
to cart with no loading state, or a phone layout break. That would change this app, so it's left
to you.

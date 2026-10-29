# demo/hartwell — what's wrong, and what a good redesign looks like

A family funeral home whose site reads as a party: pink background, confetti dots, a rounded
"bouncy" font, "Party packages" and a tilted, wiggling yellow "Book now" pill. Every theme
value lives in `src/theme.css`, so a redesign is a focused diff.

## Planted problems

| #   | Problem                                                                       | Where                                    | Detected by                        |
| --- | ----------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------- |
| T1  | The look doesn't fit the purpose (families who just lost someone)             | `src/theme.css`, confetti spans, wording | theme-fit critique · look-and-feel |
| T2  | Celebratory wording ("Party packages", "Celebrate life with us", "Hit us up") | `src/App.tsx`                            | content lens · H2                  |
| T3  | Footer text #F7A8CC on #FFF1F7 (about 1.6:1)                                  | `.footer` (`--muted`)                    | contrast probe                     |
| T4  | The contact form's submit button says only "Go"                               | `contact-submit`                         | label review · H4/H2               |

## Expected theme-fit directions (a target, not code)

- **Quiet & dignified:** navy #1F2A44 and stone #F4F1EC, Fraunces headings, 6px radius.
- **Warm & personal:** brown #5B4636 and caramel #E8D2B8, Georgia, 14px radius.
- **Classic & formal:** black #111 and grey #E5E5E5, Times, square corners.

In every direction, confetti and the CTA's tilt and wiggle are removed (`--confetti-display:
none`, `--cta-tilt: 0deg`, `--cta-motion: none`). Wording changes only where it conflicts with
the brief ("Party packages" → "Service options", "Book now" → "Arrange a service").

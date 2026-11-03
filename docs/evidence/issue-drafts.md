# Issue drafts for Allen

At most two, for confirmed, worthwhile findings only. **Nothing here has been filed.** Allen
decides whether to file each one, and files it himself. Each says it was found with an AI tool.

## 1. TodoMVC: the new-todo placeholder is 2.8:1 contrast

**Where to file:** [tastejs/todomvc](https://github.com/tastejs/todomvc/issues). The CSS rule is
in [tastejs/todomvc-app-css](https://github.com/tastejs/todomvc-app-css), but that repo is quiet
(last push Oct 2023, 2 open issues from 2015 and 2017), and the main repo's `contributing.md`
invites issues and bug fixes. The issue links the CSS repo.

**Checked before filing:** tastejs/todomvc-app-css#30 ("Insufficient contrast ratios in the ui",
closed Oct 2019) covered the text in general. The placeholder rule is still
`rgba(0, 0, 0, 0.4)` in 2.4.3, which current examples (react) install. No open issue mentions
the placeholder. Allen: search once more on the day, in case one has been opened since Nov 3.

**Title:** New-todo placeholder text has 2.8:1 contrast (WCAG 1.4.3 needs 4.5:1)

**Body:**

> The placeholder "What needs to be done?" in the new-todo input is hard to read. Its color is
> `rgba(0, 0, 0, 0.4)` on a white input, which is about #999 on #fff: a contrast ratio of 2.8:1.
> WCAG 2.2 success criterion 1.4.3 asks for 4.5:1 for text at this size (24px, normal weight).
>
> The rule is in `todomvc-app-css` 2.4.3, `index.css`, lines 50–65 (the three `::placeholder`
> rules). So it affects every example that uses that package. I checked it in
> `examples/react` at `ff43b02` (May 2, 2026), with `npm ci` and `npm run dev`, and also with the
> example's built `dist/`.
>
> **To reproduce:** open the React example, then inspect the new-todo input's `::placeholder`
> style, or run axe or the Lighthouse accessibility audit.
>
> **Expected:** contrast of 4.5:1 or more. **Actual:** 2.8:1.
>
> **A possible fix:** `rgba(0, 0, 0, 0.55)`, which is #737373 on white (4.7:1) and stays close
> to the light look, or `#595959` (7.0:1). The italic style can stay.
>
> I found this with an AI tool (Fitts, an agent that audits websites for usability and
> accessibility). Then I checked it by hand: I read the CSS and measured the computed style in
> a browser.

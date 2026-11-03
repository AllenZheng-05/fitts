# Fitts on TodoMVC's React app

One paid Fitts run on an open-source app nobody here wrote, with every finding checked by hand.

| | |
| --- | --- |
| App | [TodoMVC](https://github.com/tastejs/todomvc), `examples/react` (MIT) |
| Commit | upstream `ff43b02e59dfa604386bb382034b2cd07c2bcd8a` (May 2, 2026); `examples/react` split into its own local repo so Fitts could open it as a project |
| Fitts | apps/desktop at `284dfed` (Phase 4 U9), Economy profile, autonomous, dry-run PRs |
| Run | Nov 3, 2026, 15:56–16:18 UTC, one page (`/`), 29 model calls |
| Cost | **$3.48** against a $3.00 cap (the cap was crossed inside one fix call; see below) |
| Shown | 10 findings and 1 suggestion |
| Verdicts | **3 confirmed, 7 false positives, 0 unsure**; the suggestion repeats two confirmed findings |
| Fixes | 1 attempted, not verified (Fitts's own dev-server problem, below); stays on a local branch |

Brief given to Fitts (the first interview answer): "TodoMVC's React app: a to-do list for anyone
keeping track of small tasks. It should be quick, clear and work well from the keyboard."

## How it was run

- The clone's `origin` is a local bare repo, so no push, dry-run or not, can leave this machine.
  Nothing was filed or pushed upstream.
- `npm ci`, then Fitts started `npm run dev` (webpack-dev-server) on port 8080.
- Harness: a local copy of `tests/bench/audit.bench.ts` (not committed). It stops at Done, a
  finish proposal or the budget question.
- Hand checks: the source, plus headless Edge through Playwright against both the dev server and
  the project's own built `dist/` (served with its `npm run serve`), measuring computed styles,
  element boxes, axe, layout shifts, refreshes, a failed and a slow `learn.json`, and the tab
  order.

## Findings and verdicts

| # | Sev | Finding (as Fitts titled it) | Verdict |
| --- | --- | --- | --- |
| f1 | 3 | Placeholder text is too faint to read | **Confirmed** |
| f2 | 3 | Tap target is too small | False positive |
| f3 | 2 | Document should have one main landmark | **Confirmed** (best practice) |
| f4 | 2 | All page content should be contained by landmarks | **Confirmed** (best practice) |
| f5 | 2 | Tap target is too small on Text at 200% · 1280 wide | False positive |
| f6 | 2 | Tap target is too small on Text spacing · 1280 wide | False positive |
| f7 | 4 | Refreshing a page breaks it | False positive |
| f8 | 4 | The page breaks when a request fails | False positive |
| f9 | 3 | No sign the page is loading | False positive |
| f10 | 2 | Page content jumps after load | False positive (dev server only) |
| f11 | 2 | (suggestion) Missing main landmark for assistive tech | Same as f3 and f4 |

**f1, confirmed.** The new-todo placeholder is `rgba(0, 0, 0, 0.4)` on white
(`todomvc-app-css` 2.4.3, `index.css` lines 50–65), which is about #999 on #fff: 2.8:1. WCAG
1.4.3 asks 4.5:1 for text this size (24px, not bold). The rule lives in the shared
`todomvc-app-css` package, so every TodoMVC example that uses it has the same contrast.

**f2, f5, f6, false positives.** All three are the footer's "TodoMVC" link (48×12 px; 58×12 px
with text spacing). It sits inside the sentence "Part of TodoMVC", and WCAG 2.5.8 exempts a
target in a sentence. The text is small (11px), but that's not what Fitts reported. f5 and f6
also repeat f2 for two more device cells instead of being folded into it.

**f3, f4, confirmed as best practice.** axe reports `landmark-one-main` and `region` (both
moderate, tagged best-practice, not WCAG failures): the app is a `<section>` and a `<footer>`
with no `<main>`. Low impact; correctly severity 2.

**f7, false positive as written.** Refreshing `/` doesn't blank the page. After a reload the
header, input and footer are all there, in dev and built. What a reload does do is drop every
to-do: this example keeps them in `useReducer` only, never in localStorage, though TodoMVC's
`app-spec.md` (Persistence) asks for localStorage. Most of the current examples (react,
react-redux, vue, preact, svelte, lit, angular, javascript-es6, web-components) don't persist
either, so it looks like a project-wide choice, not a React bug. Fitts never added a to-do
before refreshing, so it can't have seen that; it called the empty app "blank".

**f8, false positive.** `learn.json` feeds the optional "learn" sidebar from
`todomvc-common/base.js`, which ignores a failed request (`xhr.onload` checks for 200 and does
nothing otherwise). With the request aborted, the app renders exactly as before. On the dev
server the file doesn't exist at all (404), which is normal for an example run on its own. The
"blank" state Fitts saw is the app with no to-dos: just the input.

**f9, false positive.** Nothing waits on `learn.json`; the app is usable at once while it loads.
A loading indicator for an optional sidebar that's absent here anyway would be wrong.

**f10, false positive for users.** On the dev server, the content moves once (layout-shift score
0.055 at 0.56 s) because webpack's `style-loader` injects the CSS from JavaScript after the
first paint. The project's production build extracts the CSS into `app.css`; there the only
shift is 0.004 (well under 0.1). Real, but only in development.

## The fix

Fitts started on 7 findings and got through one: f1, the placeholder. Its change, in the run's
worktree on `fitts/run-run-1` (local only):

```css
.new-todo::placeholder {
    color: #595959;
    opacity: 1;
}
```

\#595959 on white is 7.0:1, so the change itself is right and minimal. It was never verified:
twice, Fitts reported "the dev server didn't start", though webpack's log said it compiled. The
cause is in Fitts. For a project that isn't Vite, the fix branch's dev server gets its port only
through the `PORT` environment variable (`devCommandOnPort` → `detectDevCommand`,
`DevServer`), and webpack-dev-server ignores `PORT`, so it started on its own port while Fitts
waited on another. Fitts then sent the same fix back to Muse Wonder 1.0, and the two fix calls
cost $2.90 of the run's $3.48. The second one ran past the $3.00 cap before Fitts could stop
(the cap is checked between calls), and Fitts then asked whether to spend more; the harness
didn't answer.

## What Fitts missed

- **Delete and edit don't work from the keyboard**, and the brief asked for keyboard use. The
  delete button is `display: none` except on `li:hover`, so Tab skips it; editing needs a
  double-click on the label. Tab order after adding a to-do: toggle all, the to-do's checkbox,
  All, Active, Completed, the TodoMVC link. Known upstream: tastejs/todomvc#1017 (opened 2014,
  closed in the April 2026 cleanup, with a later comment that it's still true at `ff43b02`).
- **To-dos are lost on refresh** (see f7).
- **It barely used the app.** The crawl took one step: it typed into the input. It never added
  more than that, ticked, filtered (`#/active`, `#/completed`), edited, deleted or cleared
  completed, so the app's whole flow went unchecked. The reviewers (7 calls) looked at the one
  screen, which mostly shows an empty input.
- **It pointed the fixer at the built bundle.** The task said "Source hint: app.bundle.js:31022"
  and listed `app.bundle.js` among the files it may change: Fitts's source locations come from
  its Vite plugin, and webpack projects have none, so it fell back to the source map's bundle.
  The fixer found `src/todo/app.css` anyway.

## For the app (follow-ups, not changed on this branch)

1. Give a non-Vite fix server its port the way its tool takes it (`--port` for webpack-dev-server
   and Astro, `-p` for http-server), or read the port it actually printed, and don't retry a fix
   when the failure is the server, not the change.
2. Fold the same element's tap-target finding across device cells into one finding, and apply
   WCAG 2.5.8's inline exception.
3. Treat an app's empty state as content: "blank" should mean nothing rendered, not "less than
   before".
4. Check what a failed or slow request feeds before calling it a blocker.
5. Measure layout shift on a production build when the project has one, or say "in development".
6. Exercise the main flow before reviewing: add, toggle, filter, edit, delete.

An issue text for the placeholder contrast (f1) is in [issue-drafts.md](issue-drafts.md).

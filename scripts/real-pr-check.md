# Real PR check

Use this checklist the first time Fitts opens real pull requests on GitHub (SPEC-phase2 §9.3,
V8). Every automated test runs with `FITTS_GH_DRY_RUN=1` against a local bare repo, so this is
the only step that touches GitHub. Allow about 15 minutes, plus model spend under $1 on
Economy with contributor mode.

## Before you start

- `gh --version` is 2.99 or newer (`--attach` needs it), and `gh auth status` shows you're
  logged in as AllenZheng-05.
- The mirror repos exist and are pushed (NEEDS-ALLEN 3):
  `gh repo view AllenZheng-05/fitts-demo-chat`.
- You have a clean clone outside the monorepo:

  ```
  gh repo clone AllenZheng-05/fitts-demo-chat ~/code/fitts-demo-chat
  cd ~/code/fitts-demo-chat && pnpm install
  ```

## Run

1. `pnpm dev` in the fitts repo. Don't set `FITTS_GH_DRY_RUN`.
2. In Fitts, add `~/code/fitts-demo-chat`, answer the interview, and choose **Autonomous**.
   In Settings, choose Economy, turn contributor mode on, and set the cap to $3.
3. Start the audit. Answer **Don't do it** when the gate asks about Delete conversation.
4. Wait for Done.

## Check

- [ ] At least 5 PRs are open on GitHub
      (`gh pr list -R AllenZheng-05/fitts-demo-chat --author @me`), each from a `fitts/…`
      branch.
- [ ] Each PR body has the heuristic and severity, the problem, the fix, the evidence, the
      verification and the repro. There's no AI attribution, and no Co-Authored-By trailer on
      the commit (`gh pr view <n> --json commits`).
- [ ] Before and after screenshots are attached (`--attach`). With gh < 2.99, they're
      committed under `.fitts/pr-assets/` and linked instead.
- [ ] **View PR** in Fitts opens the right PR in your browser.
- [ ] **Undo** on one change closes its PR and deletes its branch, and Done shows "Undone · PR
      #n closed".
- [ ] Merge one PR on GitHub, then **Undo** it in Fitts. A revert PR (`fitts/revert-<n>`)
      opens, and Done says "Revert PR #m opened".
- [ ] Nothing was pushed to `main`, and Fitts never merged anything.

## Clean up

```
gh pr list -R AllenZheng-05/fitts-demo-chat --author @me --json number -q '.[].number' \
  | xargs -n1 gh pr close -R AllenZheng-05/fitts-demo-chat --delete-branch
```

Then report anything unexpected in docs/PROGRESS.md under Known issues.

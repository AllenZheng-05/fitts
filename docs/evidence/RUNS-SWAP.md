# Wednesday: the Basil & Ember run on /runs/, and the README

Two jobs: publish the Basil & Ember run as the run the site links to, and drop the final numbers
into the README. Nothing here runs a model or costs money. Run every command from the repo root.

## 1. Publish the run

The site reads `apps/site/src/content/runs.json`. Home, Showcase and Download link to its
`featured` run, and /runs/ lists them all. `@fitts/run-report` writes the folder and that file;
there's no page code to change.

1. **Pick the run.** It's either a run recorded in the Fitts app or a bench run. They're stored
   in different places:
   - The app keeps its runs in `%APPDATA%\Fitts\projects\<project-id>\runs\run-<n>` on Windows.
   - A bench run keeps its runs in its own `fitts-e2e-*` folder under `%TEMP%`, as
     `projects\<project-id>\runs\run-<n>`.

   A run is ready when its folder has `events.ndjson`. Choose the one whose findings you've
   checked.

2. **Keep a copy** in `.fitts-dev/runs/` (git-ignored), with the same layout, so the page can be
   exported again later. The demo-chat run is kept there too.

   ```powershell
   $src = "<the projects\<project-id> folder from step 1>"
   $n = "run-<n>"
   New-Item -ItemType Directory -Force .fitts-dev\runs\basil-ember\runs | Out-Null
   Copy-Item "$src\project.json" .fitts-dev\runs\basil-ember\
   Copy-Item -Recurse "$src\runs\$n" .fitts-dev\runs\basil-ember\runs\
   ```

3. **Publish it as the featured run.** The run path is relative to `packages/run-report`:

   ```
   pnpm --filter @fitts/run-report site ../../.fitts-dev/runs/basil-ember/runs/run-<n> --id basil-ember-nov-4 --label "Real AI-built site, untouched" --featured
   ```

   It writes `apps/site/public/runs/basil-ember-nov-4/`, puts the run first in `runs.json` and
   makes it `featured`. The export refuses to write a page that would contain a key or a local
   path, and names the file and the line instead.

4. **Decide on demo-chat.** `demo-chat-nov-2` stays listed, below the new run, and keeps its
   "Run it yourself" note. To drop it instead, delete `apps/site/public/runs/demo-chat-nov-2/`
   and its entry in `runs.json`. The site's unit test checks that the folders and the list
   match.

5. **Check it:**

   ```
   pnpm --filter @fitts/site test
   pnpm --filter @fitts/site test:e2e
   ```

   The unit test scans every published run again for keys and paths. The e2e run checks every
   report at 1440, 390 and 320 px: axe-clean, self-contained and no sideways scrolling. It also
   checks that Home, Showcase and Download link to the new featured run and that its heading is
   the project's name. Then look at `/runs/basil-ember-nov-4/` at phone width yourself
   (`pnpm --filter @fitts/site build && pnpm --filter @fitts/site preview`).

6. **Commit:** `Site: Basil & Ember's run is the one the site links to`.

## 2. README edits

Apply these to main's README; don't rewrite it. `{{LIKE_THIS}}` marks a number to fill in from
the run published above, or from `docs/bench/RESULTS.md`. The open-source numbers are final.

**"Try it without keys"**: replace the paragraph with:

```markdown
Open the recorded runs at [fitts.allenzheng.com/runs/](https://fitts.allenzheng.com/runs/) in
any browser. The featured one is [Basil & Ember](https://fitts.allenzheng.com/runs/basil-ember-nov-4/),
a restaurant site Muse Code generated from one prompt and nobody has edited since: Fitts found
{{BE_SHOWN}} problems and fixed and verified {{BE_VERIFIED}}, for {{BE_COST}}. Each report shows
what Fitts understood, the findings with their evidence and repro steps, the verified fixes and
the App Map, with the Noticed lines behind every finding. No install and no keys needed.
```

If the run has no fixes, end the sentence at "found {{BE_SHOWN}} problems, for {{BE_COST}}".

**Benchmarks**: add after the Basil & Ember Android paragraph:

```markdown
**Basil & Ember's website, no answer key** ({{BE_DATE}}, Economy, {{BE_COST}}): {{BE_SHOWN}}
findings. Checked by hand against the running site: {{BE_REAL}} real, {{BE_FALSE}} false,
{{BE_UNSURE}} unsure. {{BE_HEADLINE: one sentence on the best real finding, e.g. "It caught the
checkout offering pickup times when the shop is closed, by reading the hours the site states."}}

**Two open-source apps nobody here wrote**, every finding checked by hand
([TodoMVC](docs/evidence/oss-todomvc-react.md), [Bootstrap](docs/evidence/oss-bootstrap.md)):

| App | Findings | Real | False | Unsure | Cost |
|---|---|---|---|---|---|
| TodoMVC, React (`ff43b02`) | 10 | 3 | 7 | 0 | $3.48 |
| Bootstrap 5.3.8, Examples page | 30 | 9 | 15 | 6 | $1.39 |

Precision was low here too. On Bootstrap the crawl spent 991 of its 1,000 actions on one skip
link, so it never opened an example; repeat taps are now capped. On TodoMVC the one correct fix
couldn't be verified, because its webpack dev server ignores the port Fitts gives it. The placeholder
contrast it confirmed is drafted as an issue for TodoMVC ({{TODOMVC_ISSUE: "filed as
tastejs/todomvc#NNNN" or "not filed"}}).
```

**Known limits**: add:

```markdown
- Fixes are verified on a second dev server on its own port. Vite projects and servers that read
  `PORT` (Next.js, Create React App) get one; webpack-dev-server, and scripts with a fixed
  `--port`, don't yet, so their fixes can't be verified.
```

**Check before committing:** every `{{` is gone (`git grep -n "{{" README.md`), and each number
matches the report page and `RESULTS.md`.

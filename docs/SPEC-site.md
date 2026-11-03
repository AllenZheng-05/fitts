# SPEC-site: fitts.allenzheng.com

Built in apps/site on branch site-redesign, alongside U10 on main.
- Change only apps/site, its entry in pnpm-lock.yaml, docs/SPEC-site.md, docs/SITE-PROGRESS.md
  and docs/SITE-DECISIONS.md.
- Don't edit apps/desktop or packages/*; read them freely.
- Log progress in docs/SITE-PROGRESS.md and judgment calls in docs/SITE-DECISIONS.md.

## Goal
The site looks exactly like the Fitts desktop app: its tokens, components and the 3D floating
shapes. The home page is simple: the big logo, a tagline, and install buttons for three
platforms. The depth lives on its own pages: how Fitts works, everything it checks, how well it
works, and showcases of it working.
- It's for any app or site, not only AI-built ones.
- It must pass Fitts's own checks: WCAG 2.2 AA, axe clean, full keyboard use, no sideways
  scrolling at 320 px.
- Before submission, run Fitts on this site, fix what it finds, and publish the result.

## Pages (a Vite multi-page build; no router dependency; static on Cloudflare Pages)
index.html, how-it-works/index.html, checks/index.html, showcase/index.html,
download/index.html, plus a 404 page in the site's style.
- Shared: Nav, Footer and a Page shell.
- All words stay in src/content.ts (or one content file per page), in Fitts's voice: plain,
  warm, specific, no exclamation marks.
- Each page gets its own <title>, meta description and Open Graph tags. Add a sitemap.xml.
- The Open Graph image: the Fitts mark and wordmark with the tagline.
- The nav links all five pages. The current page is marked with aria-current.
- Carry the favicon over.
- Cloudflare Pages _headers: long cache lifetimes for /media and the hashed assets.

### 1. Home (/)
- Center stage:
  - the Fitts mark (copy the paths from apps/desktop/.../brand/FittsMark.tsx) and the
    wordmark, both very large (Bricolage Grotesque 800);
  - the tagline "Making sure your design fits.";
  - one line: "Your UX expert: it uses your app like a person, then fixes what gets in
    the way."
- Three platform buttons: Windows, macOS, Linux. The visitor's detected platform is the
  filled primary button; the others are outlined. Under them: "Free · open source · beta"
  and a link to /download for install notes and Intel Macs.
- A GitHub link.
- Below the fold, nothing else except:
  - the demo video embed (links.video; while it's empty, a poster card saying the video goes
    up with the hackathon submission);
  - three cards linking to How it works, What Fitts checks and Showcase.
- The 3D field runs in lively mode here.

### 2. How it works (/how-it-works)
- **The loop**, as an explorable diagram built from separate HTML elements, keyboard
  reachable: understand → explore → notice → prove → fix → you decide. Each step opens a
  panel with:
  - what Fitts does;
  - which models do it;
  - which checks run;
  - a short clip slot (see Media).
- **The models, with their real jobs (verify each against the code):**
  - **Muse Spark** thinks: the interview, Understand, choosing what to check next, journeys,
    reviewers and chat.
  - **Muse Wonder** judges:
    - motion moments, from frames;
    - the review check on fixes that can't be measured;
    - in the Quality profile, two reviewers, merging the findings, the theme check and the
      redesign.
  - **SAM 3.1** points: outlines the element in screenshots and in the motion frames.
  - **Muse Code** fixes, inside the file allowlist, in a separate copy of the code. It also
    reads the repo for Understand's second pass.
  - **Muse Image** designs: the redesign directions' mockups and hero illustrations.
  - **Muse Voice Transcribe** listens: spoken briefs and talking to Fitts.
  - **Muse Spark Open** on Baseten: an independent reviewer, and the whole review in the
    Open profile.
  - Fitts's spoken voice is ElevenLabs. Never list it as a Meta model.
- **A profiles table:** Economy, Quality and Open, and which model does what in each (from
  agent/llm/router.ts).
- **"Talk to it while it works":** say "Fitts" first and it listens; interrupt it
  mid-sentence and it stops; keep today's example lines.
- **The safety rails:**
  - the evidence rule (a measurement, or 2 of 5 reviewers agreeing);
  - severity on Nielsen's 0–4 scale;
  - the gate (web: held at the network; Android: the tap is held);
  - the modes (Plan only, Ask every action, Autonomous), Stop (Ctrl+. / ⌘.), and Take the
    wheel;
  - the file allowlist;
  - verification in a separate worktree, with "Verified" vs "Checked by review";
  - the pause while Meta's models can't be reached;
  - you decide when it's done, and it remembers what you dismissed;
  - the spending cap;
  - Undo.
- **Device previews:** watch your site as an iPhone, an Android phone, a tablet, a laptop or
  a desktop, with real mobile emulation (today's preset list).
- **Android:** Fitts drives the emulator over adb, reads the same accessibility tree
  TalkBack does, catches jumps and pop-ups from dumps and screencaps, and shows the fixed
  app on the emulator.
- **Redesigns:**
  - the full flow: your vision, what to keep, sites you admire, three directions from the
    design library, every page restyled and verified;
  - today's "When does a site need a redesign?" text;
  - the library counts and swatch strips (from @fitts/styles, as now).
- **"What a Fitts pull request looks like":** a screenshot slot in media.ts for the real PR
  from the recorded run, with callouts for the per-page table, the repro steps, the
  verification footer, and "Verified" vs "Checked by review".
- **"What's next":** a short teaser (iOS, Windows and macOS apps, cloud devices, a VS Code
  extension, an MCP server, CI) linking docs/ROADMAP.md on GitHub.

### 3. What Fitts checks (/checks)
- Move the Paul Fitts and Nielsen history and the formula here, keeping today's text.
- **Nielsen's 10**, each with how Fitts tests it. Today's text is good; correct it against
  Phase 4.
- **A filterable catalog of every check,** grouped by lens:
  - Accessibility: full axe, WCAG 2.0–2.2 A/AA plus best practice.
  - Keyboard: the Tab sweep and the dialog checks.
  - Navigation: wrong destinations, redirect chains and loops, soft 404s, the Back trap,
    reload.
  - Surprises: popped up, jumped, scrolled by itself, focus moved; plus the Muse Wonder
    judge.
  - States: the error case; say which state_pass cases are actually built.
  - Screen sizes: 320 px reflow, 200% text, text spacing, orientation, breakpoints.
  - Speed: say plainly that it's measured on the dev server, throttled, and labeled "dev
    build"; the production build is on the roadmap.
  - Android: labels, 48 dp targets, pixel contrast, duplicate bounds, placeholder leaks,
    surprises.
  - Brand and look: theme fit, and the brand check on Android.
  - Fitts's law target scoring.
- Each item shows:
  - what it checks;
  - how it's measured;
  - its WCAG criterion or heuristic;
  - its evidence label: Measured, Reviewers, or Judged by Muse Wonder.
- **Build the lists from the code, not by hand.** Import from packages/* where the lists live
  (for example packages/probes' standards and probe names). Where a list exists only inside
  apps/desktop, copy it into the site and add a test that compares the copy with its source,
  so drift fails CI. Log which in SITE-DECISIONS.
- The filters are real buttons with aria-pressed. The count of shown checks is announced in
  a polite live region.
- **"How well it works":** benchmark numbers taken from PROGRESS.md as they stand when you
  build it:
  - the chat test app: recall and precision, with the latest green run named;
  - Android: 6 of 10, with what it missed;
  - the fix benchmark: 3 of 3 verified;
  - links to each test app's PLANTED.md.
  Never round up or mix runs: one run's numbers together.

### 4. Showcase (/showcase)
- One card per feature, each with a clip slot, a one-line caption and an honesty label:
  - the understanding card
  - Noticed lines
  - presentation mode and its info card
  - See it yourself (repro steps, the Playwright test)
  - a verified fix
  - the 2:45 AM pickup finding
  - the App Map
  - the Android menu jump judged by Muse Wonder
  - the emulator switching to the fixed version
  - the brand fix
  - the "Cancel order" gate
  - a redesign
  - talking to Fitts
  - the pause when the models can't be reached
- Honesty labels:
  - "Real AI-built site, untouched" (Basil & Ember);
  - "Our test app, planted issues" (the Android app, demo/chat);
  - "Real site, merged" (the portfolio).
- **The portfolio before/after (replaces the 2007 one):**
  - Delete portfolio-before.png and portfolio-after.png and the 2007 copy.
  - Reuse BeforeAfter.tsx with Allen's real portfolio run: the live site as it is today,
    and Fitts's merged change.
  - Card: "A real change Fitts made on a real, deployed site", with the merged PR's number
    and link.
  - Until the assets exist the section doesn't render. Never a fake or staged image.

### 5. Download (/download)
- **Builds:** Windows, macOS (Apple silicon), macOS (Intel), Linux, with today's install
  notes for unsigned builds.
- **macOS** says "beta: not yet tested on a real Mac" until Allen confirms otherwise
  (content flag).
- **Linux** is behind a content flag, so it can be hidden everywhere at once if it doesn't
  make the release.
- **Requirements:**
  - Node.js, git, and the GitHub CLI for pull requests;
  - a Meta Model API key;
  - optionally a Baseten key (Spark Open);
  - for Android: the Android SDK and an emulator.
- **Getting started:** the steps, without "Watch a recorded run" (the feature stays in the
  app; the site doesn't promote it).
- **Works with:** Vite, Next.js, Astro and similar web projects with a dev server; Expo
  Android apps as a development build; live sites you own, audit only.
- **Known limits:** unsigned builds; macOS not yet tested on a real Mac; speed on a dev
  build; Android repros observed, not replayed; no saved test logins yet.
- **Privacy:** what leaves the computer, where keys are stored, and the Meta key passed to
  Muse Code on stdin, never stored.
- **The FAQ:** all five of today's questions, updated for Phase 4. The cost answer gets real
  numbers from PROGRESS's benches (chat app on Economy about $0.08–0.19; Android audit about
  $1), plus the cap and the per-call cost list.
- **Release notes:** the link.

### Footer (every page)
- "Made by Allen Zheng. Built from scratch during the Meta Global AI Developer Hackathon,
  Oct 28 – Nov 4, 2026."
- Every Meta model Fitts uses: Muse Spark, Muse Wonder, Muse Code, SAM 3.1, Muse Image,
  Muse Voice Transcribe, Muse Spark Open.
- Apache 2.0 license, GitHub, and "Report a problem" (GitHub issues).
- "This site was audited by Fitts", with the result once the last step has run.

## The 3D field
- Copy apps/desktop/src/renderer/features/background/ (ShapeField, shapes, seeThrough,
  useFieldRunning) into apps/site/src/field/.
  - Remove the app-only reactions: the run store's new-finding drops and the speech
    reactions. Keep the field's look, physics, cursor push, drag and throw, wandering, and
    the deterministic layout.
  - Pin the same versions of three, @react-three/fiber, @react-three/drei and
    @react-three/rapier as apps/desktop.
  - The field reads colors from CSS variables named --coral, --cobalt, etc. Define those on
    :root in the site (the Tailwind theme uses --color-*).
- Modes: lively on Home, calm on every other page.
- **Phones get still images.** Render the static image, not WebGL, when any of these is true:
  - (pointer: coarse);
  - width < 768 px;
  - prefers-reduced-motion;
  - navigator.connection.saveData;
  - no WebGL.

  The still image is generated from the same layout() (an SVG or a pre-rendered image from a
  script), so it looks like the real field. Log the method.
- Load the field lazily, after first paint and when idle, so the page is usable first.
  - Cap at 30 fps.
  - Pause when the tab is hidden or the field is off screen.
  - It never blocks clicks on content; reuse seeThrough's logic.
  - Cards paint their own backgrounds, so shapes show in the gutters and text stays readable.
- **Budget:** home's first load stays light; the field's code arrives in its own lazily
  loaded chunk. Record the transferred sizes in SITE-PROGRESS.

## Media (clips, images)
- Write src/media.ts as a manifest. Each entry has:
  - id, title, caption, honesty label;
  - poster (WebP), src (MP4 H.264, muted, ≤ 4 MB);
  - alt text that says what happens in the clip.
- Clips are lazy-loaded, muted, looping and playsinline, with a visible pause/play button
  (WCAG 2.2.2). With reduced motion they don't autoplay.
- Missing media shows a tidy "Clip coming" card in the site's style. It's never broken and
  never a stand-in.
- Allen will add the clips from tomorrow's recording sessions on Wednesday; leave the slots
  ready.
- No GIFs.

## Correct these claims from today's site
- **Footer models:** every Meta model Fitts uses (see Footer).
- **The gate:** network on the web, the held tap on Android.
- **Speed:** dev build, not production.
- **Remove** every "Watch a recorded run" mention and the 2007 portfolio.
- **Add Phase 4:** Understand, repro with ddmin, journeys and screen sizes, Noticed lines,
  the Wonder judge, SAM, Android, the App Map, owner-first and you deciding when it's done,
  the pause while models can't be reached.

## Order (commit each step separately; never push; no Co-Authored-By or "Generated with")
1. **Home + Download** (with the FAQ, Works with, Known limits and Privacy) **+ the 3D field
   + the still image + Nav/Footer + the 404 page, favicon and _headers + the claim fixes.**
   Needed first: the video's end card points here.
2. **What Fitts checks,** generated from the code, with the drift test and "How well it
   works".
3. **How it works,** including talking to Fitts, the device previews, the redesign flow, the
   PR block and "What's next".
4. **The Showcase scaffold and the media manifest,** with "Clip coming" slots and the
   portfolio section hidden until its assets exist.
5. **Checks:**
   - typecheck, lint, build;
   - a Playwright smoke test plus axe on each page, at 1440 and 390 px;
   - a test that phones and reduced motion get the still image, not the WebGL bundle;
   - then audit the site with Fitts itself, fix what it finds, log the result in
     SITE-PROGRESS, and fill in the footer's "audited by Fitts" line.

When done, tell Allen how to merge site-redesign into main. Don't merge it; U10 is on main.

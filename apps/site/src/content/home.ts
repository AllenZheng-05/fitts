// Home (/). Fitts's voice: plain, warm, specific; no exclamation marks.

export const home = {
  name: 'Fitts',
  tagline: 'Making sure your design fits.',
  line: 'Your UX expert: it uses your app like a person, then fixes what gets in the way.',
  download: 'Download for {os}',
  meta: 'Free · open source · beta',
  notes: 'Install notes, Intel Macs and every build',
  phone: 'Fitts is a desktop app. Open this page on your computer to install it.',
  github: 'See the code on GitHub',
  videoTitle: 'Watch Fitts work',
  videoPending:
    'The demo video goes up with the hackathon submission. It shows one real run from start to finish: Fitts reading the code, using the site, proving what it found and fixing it.',
  videoPendingLabel: 'Video coming',
  moreTitle: 'Go deeper',
  cards: [
    {
      page: 'how',
      title: 'How it works',
      body: 'Understand, explore, notice, prove, fix, and you decide. Which model does which job, and the rails that keep you in charge.',
    },
    {
      page: 'checks',
      title: 'What Fitts checks',
      body: 'Every check, from Nielsen’s heuristics to WCAG 2.2 AA, with how it’s measured and how well Fitts does on test apps.',
    },
    {
      page: 'showcase',
      title: 'Showcase',
      body: 'Short clips of Fitts at work on real projects, each labeled with what kind of project it was.',
    },
  ],
} as const;

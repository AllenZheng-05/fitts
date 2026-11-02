// Showcase (/showcase). Fitts's voice: plain, warm, specific; no exclamation marks.
// The clips themselves are listed in src/media.ts.

export const showcase = {
  title: 'Fitts at work',
  lead: 'Short clips from real runs, one feature each. Every clip says what kind of project it was, so you know what you’re looking at.',
  labelsTitle: 'What the labels mean',
  labels: [
    {
      honesty: 'untouched',
      body: 'Basil & Ember, a restaurant site built by an AI coding tool (Muse Code) from one prompt. Nobody planted anything; what Fitts finds there is what the tool left.',
    },
    {
      honesty: 'planted',
      body: 'Our test apps (a chat app and the Basil & Ember Android app), with problems planted on purpose and an answer key, so you can see what Fitts should find.',
    },
    {
      honesty: 'merged',
      body: 'A real, deployed site, and a change Fitts made that was merged.',
    },
  ] as const,
  portfolioTitle: 'A real change Fitts made on a real, deployed site',
  portfolioLead:
    'Allen’s own portfolio, allenzheng.com: the live site as it was, and the change Fitts made, which Allen merged.',
  portfolioPr: 'Pull request #{n}',
  before: 'BEFORE',
  after: 'AFTER',
  sliderLabel: 'Before and after',
  caption: 'Drag the handle, or use the arrow keys, to compare.',
};

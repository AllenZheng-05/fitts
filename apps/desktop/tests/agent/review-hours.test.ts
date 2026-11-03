// @vitest-environment node
// The reviewers see a select's choices and the hours the site states on any page, so times on
// offer can be checked against them (Basil & Ember's pickup list offered times it's closed: the
// options were in the DOM, but the reviewers never saw them, nor the About page's hours).
import { describe, expect, it } from 'vitest';
import { reviewInput, type RouteEvidence } from '../../src/agent/review/reviewers';

const ev = (extra: Partial<RouteEvidence> = {}): RouteEvidence => ({
  route: '/checkout',
  snapshot: {
    url: 'http://localhost:5176/checkout',
    path: '/checkout',
    title: 'Checkout',
    headings: ['Pickup details'],
    nodes: [
      {
        ref: 'co-time',
        role: 'combobox',
        name: 'Pickup time',
        value: 'As soon as possible (~15 min)',
        options: ['As soon as possible (~15 min)', '2:30 AM', '2:45 AM'],
      },
      { ref: 'co-name', role: 'textbox', name: 'Name for the order' },
    ],
    hasPassword: false,
  },
  trace: [],
  probes: [],
  ...extra,
});

describe('reviewInput', () => {
  it("lists a select's options with the control", () => {
    const text = reviewInput(ev(), {});
    expect(text).toContain('"options":["As soon as possible (~15 min)","2:30 AM","2:45 AM"]');
    expect(text).not.toContain('"co-name","role":"textbox","name":"Name for the order","options"');
  });

  it('gives the hours the site states, to check the times on offer against', () => {
    const text = reviewInput(ev({ siteHours: ['Tuesday 4:00 PM – 10:00 PM'] }), {});
    expect(text).toMatch(
      /Hours the site states \(on its pages\): \["Tuesday 4:00 PM – 10:00 PM"\]/,
    );
    expect(reviewInput(ev(), {})).not.toMatch(/Hours the site states/);
  });
});

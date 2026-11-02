// The App Map on Done (SPEC-phase4 §8.3–8.4): the ARIA tree's keyboard (arrows, Home/End,
// type-ahead), the page drawer's contents, and the filters.
import type { AppModelSummary, Finding, RunState } from '@fitts/schema';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { copy } from '../../src/renderer/copy';
import { AppMap } from '../../src/renderer/features/summary/AppMap';

const finding = (id: string, route: string, over: Partial<Finding> = {}): Finding => ({
  id,
  runId: 'run-1',
  severity: 3,
  lens: 'usability',
  title: `Problem ${id}`,
  finding: 'x',
  fix: `Fix ${id}`,
  route,
  agreement: { agreeing: 1, total: 5, who: ['Probe'] },
  evidence: [],
  stepIndex: 1,
  atMs: 0,
  status: 'open',
  lane: 'shown',
  ...over,
});

const model = {
  summary: 'A messaging app for grandparents.',
  commit: 'abc',
  modeled: true,
  notes: [],
  pages: [
    {
      route: '/',
      title: 'Inbox',
      source: 'both',
      features: [{ id: 'f', name: 'Read messages', description: 'Every conversation' }],
      forms: 0,
    },
    { route: '/contacts', title: 'Contacts', source: 'both', features: [], forms: 0 },
    { route: '/contacts/:id', title: 'Contact', source: 'code', features: [], forms: 0 },
    { route: '/settings/profile', title: 'Profile', source: 'code', features: [], forms: 1 },
  ],
  journeys: [
    {
      id: 'j1',
      name: 'Open a contact',
      goal: 'x',
      start: '/contacts',
      steps: [],
      pages: ['/contacts', '/contacts/:id'],
      priority: 1,
    },
  ],
} as unknown as AppModelSummary;

const run = {
  runId: 'run-1',
  projectId: 'demo-chat',
  routes: [
    { path: '/', depth: 0, status: 'done', issues: 1 },
    { path: '/contacts', depth: 0, status: 'done', issues: 0 },
    { path: '/contacts/grandma', depth: 1, status: 'done', issues: 0 },
  ],
  findings: [finding('a', '/')],
  changes: [],
  cells: [],
  coverage: {
    pages: { known: 4, reached: 3 },
    journeys: { planned: 1, done: 0, failed: 0, blocked: 0 },
    controls: { done: 1, total: 1 },
    cells: { planned: 0, run: 0 },
    unreached: [{ route: '/settings/profile', why: 'login' }],
  },
  appModel: model,
  observations: [],
} as unknown as RunState;

const item = (name: RegExp) => screen.getByRole('button', { name });

describe('the App Map', () => {
  it('is an ARIA tree with one tab stop; arrows, Home/End and type-ahead move focus', () => {
    render(<AppMap run={run} />);
    const tree = screen.getByRole('tree', { name: copy.done.map.title });
    expect(within(tree).getAllByRole('treeitem')).toHaveLength(5);
    const inbox = item(/^Inbox, \/,/);
    expect(inbox).toHaveAttribute('tabindex', '0');
    inbox.focus();
    fireEvent.keyDown(inbox, { key: 'ArrowDown' });
    expect(item(/^Contacts, \/contacts,/)).toHaveFocus();
    fireEvent.keyDown(document.activeElement as Element, { key: 'End' });
    expect(item(/^Profile,/)).toHaveFocus();
    fireEvent.keyDown(document.activeElement as Element, { key: 'Home' });
    expect(inbox).toHaveFocus();
    fireEvent.keyDown(inbox, { key: 'p' });
    expect(item(/^Profile,/)).toHaveFocus();
  });

  it('Left collapses a branch, then moves to its parent; Right expands it again', () => {
    render(<AppMap run={run} />);
    const contacts = item(/^Contacts, \/contacts,/);
    contacts.focus();
    const treeitem = () => item(/^Contacts, \/contacts,/).closest('[role="treeitem"]');
    expect(treeitem()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(contacts, { key: 'ArrowLeft' });
    expect(treeitem()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /^Contact, / })).not.toBeInTheDocument();
    fireEvent.keyDown(item(/^Contacts, \/contacts,/), { key: 'ArrowLeft' });
    expect(item(/^Inbox,/)).toHaveFocus();
    fireEvent.keyDown(item(/^Inbox,/), { key: 'ArrowDown' });
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' });
    expect(treeitem()).toHaveAttribute('aria-expanded', 'true');
  });

  it('a node opens the page drawer: what it does, what was found, the proposed fix', () => {
    render(<AppMap run={run} />);
    fireEvent.click(item(/^Inbox, \/,/));
    const drawer = screen.getByRole('complementary', { name: /^Inbox:/ });
    expect(within(drawer).getByText('A messaging app for grandparents.')).toBeInTheDocument();
    expect(within(drawer).getByText('Read messages')).toBeInTheDocument();
    expect(within(drawer).getByText('Found here (1)')).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /Problem a/ })).toBeInTheDocument();
    expect(within(drawer).getByText('Fix a')).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: copy.done.map.fixThis })).toBeInTheDocument();
  });

  it('an unreached page says why; journeys through a page show their status', () => {
    render(<AppMap run={run} />);
    fireEvent.click(item(/^Profile,/));
    expect(screen.getByText(copy.done.map.why.login)).toBeInTheDocument();
    fireEvent.click(item(/^Contact, /));
    const drawer = screen.getByRole('complementary', { name: /^Contact:/ });
    expect(within(drawer).getByText(/Open a contact/)).toBeInTheDocument();
  });

  it('filters: Not reached keeps only the way to the unreached page', () => {
    render(<AppMap run={run} />);
    fireEvent.click(screen.getByRole('button', { name: copy.done.map.filters.unreached }));
    const tree = screen.getByRole('tree');
    expect(
      within(tree)
        .getAllByRole('treeitem')
        .map((t) => within(t).getAllByRole('button')[0]?.textContent?.split(',')[0]),
    ).toEqual(['Inbox', 'settings', 'Profile']);
  });
});

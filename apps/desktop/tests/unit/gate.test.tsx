// The gate card (SPEC §7.8): the destructive-action card, and the order or payment the owner
// asked for, worded as the question it is (Allen, Nov 4).
import type { RunState } from '@fitts/schema';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { copy } from '../../src/renderer/copy';
import { GateModal } from '../../src/renderer/features/gate/GateModal';
import { format } from '../../src/renderer/lib/format';

const run = (gate: RunState['gate']) =>
  ({ runId: 'run-1', projectId: 'be', mode: 'ask-unsure', gate }) as unknown as RunState;

describe('the gate card', () => {
  it('an order asks “Place pickup order?” and holds the tap, not a request', () => {
    render(
      <GateModal
        run={run({
          id: 'g1',
          action: 'Place pickup order',
          route: '/checkout',
          heldRequest: copy.gate.pays.holding,
          testing: copy.gate.pays.testing,
          kind: 'pays',
        })}
      />,
    );
    expect(screen.getByRole('alertdialog', { name: 'Place pickup order?' })).toBeInTheDocument();
    expect(screen.getByText(copy.gate.pays.holding)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.gate.allow })).toBeDisabled();
    expect(screen.queryByText(copy.gate.title)).not.toBeInTheDocument();
  });

  it('a destructive tap keeps its own wording and the held request', () => {
    render(
      <GateModal
        run={run({
          id: 'g2',
          action: 'Delete everything',
          route: '/',
          heldRequest: 'DELETE /api/items/1',
          testing: 'H3 user control and H5 error prevention',
        })}
      />,
    );
    expect(screen.getByRole('alertdialog', { name: copy.gate.title })).toBeInTheDocument();
    expect(screen.getByText('DELETE /api/items/1')).toBeInTheDocument();
    expect(format(copy.gate.pays.title, { action: 'x' })).toBe('x?');
  });
});

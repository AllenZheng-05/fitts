import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BeforeAfterSlider } from '../../src/renderer/components/BeforeAfterSlider';
import { Button } from '../../src/renderer/components/Button';
import { CostChip } from '../../src/renderer/components/StatusChips';
import { Stepper } from '../../src/renderer/components/Stepper';
import { Modal } from '../../src/renderer/components/overlay/Modal';
import { Popover } from '../../src/renderer/components/overlay/Popover';
import { ToastHost } from '../../src/renderer/components/overlay/ToastHost';
import { TOAST_MS, useToasts } from '../../src/renderer/state/toasts';
import { useOverlayStack } from '../../src/renderer/state/overlays';

describe('BeforeAfterSlider keyboard (SPEC §5.4)', () => {
  const setup = (defaultValue = 50) => {
    const onChange = vi.fn();
    render(
      <BeforeAfterSlider
        before={<span>now</span>}
        after={<span>fix</span>}
        defaultValue={defaultValue}
        onChange={onChange}
      />,
    );
    const slider = screen.getByRole('slider', { name: 'Compare before and after' });
    return { slider, onChange };
  };

  it('moves 5% with the arrow keys', () => {
    const { slider } = setup();
    expect(slider).toHaveAttribute('aria-valuenow', '50');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveAttribute('aria-valuenow', '55');
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(slider).toHaveAttribute('aria-valuenow', '45');
    fireEvent.keyDown(slider, { key: 'ArrowUp' });
    expect(slider).toHaveAttribute('aria-valuenow', '50');
    fireEvent.keyDown(slider, { key: 'ArrowDown' });
    expect(slider).toHaveAttribute('aria-valuenow', '45');
  });

  it('jumps to the ends with Home and End', () => {
    const { slider, onChange } = setup();
    fireEvent.keyDown(slider, { key: 'End' });
    expect(slider).toHaveAttribute('aria-valuenow', '100');
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(slider).toHaveAttribute('aria-valuenow', '0');
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it('clamps at 0 and 100', () => {
    const { slider } = setup(98);
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveAttribute('aria-valuenow', '100');
    fireEvent.keyDown(slider, { key: 'Home' });
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(slider).toHaveAttribute('aria-valuenow', '0');
  });

  it('describes the value in words', () => {
    const { slider } = setup(30);
    expect(slider).toHaveAttribute('aria-valuetext', '30% showing how it is now');
  });
});

describe('CostChip', () => {
  it('shows spent / cap and warns at 80%', () => {
    const { rerender } = render(<CostChip spentUsd={1.84} capUsd={20} />);
    const chip = screen.getByText('$1.84 / $20');
    expect(chip).not.toHaveAttribute('data-warn');
    rerender(<CostChip spentUsd={16} capUsd={20} />);
    expect(screen.getByText('$16.00 / $20')).toHaveAttribute('data-warn', 'true');
  });

  it('shows the total after a run', () => {
    render(<CostChip spentUsd={13.92} />);
    expect(screen.getByLabelText('Spent $13.92')).toHaveTextContent('$13.92');
  });
});

describe('Stepper', () => {
  it('marks completed and current steps in text, not color alone', () => {
    render(<Stepper active="audit" counter="2 fixing" />);
    const steps = screen.getAllByRole('listitem');
    expect(steps[0]).toHaveTextContent('Interview ✓, completed');
    expect(steps[1]).toHaveAttribute('aria-current', 'step');
    expect(steps[1]).toHaveTextContent('Audit & fix2 fixing');
    expect(steps[2]).not.toHaveAttribute('aria-current');
  });
});

describe('Button', () => {
  it('does not fire when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" disabled onClick={onClick}>
        Fix it
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fix it' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

function OverlayHarness() {
  const [modal, setModal] = useState(false);
  const [popover, setPopover] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const deny = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button type="button" onClick={() => setModal(true)}>
        Open modal
      </button>
      <Modal open={modal} onClose={() => setModal(false)} labelledBy="t" initialFocusRef={deny}>
        <h2 id="t">Gate</h2>
        <button type="button">First</button>
        <button type="button" ref={deny}>
          Deny
        </button>
        <button ref={anchor} type="button" onClick={() => setPopover(true)}>
          Open popover
        </button>
        <Popover open={popover} onClose={() => setPopover(false)} anchorRef={anchor} width={200}>
          <button type="button">Inside popover</button>
        </Popover>
      </Modal>
    </>
  );
}

describe('overlays (SPEC §5.4, §7.2)', () => {
  it('focuses the initial element, traps Tab, and returns focus on Esc', async () => {
    const user = userEvent.setup();
    render(<OverlayHarness />);
    const trigger = screen.getByRole('button', { name: 'Open modal' });
    await user.click(trigger);

    expect(screen.getByRole('dialog', { name: 'Gate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deny' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Open popover' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Open popover' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(useOverlayStack.getState().stack).toEqual([]);
  });

  it('closes only the topmost overlay on Esc', async () => {
    const user = userEvent.setup();
    render(<OverlayHarness />);
    await user.click(screen.getByRole('button', { name: 'Open modal' }));
    await user.click(screen.getByRole('button', { name: 'Open popover' }));
    expect(screen.getByRole('button', { name: 'Inside popover' })).toHaveFocus();
    expect(useOverlayStack.getState().stack).toHaveLength(2);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Inside popover' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Gate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open popover' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ignores Esc when no overlay is open', async () => {
    const user = userEvent.setup();
    const onKey = vi.fn();
    window.addEventListener('keydown', onKey);
    render(<OverlayHarness />);
    await user.keyboard('{Escape}');
    expect(onKey).toHaveBeenCalledWith(expect.objectContaining({ defaultPrevented: false }));
    window.removeEventListener('keydown', onKey);
  });
});

describe('Toast', () => {
  it('shows a message for 4s', () => {
    vi.useFakeTimers();
    render(<ToastHost />);
    act(() => useToasts.getState().show('Report saved'));
    expect(screen.getByText('Report saved')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(TOAST_MS);
    });
    expect(screen.queryByText('Report saved')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});

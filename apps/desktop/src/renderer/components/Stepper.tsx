import type { RunPhase } from '@fitts/schema';
import { copy } from '../copy';
import { cx } from '../lib/cx';

const PHASES: RunPhase[] = ['interview', 'audit', 'done'];

interface StepperProps {
  active: RunPhase;
  /** Cobalt pill on the active step, e.g. "2 fixing" or "redesigning". */
  counter?: string | undefined;
}

/** Interview → Audit & fix → Done (SPEC §5.4). */
export function Stepper({ active, counter }: StepperProps) {
  const activeIndex = PHASES.indexOf(active);
  return (
    <ol
      aria-label={copy.stepper.label}
      className="mx-auto flex gap-[3px] rounded-pill border border-ink bg-card p-[3px] text-[13px] font-semibold"
    >
      {PHASES.map((phase, i) => {
        const state = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'todo';
        return (
          <li
            key={phase}
            aria-current={state === 'active' ? 'step' : undefined}
            className={cx(
              'flex items-center rounded-pill px-3.5 py-[7px] whitespace-nowrap',
              state === 'done' && 'text-mint-ink',
              state === 'active' && 'bg-ink text-card',
              state === 'todo' && 'text-muted',
            )}
          >
            {copy.stepper[phase]}
            {state === 'done' && (
              <>
                <span aria-hidden="true">&nbsp;✓</span>
                <span className="sr-only">, {copy.stepper.completed}</span>
              </>
            )}
            {state === 'active' && counter && (
              <span className="ml-1 rounded-pill bg-cobalt px-[7px] py-px text-[11px]">
                {counter}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

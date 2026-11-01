import type { RunPhase } from '@fitts/schema';
import { copy } from '../copy';
import { cx } from '../lib/cx';
import { format } from '../lib/format';

const PHASES: RunPhase[] = ['interview', 'audit', 'done'];

interface StepperProps {
  active: RunPhase;
  /** Cobalt pill on the active step, e.g. "2 fixing" or "redesigning". */
  counter?: string | undefined;
  /** After a run: which page shows, and switching between the audit page and the summary. */
  shown?: RunPhase;
  onShow?: (phase: RunPhase) => void;
}

/** Interview → Audit & fix → Done (SPEC §5.4). */
export function Stepper({ active, counter, shown, onShow }: StepperProps) {
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
            {onShow && phase !== 'interview' ? (
              <button
                type="button"
                aria-pressed={(shown ?? active) === phase}
                aria-label={format(copy.stepper.show, { step: copy.stepper[phase] })}
                onClick={() => onShow(phase)}
                className={cx(
                  '-mx-3.5 -my-[7px] rounded-pill px-3.5 py-[7px] underline-offset-2 hover:underline',
                  (shown ?? active) === phase && phase !== active && 'bg-mint-tint',
                )}
              >
                {copy.stepper[phase]}
              </button>
            ) : (
              copy.stepper[phase]
            )}
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

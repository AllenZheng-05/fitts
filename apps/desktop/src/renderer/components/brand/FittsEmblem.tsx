import { copy } from '../../copy';
import { FittsMark } from './FittsMark';

/** The flight path from the start dot to where the cursor lands on the target. */
export const EMBLEM_PATH = 'M290 290 C 280 226, 234 180, 182 162';

/**
 * Welcome logo emblem, 300×300 (SPEC §6.1): layer tag, hero card with the mark, a dotted
 * flight path and a cobalt cursor landing on the coral target, and the Fitts's-law label.
 * This is the end state; the M8 animation plays toward it.
 */
export function FittsEmblem() {
  return (
    <div
      role="img"
      aria-label={copy.welcome.emblemLabel}
      className="relative size-[300px] flex-none"
      data-emblem
    >
      <span className="absolute top-0 left-0 rounded-label rounded-bl-none bg-cobalt px-3 py-[5px] font-mono text-[13px] font-medium text-card">
        {copy.welcome.emblemTag}
      </span>
      <div className="absolute top-[30px] left-0 flex size-[230px] items-center justify-center rounded-emblem border-[1.5px] border-ink bg-card shadow-hero">
        <span data-emblem-target className="flex">
          <FittsMark size={192} />
        </span>
      </div>
      <svg
        className="absolute top-0 left-0"
        width="300"
        height="300"
        viewBox="0 0 300 300"
        aria-hidden="true"
      >
        <path
          data-emblem-path
          d={EMBLEM_PATH}
          fill="none"
          className="stroke-ink"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="1 9"
        />
        <circle cx="290" cy="290" r="5" className="fill-ink" />
        <path
          data-emblem-cursor
          d="M156 139 L182 152 L170 155 L165 167 Z"
          className="fill-cobalt stroke-ink"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      <span className="absolute top-[272px] left-0 rounded-label border border-ink bg-card px-2.5 py-1 font-mono text-[12px]">
        {copy.welcome.formula}
      </span>
    </div>
  );
}

interface FittsMarkProps {
  size?: number;
  /** Accessible name. Without one the mark is decorative. */
  title?: string;
  className?: string;
}

/**
 * The Fitts mark, Logos3 option D (SPEC §5.4): ink f, coral target dot, cobalt corner
 * marks and two white handles. Paths are copied exactly from the design reference.
 */
export function FittsMark({ size = 30, title, className }: FittsMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path
        d="M10 18 V 8 H 20"
        fill="none"
        className="stroke-cobalt"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M54 46 V 56 H 44"
        fill="none"
        className="stroke-cobalt"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M38 15 C 30 13, 27 18, 27 25 V 49"
        fill="none"
        className="stroke-ink"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path d="M19 31 H 35" className="stroke-ink" strokeWidth="7" strokeLinecap="round" />
      <circle cx="45" cy="31" r="5.5" className="fill-coral" />
      <rect
        x="6.5"
        y="4.5"
        width="7"
        height="7"
        className="fill-card stroke-cobalt"
        strokeWidth="2"
      />
      <rect
        x="50.5"
        y="52.5"
        width="7"
        height="7"
        className="fill-card stroke-cobalt"
        strokeWidth="2"
      />
    </svg>
  );
}

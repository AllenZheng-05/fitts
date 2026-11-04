interface FittsMarkProps {
  size?: number;
  /** Accessible name. Without one the mark is decorative. */
  title?: string;
  className?: string;
  /** Classes for the coral target dot (the emblem pulses it). */
  targetClassName?: string;
}

/**
 * The Fitts mark: ink f, coral target dot, cobalt corner marks and two white handles. Paths
 * copied exactly from apps/desktop/src/renderer/components/brand/FittsMark.tsx.
 */
export function FittsMark({ size = 30, title, className, targetClassName }: FittsMarkProps) {
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
      <circle
        cx="45"
        cy="31"
        r="5.5"
        className={targetClassName ? `fill-coral ${targetClassName}` : 'fill-coral'}
      />
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

/** GitHub's mark (lucide has no brand icons). */
export function GitHubMark({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

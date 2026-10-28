import { cx } from '../../lib/cx';

interface FittsAvatarProps {
  /** 36–44px (SPEC §5.4). */
  size?: number;
  /** Pulses 1 → 1.06 while Fitts speaks; still under reduced motion. */
  speaking?: boolean;
}

const SPHERE =
  'radial-gradient(circle at 32% 30%, var(--card) 0%, var(--avatar-hi) 20%, var(--cobalt) 60%, var(--avatar-lo) 100%)';

export function FittsAvatar({ size = 36, speaking = false }: FittsAvatarProps) {
  return (
    <div
      aria-hidden="true"
      data-speaking={speaking || undefined}
      className={cx(
        'flex-none rounded-full border-[1.5px] border-ink',
        speaking && 'animate-pulse-speak motion-reduce:animate-none',
      )}
      style={{ width: size, height: size, background: SPHERE }}
    />
  );
}

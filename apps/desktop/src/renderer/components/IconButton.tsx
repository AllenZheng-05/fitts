import type { ComponentProps, ReactNode } from 'react';
import { cx } from '../lib/cx';

type IconButtonVariant = 'secondary' | 'primary' | 'danger-outline';

/** `sm` 36px toolbar · `md` 40px header · `round` 46px mic · `stop` 46px stop button. */
type IconButtonSize = 'sm' | 'md' | 'round' | 'stop';

const VARIANTS: Record<IconButtonVariant, string> = {
  secondary:
    'border border-ink bg-card text-ink enabled:hover:bg-paper aria-pressed:bg-ink aria-pressed:text-card',
  primary: 'border-[1.5px] border-ink bg-cobalt text-card enabled:hover:bg-cobalt-ink',
  // The stop button only (CLAUDE.md: red is for destructive actions and stop controls).
  'danger-outline': 'border-[1.5px] border-danger bg-card text-danger enabled:hover:bg-danger-tint',
};

const SIZES: Record<IconButtonSize, string> = {
  sm: 'size-9 rounded-row',
  md: 'size-10 rounded-control',
  round: 'size-[46px] rounded-full',
  stop: 'size-[46px] rounded-card',
};

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  /** Required: icon-only controls need an accessible name (SPEC §10). */
  'aria-label': string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
}

export function IconButton({
  icon,
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  title,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      title={title ?? rest['aria-label']}
      className={cx(
        'inline-flex flex-none items-center justify-center transition-tint',
        'disabled:cursor-not-allowed disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}

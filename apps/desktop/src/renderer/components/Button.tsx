import type { ComponentProps, ReactNode } from 'react';
import { cx } from '../lib/cx';

export type ButtonVariant =
  'primary' | 'secondary' | 'dark' | 'danger' | 'danger-outline' | 'ghost-dashed';

/** `sm` 40px header/toolbar · `inline` 36px chat · `md` 44–46px · `lg` 54px hero call to action. */
export type ButtonSize = 'inline' | 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'border-[1.5px] border-ink bg-cobalt text-card font-bold shadow-button ' +
    'enabled:hover:-translate-x-px enabled:hover:-translate-y-px enabled:hover:shadow-panel ' +
    'enabled:active:translate-x-0 enabled:active:translate-y-0 enabled:active:shadow-none',
  secondary:
    'border border-ink bg-card text-ink font-semibold enabled:hover:bg-paper enabled:active:bg-surface-2',
  dark: 'border-[1.5px] border-ink bg-ink text-card font-bold enabled:hover:bg-ink-2',
  // Destructive actions and stop controls only (CLAUDE.md).
  danger: 'border border-ink bg-danger text-card font-bold enabled:hover:bg-danger-ink',
  'danger-outline':
    'border-2 border-danger bg-card text-danger-ink font-bold enabled:hover:bg-danger-tint',
  'ghost-dashed':
    'border border-dashed border-ink-faint bg-card text-neutral-ink font-normal ' +
    'enabled:hover:border-ink enabled:hover:text-ink',
};

const SIZES: Record<ButtonSize, string> = {
  inline: 'min-h-9 px-3 text-[13px] rounded-row',
  sm: 'min-h-10 px-3 text-[13px] rounded-control',
  md: 'min-h-11 px-4 text-[14px] rounded-control',
  lg: 'min-h-[54px] px-6 text-[17px] rounded-card',
};

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap',
        'transition-[transform,box-shadow,background-color] duration-150 ease-out',
        'disabled:cursor-not-allowed disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

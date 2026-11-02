// The app's component styles as class strings, so links and buttons on the site look like
// apps/desktop's Button, Chip and Panel.

export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(' ');

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 text-center transition-[transform,box-shadow,background-color] duration-150 ease-out [text-shadow:none]';

/** Button variants, matching the app's (Button.tsx). */
export const button = {
  primary: cx(
    BUTTON_BASE,
    'border-[1.5px] border-ink bg-cobalt font-bold text-card shadow-button',
    'hover:-translate-x-px hover:-translate-y-px hover:shadow-panel active:translate-0 active:shadow-none',
  ),
  secondary: cx(
    BUTTON_BASE,
    'border-[1.5px] border-ink bg-card font-semibold text-ink hover:bg-paper active:bg-surface-2',
  ),
  dark: cx(BUTTON_BASE, 'border-[1.5px] border-ink bg-ink font-bold text-card hover:bg-ink-2'),
};

export const size = {
  sm: 'min-h-10 rounded-control px-3 text-[14px]',
  md: 'min-h-11 rounded-control px-4 text-[15px]',
  lg: 'min-h-[54px] rounded-card px-6 text-[17px]',
};

/** A card that paints its own surface, so the shapes behind never show through text. */
export const card = 'rounded-panel border-[1.5px] border-ink bg-card shadow-panel';

export type Tone = 'neutral' | 'mint' | 'cobalt' | 'sun' | 'lilac' | 'coral' | 'outline';

/** Chip tones (Chip.tsx). */
export const chip: Record<Tone, string> = {
  neutral: 'bg-neutral-tint text-neutral-ink',
  mint: 'bg-mint-tint text-mint-ink',
  cobalt: 'bg-cobalt-tint text-cobalt-deep',
  sun: 'bg-sun-tint text-sun-ink',
  lilac: 'bg-lilac-tint text-lilac-ink',
  coral: 'bg-coral-tint text-coral-ink',
  outline: 'border border-ink bg-card text-ink',
};

export const chipBase =
  'inline-flex items-center gap-1.5 self-start rounded-pill px-2.5 py-0.5 text-[13px] font-bold [text-shadow:none]';

export const link =
  'font-semibold text-cobalt-ink underline underline-offset-4 hover:text-cobalt-deep';

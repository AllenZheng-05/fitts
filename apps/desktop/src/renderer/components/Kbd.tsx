import { cx } from '../lib/cx';
import { shortcutLabel, type KeyName } from '../lib/platform';

interface KbdProps {
  /** `['mod', '.']` renders "⌘." on macOS and "Ctrl+." elsewhere. */
  keys: readonly KeyName[];
  className?: string;
}

export function Kbd({ keys, className }: KbdProps) {
  return <kbd className={cx('font-mono text-[12px]', className)}>{shortcutLabel(keys)}</kbd>;
}

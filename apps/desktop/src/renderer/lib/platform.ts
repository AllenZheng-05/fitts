import type { Platform } from '@fitts/schema';

export function platform(): Platform {
  return (globalThis as { fitts?: { platform?: Platform } }).fitts?.platform ?? 'win32';
}

export const isMac = (): boolean => platform() === 'darwin';

export type KeyName = 'mod' | 'shift' | 'alt' | (string & {});

const MAC: Record<string, string> = { mod: '⌘', shift: '⇧', alt: '⌥' };
const OTHER: Record<string, string> = { mod: 'Ctrl', shift: 'Shift', alt: 'Alt' };

/** `['mod', '.']` → "⌘." on macOS, "Ctrl+." elsewhere (SPEC §7.9). */
export function shortcutLabel(keys: readonly KeyName[]): string {
  if (isMac()) return keys.map((k) => MAC[k] ?? k).join('');
  return keys.map((k) => OTHER[k] ?? k).join('+');
}

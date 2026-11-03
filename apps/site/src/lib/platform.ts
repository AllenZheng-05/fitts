import type { Platform } from '../content/site';

/** The visitor's computer, or null on a phone or tablet (Fitts doesn't run there). */
export function detectPlatform(
  ua = navigator.userAgent,
  hint = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
    ?.platform,
): Platform | null {
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return null;
  const p = `${hint ?? ''} ${ua}`;
  if (/Mac/i.test(p)) return 'mac';
  if (/Win/i.test(p)) return 'windows';
  if (/Linux|X11|CrOS/i.test(p)) return 'linux';
  return null;
}

import type { Change } from '@fitts/schema';
import { copy } from '../copy';
import { useToasts } from '../state/toasts';
import { bridge } from './bridge';

/** "View PR": the pull request on GitHub, in the browser. A dry run has no page to open. */
export function openPr(change: Pick<Change, 'prUrl' | 'prNumber'>): void {
  const url = change.prUrl;
  if (url?.startsWith('https://') && bridge().openLink) bridge().openLink?.(url);
  else useToasts.getState().show(copy.items.prDryRun);
}

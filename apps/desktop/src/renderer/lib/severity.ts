import type { Severity } from '@fitts/schema';
import { copy } from '../copy';
import { format } from './format';

/** `short` "Sev 3" · `list` "Severity 3" · `detail` "Severity 3 · Major" (SPEC §5.1). */
export type SeverityForm = 'short' | 'list' | 'detail';

export function severityLabel(severity: Severity, form: SeverityForm): string {
  return format(copy.severity[form], { n: severity, name: copy.severity.names[severity] });
}

/** Tailwind classes for the badge: background + text, from the §5.1 severity table. */
export function severityTone(severity: Severity): string {
  switch (severity) {
    case 4:
      return 'bg-wine text-card';
    case 3:
      return 'bg-coral-tint text-coral-ink';
    case 2:
      return 'bg-sun-tint text-sun-ink';
    default:
      return 'bg-neutral-tint text-neutral-ink';
  }
}

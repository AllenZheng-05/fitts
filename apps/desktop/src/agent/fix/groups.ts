// Root-cause groups (SPEC-phase4 §7.5): findings that share a source line, a design token, or a
// probe problem across pages are one fix ("Fix 4 faint-text findings by changing --muted").
// The approval card offers them together, with counts. Pure.
import type { Finding } from '@fitts/schema';

export interface RootCause {
  /** What they share, for the card: "src/styles.css:12", "--muted", "Text is hard to read". */
  key: string;
  kind: 'source' | 'token' | 'problem';
  findingIds: string[];
}

/** A CSS custom property named in a finding's evidence or fix ("--muted"). */
const tokenOf = (f: Finding): string | undefined =>
  /(--[a-z][\w-]*)/i.exec([f.fix, ...f.evidence].join(' '))?.[1];

/**
 * Groups of two or more open findings by shared root cause, strongest first: the same source
 * line, then the same token, then the same probe problem (title) on different pages. A finding
 * joins at most one group.
 */
export function rootCauses(
  findings: Finding[],
  problemOf: (f: Finding) => string | undefined,
): RootCause[] {
  const open = findings.filter((f) => f.status === 'open' && (f.lane ?? 'shown') === 'shown');
  const taken = new Set<string>();
  const out: RootCause[] = [];
  const add = (kind: RootCause['kind'], keyOf: (f: Finding) => string | undefined) => {
    const by = new Map<string, Finding[]>();
    for (const f of open) {
      if (taken.has(f.id)) continue;
      const k = keyOf(f);
      if (k) by.set(k, [...(by.get(k) ?? []), f]);
    }
    for (const [key, list] of by) {
      if (list.length < 2) continue;
      // The same problem counts only across different pages (one page's twins are one finding).
      if (kind === 'problem' && new Set(list.map((f) => f.route)).size < 2) continue;
      for (const f of list) taken.add(f.id);
      out.push({ key, kind, findingIds: list.map((f) => f.id) });
    }
  };
  add('source', (f) =>
    f.source && f.source.confidence !== 'model' ? `${f.source.file}:${f.source.line}` : undefined,
  );
  add('token', tokenOf);
  add('problem', problemOf);
  return out.sort((a, b) => b.findingIds.length - a.findingIds.length);
}

// The owner's rules, applied (SPEC-phase4 §4.3): a dismissal becomes a `not-a-problem` rule
// that keeps the same finding out of the shown lane next run; an owner's report becomes an
// `is-a-problem` rule; "this matters more" a `severity` rule. Matching is by what the finding
// is (its probe and title), and, when the owner meant one element, where it is.
import type { Finding, MemoryRule, ProbeName, ProjectMemory } from '@fitts/schema';

/** The key a rule matches a finding on: the probe and the title (reviewer findings: title). */
export const titleKeyOf = (f: Pick<Finding, 'title'>, probe?: ProbeName): string =>
  `${probe ?? ''}|${f.title.trim().toLowerCase()}`;

/** A rule for a finding the owner dismissed (or reported, or re-weighed). */
export function ruleFor(
  kind: MemoryRule['kind'],
  f: Finding,
  probe: ProbeName | undefined,
  reason: string,
  runId: string,
  delta?: 1 | -1,
): MemoryRule {
  // One element's problem stays on that element; a site-wide one (no element) matches by kind.
  const specific = Boolean(f.elementRef);
  return {
    id: `${kind}:${titleKeyOf(f, probe)}${specific ? `@${f.route}` : ''}`.slice(0, 200),
    kind,
    match: {
      ...(probe ? { probe } : {}),
      titleKey: titleKeyOf(f, probe),
      ...(specific ? { route: f.route } : {}),
      ...(specific && f.source ? { src: f.source.file } : {}),
    },
    reason: reason.trim().slice(0, 200),
    ...(delta ? { delta } : {}),
    at: new Date().toISOString(),
    runId,
  };
}

/** Whether a rule is about this finding. */
export function matches(rule: MemoryRule, f: Finding, probe: ProbeName | undefined): boolean {
  const m = rule.match;
  if (m.titleKey && m.titleKey !== titleKeyOf(f, probe)) return false;
  if (m.probe && m.probe !== probe) return false;
  if (m.route && m.route !== f.route && !(f.locations ?? []).some((l) => l.route === m.route))
    return false;
  if (m.src && f.source && m.src !== f.source.file) return false;
  if (m.text && !`${f.title} ${f.finding}`.toLowerCase().includes(m.text.toLowerCase()))
    return false;
  return true;
}

/**
 * Applies the owner's rules to fresh findings: a `not-a-problem` match moves the finding to
 * the `owner-ok` lane with the owner's reason; a `severity` match shifts its severity. The
 * guarantee (§14): a matching finding is never posted, pinned or fixed.
 */
export function applyRules(
  findings: Finding[],
  memory: ProjectMemory | undefined,
  probeOf: (f: Finding) => ProbeName | undefined,
): Finding[] {
  if (!memory || memory.rules.length === 0) return findings;
  return findings.map((f) => {
    const probe = probeOf(f);
    let next = f;
    for (const rule of memory.rules) {
      if (!matches(rule, f, probe)) continue;
      if (rule.kind === 'not-a-problem')
        next = { ...next, lane: 'owner-ok', ownerReason: rule.reason };
      else if (rule.kind === 'severity' && rule.delta)
        next = {
          ...next,
          severity: Math.max(1, Math.min(4, next.severity + rule.delta)) as Finding['severity'],
        };
    }
    return next;
  });
}

/** One line for the decider and the run's first message. */
export function memoryLine(memory: ProjectMemory | undefined): string | undefined {
  if (!memory) return undefined;
  const n = memory.rules.length + memory.likes.length + memory.dislikes.length;
  if (n === 0) return undefined;
  const notProblems = memory.rules.filter((r) => r.kind === 'not-a-problem').length;
  const problems = memory.rules.filter((r) => r.kind === 'is-a-problem').length;
  const parts = [
    notProblems
      ? `${notProblems} ${notProblems === 1 ? 'thing' : 'things'} you said ${notProblems === 1 ? 'isn’t' : 'aren’t'} a problem`
      : '',
    problems ? `${problems} ${problems === 1 ? 'problem' : 'problems'} you reported` : '',
    memory.likes.length
      ? `${memory.likes.length} ${memory.likes.length === 1 ? 'like' : 'likes'}`
      : '',
    memory.dislikes.length
      ? `${memory.dislikes.length} ${memory.dislikes.length === 1 ? 'dislike' : 'dislikes'}`
      : '',
  ].filter(Boolean);
  return parts.join(', ');
}

/** What the reviewers are told, as calibration (never a veto). */
export function memoryForReviewers(memory: ProjectMemory | undefined): string[] {
  if (!memory) return [];
  const out: string[] = [];
  const fine = memory.rules.filter((r) => r.kind === 'not-a-problem');
  if (fine.length)
    out.push(
      `The owner has said these are not problems here (don't report them again): ${fine
        .slice(0, 12)
        .map((r) => `“${r.match.titleKey?.split('|')[1] ?? r.id}” (${r.reason})`)
        .join('; ')}.`,
    );
  const cares = memory.rules.filter((r) => r.kind === 'is-a-problem');
  if (cares.length)
    out.push(
      `The owner cares about: ${cares
        .slice(0, 8)
        .map((r) => r.reason || r.match.titleKey?.split('|')[1] || r.id)
        .join('; ')}.`,
    );
  if (memory.likes.length) out.push(`The owner likes: ${memory.likes.slice(0, 6).join('; ')}.`);
  if (memory.dislikes.length)
    out.push(`The owner doesn't want: ${memory.dislikes.slice(0, 6).join('; ')}.`);
  return out;
}

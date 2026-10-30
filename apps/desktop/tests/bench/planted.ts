// `pnpm bench:chat` scoring (SPEC-phase2 §3.1, demo/chat/PLANTED.md): a finding matches a planted
// issue when its route, locations or element match the issue's place **and** its text names the
// same problem. One finding matches one issue at most, and each issue counts once (a maximum
// matching). Precision counts shown findings at severity ≥ 2 that match nothing.
import type { Finding } from '@fitts/schema';

export interface Planted {
  n: number;
  issue: string;
  /** Routes the issue lives on; 'all' for site-wide issues. */
  routes: string[] | 'all';
  refs: string[];
  /** Words a finding about this issue uses (title, finding, evidence; lowercase). */
  words: RegExp;
}

export const PLANTED: Planted[] = [
  {
    n: 1,
    issue: 'Recipient shows "(null)" on step 2',
    routes: ['/compose/recipient'],
    refs: ['compose-to'],
    words: /\(null\)|\bnull\b|leak|missing value/,
  },
  {
    n: 2,
    issue: 'One action labeled NEXT / Send Text / Create Message',
    routes: ['/compose', '/compose/recipient', '/compose/confirm'],
    refs: ['compose-next', 'compose-create', 'compose-send', 'compose-next-1'],
    words: /label|named|wording|inconsistent|different (words|labels|names)|same action/,
  },
  {
    n: 3,
    issue: 'No confirmation after sending',
    routes: ['/compose/confirm'],
    refs: ['compose-send'],
    words: /confirm|nothing says|no sign|no feedback|whether it (was )?sent/,
  },
  {
    n: 4,
    issue: 'Browser back on step 2 loses the draft',
    routes: ['/compose/recipient', '/compose'],
    refs: ['compose-body'],
    words: /back.*(lose|lost|gone|throws|wipe)|draft|what you typed/,
  },
  {
    n: 5,
    issue: 'No back/cancel control in compose',
    routes: ['/compose', '/compose/recipient', '/compose/confirm'],
    refs: [],
    words: /(no|missing|without) (a )?(back|cancel)|back or cancel|way back/,
  },
  {
    n: 6,
    issue: 'Recipient chosen on step 1 not shown on step 2',
    routes: ['/compose/recipient'],
    refs: ['compose-to'],
    words: /recipient|who (it'?s|you'?re) (for|sending)|recogni|remember/,
  },
  {
    n: 7,
    issue: 'Send target 28×20px',
    routes: ['/compose/confirm'],
    refs: ['compose-send'],
    words: /small|tiny|target|tap area|hard to (hit|tap|reach)/,
  },
  {
    n: 8,
    issue: 'Placeholder text contrast about 2.6:1',
    routes: ['/compose/recipient'],
    refs: ['compose-body'],
    words: /contrast|faint|placeholder/,
  },
  {
    n: 9,
    issue: 'Timestamp text #BBB on white',
    routes: ['/'],
    refs: [],
    words: /contrast|faint|light gr[ae]y|hard to read/,
  },
  {
    n: 10,
    issue: 'Search sends a request on every keystroke',
    routes: ['/search'],
    refs: ['search-input'],
    words: /keystroke|debounce|every key|each key/,
  },
  {
    n: 11,
    issue: 'Repeat search re-fetches, no cache headers',
    routes: ['/search'],
    refs: ['search-input'],
    words: /cache|re-?fetch|repeat/,
  },
  {
    n: 12,
    issue: 'Search returns 20,000 items, no pagination',
    routes: ['/search'],
    refs: ['search-input'],
    words: /too large|20,?000|paginat|payload|\bmb\b|all at once/,
  },
  {
    n: 13,
    issue: 'No loading indicator during the 1.5s search',
    routes: ['/search'],
    refs: ['search-input'],
    words: /loading|spinner|indicator|progress/,
  },
  {
    n: 14,
    issue: 'Empty send shows "Error 0x3F"',
    routes: ['/compose/confirm'],
    refs: ['compose-send', 'compose-error'],
    words: /0x3f|error code|raw (error|code)|error (message|is)/,
  },
  {
    n: 15,
    issue: 'Validation error clears the whole form',
    routes: ['/contacts'],
    refs: ['contacts-add'],
    words: /clear|wipe|lose|lost|erase|start over/,
  },
  {
    n: 16,
    issue: '"Delete conversation" deletes instantly',
    routes: ['/contacts/grandma'],
    refs: ['thread-delete'],
    words: /delete|undo|without (asking|confirm)/,
  },
  {
    n: 17,
    issue: 'Icon-only buttons with no accessible name',
    routes: ['/contacts/grandma'],
    refs: ['thread-call', 'thread-video'],
    words: /accessible name|no (text )?label|screen reader|icon/,
  },
  {
    n: 18,
    issue: 'Three date formats across screens',
    routes: ['/', '/contacts/grandma', '/search'],
    refs: [],
    words: /date/,
  },
  { n: 19, issue: 'Three font families', routes: 'all', refs: [], words: /font|typeface/ },
  {
    n: 20,
    issue: 'Off-grid, inconsistent padding',
    routes: 'all',
    refs: [],
    words: /spacing|padding|margin|grid/,
  },
  {
    n: 21,
    issue: 'Settings has 14 ungrouped toggles',
    routes: ['/settings'],
    refs: ['settings-list'],
    words: /toggle|group|too many|long list|switches/,
  },
  {
    n: 22,
    issue: 'Jargon "Initialize thread"',
    routes: ['/contacts/grandma'],
    refs: ['thread-message'],
    words: /jargon|initiali[sz]e|technical/,
  },
  { n: 23, issue: 'Focus outline removed globally', routes: 'all', refs: [], words: /focus/ },
  {
    n: 24,
    issue: 'Help link returns 404',
    routes: ['/'],
    refs: ['inbox-help'],
    words: /404|missing page|broken|dead end|doesn.t (load|exist)/,
  },
  {
    n: 25,
    issue: 'Contacts page has no empty state',
    routes: ['/contacts'],
    refs: ['contacts-list'],
    words: /empty|no (results|matches)|nothing (shows|appears)|blank/,
  },
];

const textOf = (f: Finding) => [f.title, f.finding, ...f.evidence].join(' ').toLowerCase();

export function matches(f: Finding, p: Planted): boolean {
  const routes = new Set([f.route, ...(f.locations ?? []).map((l) => l.route)]);
  const placed =
    p.routes === 'all' ||
    p.routes.some((r) => routes.has(r)) ||
    (f.elementRef !== undefined && p.refs.includes(f.elementRef));
  return placed && p.words.test(textOf(f));
}

export interface BenchScore {
  matched: { planted: Planted; finding: Finding }[];
  missed: Planted[];
  falsePositives: Finding[];
  recall: number;
  shown: number;
  suggestions: number;
}

/** Maximum one-to-one matching of shown findings to planted issues (augmenting paths). */
export function score(findings: Finding[]): BenchScore {
  const shown = findings.filter((f) => f.lane !== 'suggestion');
  const owner = new Map<number, number>(); // planted n → finding index
  const tryAssign = (fi: number, seen: Set<number>): boolean => {
    const f = shown[fi];
    if (!f) return false;
    for (const p of PLANTED) {
      if (seen.has(p.n) || !matches(f, p)) continue;
      seen.add(p.n);
      const current = owner.get(p.n);
      if (current === undefined || tryAssign(current, seen)) {
        owner.set(p.n, fi);
        return true;
      }
    }
    return false;
  };
  shown.forEach((_, i) => tryAssign(i, new Set()));
  const used = new Set(owner.values());
  const matched = PLANTED.filter((p) => owner.has(p.n)).map((p) => ({
    planted: p,
    finding: shown[owner.get(p.n) ?? 0] as Finding,
  }));
  return {
    matched,
    missed: PLANTED.filter((p) => !owner.has(p.n)),
    falsePositives: shown.filter((f, i) => !used.has(i) && f.severity >= 2),
    recall: matched.length / PLANTED.length,
    shown: shown.length,
    suggestions: findings.length - shown.length,
  };
}

export function report(s: BenchScore): string {
  const lines = [
    `Recall ${s.matched.length}/${PLANTED.length} (${Math.round(s.recall * 100)}%) · false positives at severity ≥2: ${s.falsePositives.length} · shown ${s.shown}, suggestions ${s.suggestions}`,
    ...s.missed.map((p) => `  missed #${p.n}: ${p.issue}`),
    ...s.falsePositives.map(
      (f) =>
        `  false positive: [${f.severity}] ${f.title} (${f.route}${f.elementRef ? ` #${f.elementRef}` : ''})`,
    ),
  ];
  return lines.join('\n');
}

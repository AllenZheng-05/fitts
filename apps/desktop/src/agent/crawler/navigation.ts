// Navigation and redirects (SPEC-phase4 §6B.4): pure checks over what the crawl recorded. Each
// returns probe items for the 'navigation' probe (findings with a template and a severity) or
// nothing; name-only guesses are never findings (they're notes for the reviewers).
import type { ProbeItem } from '@fitts/schema';
import { routeOf } from './coverage';

const LOGIN = /\/(log-?in|sign-?in|auth|account\/login)\b/i;

const item = (ref: string, selector: string, measured: string, expected: string): ProbeItem => ({
  ref,
  selector,
  measured,
  expected,
});

/**
 * A control went somewhere other than where its own code or href says (H4, severity 3). The
 * expected destination comes from the anchor's href or the App Model's static target for the
 * control's call site; without one, there's nothing to check.
 */
export function wrongPlace(click: {
  ref: string;
  name: string;
  expected?: string;
  arrived: string;
  /** The hops the click caused: a redirect to the expected page's own login isn't "wrong". */
  redirects?: string[];
  /**
   * The page it was clicked on: a click that stayed there went nowhere, not somewhere wrong (a
   * click that missed a control that moved; "does nothing visible" covers a dead link).
   * Basil & Ember, Nov 3: "Hours & directions" "went to" the page it was on.
   */
  from?: string;
}): ProbeItem | null {
  if (!click.expected) return null;
  const want = routeOf(click.expected);
  const got = routeOf(click.arrived);
  if (want === got) return null;
  if (click.from !== undefined && routeOf(click.from) === got) return null;
  if (LOGIN.test(got) && (click.redirects ?? []).some((h) => routeOf(h) === want)) return null;
  return item(
    click.ref,
    '',
    `"${click.name}" went to ${got} (its link says ${want})`,
    `"${click.name}" opens ${want}`,
  );
}

/** Redirect chains (§6B.4): too long, a loop, an unexpected login, or a lost query or hash. */
export function chainProblems(chain: {
  from: string;
  hops: string[];
  /** The App Model marks the page as needing a login. */
  gated?: boolean;
}): ProbeItem[] {
  const out: ProbeItem[] = [];
  const all = [chain.from, ...chain.hops];
  const seen = new Set<string>();
  let loop: string | undefined;
  for (const u of all) {
    const key = u.replace(/\/+$/, '') || '/';
    if (seen.has(key)) {
      loop = key;
      break;
    }
    seen.add(key);
  }
  if (loop)
    out.push(
      item('', '', `${chain.from} redirects in a loop through ${loop}`, 'one redirect at most'),
    );
  else if (chain.hops.length > 2)
    out.push(
      item(
        '',
        '',
        `${chain.from} takes ${chain.hops.length} redirects (${chain.hops.join(' → ')})`,
        'at most 2 redirects',
      ),
    );
  const last = chain.hops.at(-1);
  if (last && LOGIN.test(routeOf(last)) && !chain.gated && !LOGIN.test(routeOf(chain.from)))
    out.push(
      item(
        '',
        '',
        `${routeOf(chain.from)} sends people to log in (${routeOf(last)}), though nothing on it needs an account`,
        'the page opens without a login',
      ),
    );
  const query = (u: string) => (u.includes('?') ? (u.split('?')[1]?.split('#')[0] ?? '') : '');
  const hash = (u: string) => (u.includes('#') ? (u.split('#')[1] ?? '') : '');
  if (last && ((query(chain.from) && !query(last)) || (hash(chain.from) && !hash(last))))
    out.push(
      item(
        '',
        '',
        `the redirect from ${chain.from} drops its ${query(chain.from) ? 'query' : 'anchor'}`,
        'the address kept as it was',
      ),
    );
  return out;
}

/** Back after a redirect lands on the redirecting address and is sent forward again (H3). */
export function backTrap(b: {
  redirectedFrom: string;
  afterBack: string;
  arrived: string;
}): ProbeItem | null {
  if (routeOf(b.afterBack) !== routeOf(b.arrived)) return null;
  return item(
    '',
    '',
    `Back from ${routeOf(b.arrived)} goes to ${routeOf(b.redirectedFrom)}, which sends you straight back`,
    'Back leaves the page',
  );
}

/** A page loaded fresh (a refresh or a deep link) that breaks (severity 3). */
export function refreshProblem(r: {
  route: string;
  status: number;
  /** Characters of visible text in main (or body). */
  mainText: number;
  /** An error boundary's or framework's error text on the page. */
  errorText?: string;
  headings: string[];
  /** The headings when the crawl reached it by clicking. */
  expectedHeadings: string[];
  /** The App Model says the page needs earlier steps (dynamic, gate: data): a note, not a finding. */
  needsFlow?: boolean;
}): ProbeItem | null {
  // A page inside a flow may send people back to its start (a note, not a finding); a blank
  // page or an error is never "somewhere sensible".
  const blank = r.status >= 400 || Boolean(r.errorText) || r.mainText < 20;
  if (r.needsFlow && !blank) return null;
  const why =
    r.status >= 400
      ? `answers ${r.status}`
      : r.errorText
        ? `shows "${r.errorText.slice(0, 60)}"`
        : r.mainText < 20
          ? 'shows a blank page'
          : r.expectedHeadings.length > 0 && !r.expectedHeadings.some((h) => r.headings.includes(h))
            ? `shows a different page (${r.headings[0] ?? 'no heading'})`
            : null;
  if (!why) return null;
  return item('', '', `refreshing ${r.route} ${why}`, `${r.route} loads on its own`);
}

const NOT_FOUND = /not found|404|doesn.t exist|no such page|page (is )?missing|can.t find/i;

/** Unknown addresses that show the home page as if they existed (H9, severity 2). */
export function soft404(s: {
  path: string;
  status: number;
  headings: string[];
  homeHeadings: string[];
  text: string;
}): ProbeItem | null {
  if (s.status >= 400 || NOT_FOUND.test(s.text)) return null;
  const same = s.homeHeadings.length > 0 && s.homeHeadings.every((h) => s.headings.includes(h));
  if (!same) return null;
  return item(
    '',
    '',
    `${s.path} (an address that doesn't exist) shows the home page with status ${s.status}`,
    'a page that says it doesn’t exist',
  );
}

/** The navigation problems' kinds, by what was measured (titles and severities key on these). */
export function navigationKind(
  measured: string,
): 'wrong-place' | 'loop' | 'chain' | 'login' | 'dropped' | 'back-trap' | 'refresh' | 'soft-404' {
  if (/ went to .* \(its link says /.test(measured)) return 'wrong-place';
  if (measured.includes('redirects in a loop')) return 'loop';
  if (/ takes \d+ redirects/.test(measured)) return 'chain';
  if (measured.includes('sends people to log in')) return 'login';
  if (measured.includes('the redirect from')) return 'dropped';
  if (measured.startsWith('Back from')) return 'back-trap';
  if (measured.startsWith('refreshing ')) return 'refresh';
  return 'soft-404';
}

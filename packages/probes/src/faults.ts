// state_pass (SPEC-phase4 §6B.6): how one of the site's own GET responses is rewritten to see
// the page empty, failing or slow. Only GET, only the project's own origin on localhost, only
// during the pass; writes are never faked. Pure: main applies the result through CDP Fetch.

export type FaultCase = 'empty' | 'error' | 'slow';

export interface Rewrite {
  status: number;
  body: string;
  /** Hold the response this long first (the slow case continues it unchanged). */
  delayMs?: number;
  /** Continue the original response (after the delay). */
  passThrough?: boolean;
}

/** May this request be rewritten at all? */
export function faultable(req: { method: string; url: string }, siteOrigin: string): boolean {
  if (req.method.toUpperCase() !== 'GET') return false;
  try {
    const u = new URL(req.url);
    const site = new URL(siteOrigin);
    const local = site.hostname === 'localhost' || site.hostname === '127.0.0.1';
    return local && u.origin === site.origin;
  } catch {
    return false;
  }
}

/** Arrays become []; an object's array fields (one level down) become []. */
export function emptied(json: unknown): unknown {
  if (Array.isArray(json)) return [];
  if (json && typeof json === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(json as Record<string, unknown>))
      out[k] = Array.isArray(v) ? [] : v;
    return out;
  }
  return json;
}

/** The response for a case, given the original body (JSON text when the endpoint returns JSON). */
export function rewrite(fault: FaultCase, original: { status: number; body: string }): Rewrite {
  if (fault === 'error') return { status: 500, body: '{"error":"fitts-test"}' };
  if (fault === 'slow')
    return { status: original.status, body: original.body, delayMs: 3000, passThrough: true };
  try {
    return { status: original.status, body: JSON.stringify(emptied(JSON.parse(original.body))) };
  } catch {
    // Not JSON: an empty body says the same thing.
    return { status: original.status, body: '' };
  }
}

/** What the state is called in the chat and the reviewers' evidence. */
export function faultLabel(fault: FaultCase, endpoint: string): string {
  const what = endpoint.replace(/^\/api\//, '').replace(/[/?].*$/, '') || endpoint;
  return fault === 'empty'
    ? `when ${what} comes back empty`
    : fault === 'error'
      ? `when ${what} fails`
      : `when ${what} takes 3 s`;
}

/** The page after the error case: blank, crashed, or an error boundary (H9, severity 3). */
export function brokenOnError(page: {
  mainText: number;
  errorText?: string;
  uncaught: number;
}): string | null {
  if (page.uncaught > 0) return 'crashes (an uncaught error)';
  if (page.errorText) return `shows "${page.errorText.slice(0, 60)}"`;
  if (page.mainText < 20) return 'goes blank';
  return null;
}

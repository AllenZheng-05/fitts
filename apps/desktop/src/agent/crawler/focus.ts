// The owner's pivot (Allen, Nov 4): "stay on checkout" keeps the crawl on the pages it names
// until they say otherwise or those pages are covered. Read from the words, in code: the decider
// heard "stay on checkout", said so, and the explore frontier still opened "/*" five more times.
import { isPattern } from './coverage';

/** Words that steer the crawl to a part of the site ("keep going" isn't one). */
const STEER =
  /\b(?:focus(?:ing)? on|stay (?:on|in|with)|stick (?:to|with)|keep (?:to|on|testing)|only (?:test|look at|check)|just (?:test|look at|check|do)|concentrate on|look (?:only )?at|go (?:to|back to)|switch to|move on to)\b/i;
/** Words that lift a focus. */
const LIFT =
  /\b(?:anywhere|everywhere|whole site|entire site|rest of the site|all (?:the )?pages|explore (?:freely|everything|the rest)|you can move on)\b/i;

export type Pivot = { focus: string[] } | { lift: true } | undefined;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The words a page goes by: its last path segment ("order-status" → "order status"), its title. */
function namesOf(page: { route: string; title?: string }): string[] {
  if (page.route === '/') return ['home', 'homepage'];
  const last = page.route.split('/').filter(Boolean).at(-1) ?? '';
  return [last.replace(/[-_]+/g, ' '), page.title ?? ''].map((n) => n.trim()).filter(Boolean);
}

/** What the owner's message does to the crawl's scope: names pages to keep to, lifts it, or neither. */
export function pivotFrom(message: string, pages: { route: string; title?: string }[]): Pivot {
  if (LIFT.test(message)) return { lift: true };
  if (!STEER.test(message)) return undefined;
  const focus = pages
    .filter((p) => !isPattern(p.route))
    .filter((p) =>
      namesOf(p).some((n) =>
        new RegExp(`\\b${escape(n.toLowerCase()).replace(/ /g, '[\\s-]+')}(?:s|es)?\\b`, 'i').test(
          message,
        ),
      ),
    )
    .map((p) => p.route);
  return focus.length ? { focus: [...new Set(focus)] } : undefined;
}

/**
 * A request to do something on the site, said as an instruction: "Fill in name, phone and a
 * pickup time and place the order", "can you add a margherita to the cart and check out". The
 * run does it as a task, in code: the decider was told to and picked another journey instead
 * (Allen, Nov 4, validation run 2). Design feedback ("add a skip link", "make it bigger") and
 * questions ("why can't I place an order?") aren't requests to act.
 */
const DO = new RegExp(
  [
    '^(?:(?:ok(?:ay)?|now|so|then|next|alright|fitts)[,.!\\s]+)*',
    "(?:(?:can|could|would|will) you\\s+|go ahead and\\s+|try (?:to\\s+)?|i(?:'d| would) like you to\\s+|i want you to\\s+)?",
    '(?:please\\s+)?',
    '(?:fill (?:in|out)|place (?:an?|the|my)(?: test)? (?:\\w+ ){0,2}(?:order|booking|reservation)\\b|order (?:an?|the|some|two|one|\\d)\\b|book (?:an?|the)\\b|reserve (?:an?|the)\\b|submit (?:the|my|it)\\b|sign (?:up|in)\\b|log ?in\\b|check ?out\\b|complete (?:the|my|an?)\\b|buy\\b|enter (?:my|a|the|some)\\b|(?:pick|choose|select) (?:an?|the)\\b|add (?:.{1,60}) to (?:the |my )?(?:cart|order|bag|basket)\\b)',
  ].join(''),
  'i',
);

/** The owner's words when they ask Fitts to do something on the site, else undefined. */
export function taskFrom(message: string): string | undefined {
  const text = message.trim();
  return DO.test(text) ? text.slice(0, 300) : undefined;
}

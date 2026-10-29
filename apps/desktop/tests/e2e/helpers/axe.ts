import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * Fails on any serious or critical axe violation (SPEC §12). Legacy mode runs axe inside
 * the page; the default mode opens a second page, which Electron does not support.
 *
 * The mock "your site" is excluded: it stands in for the user's website, which ships with
 * deliberate usability flaws for Fitts to find (see DECISIONS.md, M4).
 */
export async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .setLegacyMode(true)
    .exclude('[data-mock-site]')
    .analyze();
  const blocking = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help} · ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
    );
  expect(blocking, blocking.join('\n')).toEqual([]);
}

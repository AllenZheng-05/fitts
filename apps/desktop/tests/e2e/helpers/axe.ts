import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * Fails on any serious or critical axe violation (SPEC §12). Legacy mode runs axe inside
 * the page; the default mode opens a second page, which Electron does not support.
 */
export async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).setLegacyMode(true).analyze();
  const blocking = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help} · ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
    );
  expect(blocking, blocking.join('\n')).toEqual([]);
}

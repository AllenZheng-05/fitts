import { describe, expect, it } from 'vitest';
import {
  axeRuleUrl,
  axeStandards,
  PROBE_STANDARDS,
  probeStandards,
  scFromAxeTag,
  WCAG,
} from '../src/standards';

describe('standards (SPEC-phase4 §5.1)', () => {
  it('maps every probe to criteria that exist in the table, or explicitly to none', () => {
    for (const [probe, scs] of Object.entries(PROBE_STANDARDS)) {
      if (scs === null) continue;
      for (const sc of scs) expect(WCAG[sc], `${probe} → ${sc}`).toBeDefined();
    }
    expect(probeStandards('contrast')).toEqual([
      expect.objectContaining({
        sc: '1.4.3',
        name: 'Contrast (Minimum)',
        url: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum',
      }),
    ]);
    expect(probeStandards('target-size')[0]?.sc).toBe('2.5.8');
    expect(probeStandards('focus-visible')[0]?.sc).toBe('2.4.7');
    expect(probeStandards('viewport-sweep')[0]?.sc).toBe('1.4.10');
    expect(probeStandards('placeholder-leak')).toEqual([]);
  });

  it('reads criteria from axe tags and knows Deque’s rule pages', () => {
    expect(scFromAxeTag('wcag143')).toBe('1.4.3');
    expect(scFromAxeTag('wcag1410')).toBe('1.4.10');
    expect(scFromAxeTag('wcag2aa')).toBeUndefined();
    expect(axeStandards(['cat.color', 'wcag2aa', 'wcag143', 'wcag143']).map((c) => c.sc)).toEqual([
      '1.4.3',
    ]);
    expect(axeRuleUrl('image-alt')).toBe('https://dequeuniversity.com/rules/axe/4.10/image-alt');
    expect(axeRuleUrl('image-alt', 'https://x/y')).toBe('https://x/y');
  });
});

// A copyable Playwright test per finding (SPEC-phase4 §5.3): the device from the cell, locators
// by test id, role and name, or text, and an assertion where the oracle has one. Fitts doesn't
// run it (no bundled browsers); it goes in the Finding panel, the PR and the report.
import type { DeviceCell, Finding, ProbeItem, ProbeName, Repro } from '@fitts/schema';

const q = (s: string) => JSON.stringify(s);

/** A locator for a step's target: test id first, then role and name, then text. */
export function locator(
  target: { role: string; name: string; testId?: string } | undefined,
  fallbackSelector?: string,
): string {
  if (target?.testId) return `page.getByTestId(${q(target.testId)})`;
  if (target?.name && target.role && target.role !== 'generic' && target.role !== 'element')
    return `page.getByRole(${q(ariaRole(target.role))}, { name: ${q(target.name)} })`;
  if (target?.name) return `page.getByText(${q(target.name)}, { exact: true })`;
  if (fallbackSelector) return `page.locator(${q(fallbackSelector)})`;
  return `page.locator('body')`;
}

/** The crawler's role names → Playwright's ARIA roles. */
function ariaRole(role: string): string {
  const map: Record<string, string> = {
    textbox: 'textbox',
    combobox: 'combobox',
    searchbox: 'searchbox',
    button: 'button',
    link: 'link',
    checkbox: 'checkbox',
    radio: 'radio',
    switch: 'switch',
    tab: 'tab',
    menuitem: 'menuitem',
    option: 'option',
  };
  return map[role] ?? role;
}

/** A key name Playwright knows ("Enter", "Shift+Tab", "a"), not a description of keys. */
const KEY =
  /^(?:(?:Control|Shift|Alt|Meta|ControlOrMeta)\+)*(?:[\x21-\x7e]|F\d{1,2}|Enter|Tab|Escape|Backspace|Delete|Space|Insert|Home|End|PageUp|PageDown|Arrow(?:Up|Down|Left|Right))$/;

/**
 * The line that performs a repro step. A reviewer's step in its own words ("Press Tab through
 * header links") is a comment to do by hand, never a key name or a URL (Basil & Ember, Nov 4).
 */
export function stepCode(step: Repro['steps'][number]): string {
  const text = step.text.replace(/\*\*/g, '');
  const byHand = `// By hand: ${text.replace(/\s+/g, ' ')}`;
  if (/^Open /.test(text)) {
    const url = text.slice('Open '.length).trim();
    return /^(?:https?:\/\/|\/)\S*$/.test(url) && !/\*|\/:/.test(url)
      ? `await page.goto(${q(url)});`
      : byHand;
  }
  if (/^Go back/.test(text)) return 'await page.goBack();';
  if (/^Press /.test(text)) {
    const key = text.slice('Press '.length).trim();
    return KEY.test(key) ? `await page.keyboard.press(${q(key)});` : byHand;
  }
  // A step with no control behind it is the reviewer's words: clicking the body does nothing.
  if (!step.target) return byHand;
  const loc = locator(step.target);
  const typed = /^Type “(.*)” in /.exec(text);
  if (typed) return `await ${loc}.fill(${q(typed[1] ?? '')});`;
  if (/^Type anything in /.test(text)) return `await ${loc}.fill('fitts-test message');`;
  return `await ${loc}.click();`;
}

/** The assertion for a probe oracle, or a fixme with the expectation in a comment. */
export function assertion(
  probe: ProbeName | undefined,
  item: ProbeItem | undefined,
  repro: Repro,
  finding: Finding,
): { lines: string[]; fixme: boolean } {
  const target = item?.ref
    ? `page.getByTestId(${q(item.ref)})`
    : locator(undefined, item?.selector);
  switch (probe) {
    case 'contrast':
      return {
        fixme: false,
        lines: [
          `// Text contrast (WCAG 1.4.3): the element's color against what's behind it.`,
          `const contrast = await ${target}.evaluate((el) => {`,
          '  const parse = (css) => { const m = /rgba?\\(([^)]+)\\)/.exec(css); if (!m) return null; const [r, g, b, a = 1] = m[1].split(",").map(Number); return { r, g, b, a }; };',
          '  const lum = (c) => { const ch = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b); };',
          '  let bg = null; for (let n = el; n && !bg; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) bg = c; }',
          '  bg ??= { r: 255, g: 255, b: 255, a: 1 }; const fg = parse(getComputedStyle(el).color) ?? { r: 0, g: 0, b: 0, a: 1 };',
          '  const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05);',
          '});',
          `expect(contrast).toBeGreaterThanOrEqual(${/placeholder/.test(item?.measured ?? '') ? 4.5 : /at least 3/.test(item?.expected ?? '') ? 3 : 4.5});`,
        ],
      };
    case 'target-size':
      return {
        fixme: false,
        lines: [
          `// Tap target size (WCAG 2.5.8): at least 24×24 CSS px.`,
          `const box = await ${target}.boundingBox();`,
          'expect(box).not.toBeNull();',
          'expect(Math.min(box?.width ?? 0, box?.height ?? 0)).toBeGreaterThanOrEqual(24);',
        ],
      };
    case 'placeholder-leak':
      return {
        fixme: false,
        lines: [
          '// No template leak on screen: no "(null)", "undefined" or "NaN" in what people read.',
          `await expect(${target}).not.toHaveText(/\\((?:null|undefined)\\)|\\bundefined\\b|\\bNaN\\b|^null$/);`,
        ],
      };
    case 'button-name':
    case 'link-name':
      return {
        fixme: false,
        lines: [
          `// An accessible name (WCAG 4.1.2): text, aria-label or a labelled image.`,
          `const name = await ${target}.evaluate((el) => (el.getAttribute('aria-label') || el.textContent || el.querySelector('img')?.getAttribute('alt') || '').trim());`,
          'expect(name).not.toBe("");',
        ],
      };
    case 'links': {
      const href = item?.measured.split(' ')[0] ?? repro.start.url;
      return {
        fixme: false,
        lines: [
          `// The link's page loads (no 4xx or 5xx).`,
          `const res = await page.request.get(${q(href)});`,
          'expect(res.status()).toBeLessThan(400);',
        ],
      };
    }
    case 'feedback-timing':
      return {
        fixme: false,
        lines: [
          '// Something on screen says it worked or is working, within a second (H1).',
          `await expect(page.getByRole('status').or(page.getByRole('alert')).or(page.getByText(/sent|saved|loading|working|done/i)).first()).toBeVisible({ timeout: 1000 });`,
        ],
      };
    case 'error-message':
      return {
        fixme: false,
        lines: [
          '// The error says what went wrong, not a code (H9).',
          `await expect(page.getByText(/error\\s*(0x[0-9a-f]+|\\d{3,})|something went wrong/i)).toHaveCount(0);`,
        ],
      };
    case 'focus-visible':
      return {
        fixme: false,
        lines: [
          '// Focus is visible (WCAG 2.4.7): focusing changes how the element looks.',
          `const el = ${target};`,
          "const before = await el.evaluate((e) => { const s = getComputedStyle(e); return [s.outlineStyle, s.outlineWidth, s.boxShadow, s.borderColor, s.backgroundColor].join('|'); });",
          'await el.focus();',
          "const after = await el.evaluate((e) => { const s = getComputedStyle(e); return [s.outlineStyle, s.outlineWidth, s.boxShadow, s.borderColor, s.backgroundColor].join('|'); });",
          'expect(after).not.toBe(before);',
        ],
      };
    case 'viewport-sweep':
      return {
        fixme: false,
        lines: [
          '// No sideways scrolling at this width (WCAG 1.4.10).',
          'const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);',
          'expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);',
        ],
      };
    default:
      return {
        fixme: true,
        lines: [
          `// Expected: ${repro.expected || finding.fix}`,
          `// Actual: ${repro.actual || finding.finding}`,
          '// Fitts has no automatic oracle for this one: check it by eye, then replace this line.',
          "test.fixme(true, 'check by eye');",
        ],
      };
  }
}

/** The whole test file for one finding. */
export function playwrightTest(
  finding: Finding,
  repro: Repro,
  opts: {
    probe?: ProbeName | undefined;
    item?: ProbeItem | undefined;
    cell?: DeviceCell | undefined;
  } = {},
): string {
  const cell = opts.cell;
  const use: string[] = [];
  if (cell) {
    use.push(`viewport: { width: ${cell.width}, height: ${cell.height} }`);
    if (cell.mobile) use.push('isMobile: true');
    if (cell.touch) use.push('hasTouch: true');
    if (cell.scheme) use.push(`colorScheme: '${cell.scheme}'`);
    if (cell.motion) use.push(`reducedMotion: '${cell.motion}'`);
  }
  const { lines, fixme } = assertion(opts.probe, opts.item, repro, finding);
  const body = [
    ...(use.length ? [`test.use({ ${use.join(', ')} });`, ''] : []),
    `test(${q(finding.title)}, async ({ page }) => {`,
    `  await page.goto(${q(repro.start.url)});`,
    ...repro.steps
      .filter((s) => !/^Open /.test(s.text.replace(/\*\*/g, '')))
      .map((s) => `  ${stepCode(s)}`),
    ...lines.map((l) => `  ${l}`),
    '});',
    '',
  ];
  return [
    `// ${finding.title}`,
    `// Fitts repro · ${repro.environment}${fixme ? ' · no automatic check' : ''}`,
    `// Steps: ${repro.steps.map((s) => s.text.replace(/\*\*/g, '')).join(' → ') || 'open the page'}`,
    "import { expect, test } from '@playwright/test';",
    '',
    ...body,
  ].join('\n');
}

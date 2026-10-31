// @vitest-environment node
// The one-file Fitts plugin a project gets in a PR: it stamps host JSX elements with their
// source line, and leaves everything that only looks like JSX alone.
import { describe, expect, it } from 'vitest';
import { withFittsPlugin } from '../../src/main/fix/fix-host';
// @ts-expect-error: a plain .mjs file shipped as a resource, without types.
import { stamp } from '../../resources/plugin/fitts.vite.mjs';

const run = (code: string) => (stamp as (c: string, f: string) => string | null)(code, 'src/A.tsx');

describe('the Fitts plugin', () => {
  it('stamps host elements with their file, line and column, and only those', () => {
    const out = run(
      [
        'export function A() {',
        '  return (',
        '    <main className="a">',
        '      <Button label="x" />',
        "      <p>Don't panic, it's fine</p>",
        '      {items.map((i) => <li key={i}>{i}</li>)}',
        '    </main>',
        '  );',
        '}',
      ].join('\n'),
    );
    expect(out).toContain('<main data-fitts-src="src/A.tsx:3:4" className="a">');
    expect(out).toContain('<p data-fitts-src="src/A.tsx:5:6">');
    expect(out).toContain('<li data-fitts-src="src/A.tsx:6:24" key={i}>');
    expect(out).not.toContain('<Button data-fitts-src');
  });

  it('leaves generics, comparisons, strings, comments and templates alone', () => {
    const code = [
      'const [v, set] = useState<string>("");',
      'const big = a < b && c > d;',
      'const html = "<div>not jsx</div>";',
      '// <span> in a comment',
      'const t = `<em>${x}</em>`;',
      'function f<T>(x: T) { return x; }',
    ].join('\n');
    expect(run(code)).toBeNull();
  });

  it('doesn’t stamp twice', () => {
    expect(run('const a = <div data-fitts-src="x:1:1" />;')).toBeNull();
  });

  it('finds tags inside expressions inside tags', () => {
    const out = run('const a = <section>{ok ? <b>yes</b> : <i>no</i>}</section>;');
    expect(out?.match(/data-fitts-src/g)).toHaveLength(3);
  });

  it('adds itself to vite.config: the import after the others, fitts() first in plugins', () => {
    const config = [
      "import { defineConfig } from 'vite';",
      "import react from '@vitejs/plugin-react';",
      '',
      'export default defineConfig({',
      '  plugins: [react()],',
      '});',
    ].join('\n');
    expect(withFittsPlugin(config)).toBe(
      [
        "import { defineConfig } from 'vite';",
        "import react from '@vitejs/plugin-react';",
        "import fitts from './fitts.vite.mjs';",
        '',
        'export default defineConfig({',
        '  plugins: [fitts(), react()],',
        '});',
      ].join('\n'),
    );
    expect(withFittsPlugin('export default {}')).toBeNull();
    expect(withFittsPlugin(withFittsPlugin(config) ?? '')).toBeNull();
  });
});

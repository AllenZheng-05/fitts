// @vitest-environment node
// The fixer's outline tool (SPEC-phase4 §7.2).
import { describe, expect, it } from 'vitest';
import { componentDefinitions, outlineCode, outlineText } from '../../src/agent/fix/outline';

const CODE = `import { useState } from 'react';
import { api } from '../api';

function avatarOf(name: string): string {
  return name[0] ?? '';
}

export function Inbox() {
  const [x] = useState(0);
  return <div>{x}</div>;
}

export const Row = ({ name }: { name: string }) => <li>{name}</li>;

export default function Page() {
  return <Inbox />;
}
`;

describe('outlineCode', () => {
  it('lists components and functions with their lines, exports and imports', () => {
    const o = outlineCode(CODE, 'src/pages/Inbox.tsx');
    expect(o.components).toEqual([
      { name: 'Inbox', start: 8, end: 11 },
      { name: 'Row', start: 13, end: 13 },
      { name: 'Page', start: 15, end: 17 },
    ]);
    expect(o.functions).toEqual([{ name: 'avatarOf', start: 4, end: 6 }]);
    expect(o.exports).toEqual(['Inbox', 'Row', 'default']);
    expect(o.imports).toEqual(['react', '../api']);
    expect(outlineText(o, 'src/pages/Inbox.tsx')).toContain(
      'components: Inbox (lines 8–11), Row (lines 13–13), Page (lines 15–17)',
    );
  });

  it('a stylesheet or a broken file has nothing to outline', () => {
    expect(outlineText(outlineCode('.a{}', 'src/a.css'), 'src/a.css')).toBe(
      'src/a.css: nothing to outline (not a JS/TS module)',
    );
    expect(outlineCode('export function (', 'x.ts').components).toEqual([]);
  });
});

describe('componentDefinitions', () => {
  it('the texts that define a component', () => {
    expect(componentDefinitions('Inbox')).toEqual([
      'function Inbox(',
      'const Inbox =',
      'class Inbox ',
      'function Inbox<',
    ]);
  });
});

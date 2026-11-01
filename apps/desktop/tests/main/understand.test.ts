// @vitest-environment node
// Understand's deterministic half (SPEC-phase4 §3.2, §3.4): Pass 1 on fixture repos of four
// router kinds (demo/chat itself is the react-router-vite one, with its hand-rolled switch),
// the repo map, validation of a model's answer, and the summary main keeps as FITTS.md.
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { extract } from '../../src/main/understand/extract';
import { outline, renderRepoMap, repoMap } from '../../src/main/understand/repomap';
import { resolveImport } from '../../src/main/understand/files';

const REPOS = resolve(__dirname, '../fixtures/repos');
const DEMO = resolve(__dirname, '../../../../demo/chat');

describe('extract: demo/chat (react + vite, a path switch)', () => {
  const x = extract(DEMO);
  it('finds all 8 pages with their component files', () => {
    expect(x.pages.map((p) => p.route)).toEqual([
      '/',
      '/compose',
      '/compose/confirm',
      '/compose/recipient',
      '/contacts',
      '/contacts/grandma',
      '/search',
      '/settings',
    ]);
    expect(x.pages.find((p) => p.route === '/compose/recipient')?.file).toBe(
      'src/pages/Compose.tsx',
    );
    expect(x.pages.find((p) => p.route === '/')?.file).toBe('src/pages/Inbox.tsx');
  });
  it('finds the add-contact form with its fields, and the API routes', () => {
    const contacts = x.pages.find((p) => p.route === '/contacts');
    expect(contacts?.forms).toEqual([
      expect.objectContaining({
        name: 'contacts-add',
        fields: [
          { name: 'Name', type: 'text', required: false },
          { name: 'Phone', type: 'text', required: false },
        ],
        file: 'src/pages/Contacts.tsx',
      }),
    ]);
    expect(x.apis.map((a) => `${a.method} ${a.path}`)).toEqual(
      expect.arrayContaining([
        'GET /api/contacts',
        'POST /api/contacts',
        'POST /api/messages',
        'GET /api/search',
      ]),
    );
  });
  it('names the stack and the sensitive files', () => {
    expect(x.stack.framework).toBe('Vite + React');
    expect(x.stack.styling).toEqual(['css']);
    expect(x.sensitive).toEqual(expect.arrayContaining(['package.json', 'server/api.ts']));
    expect(x.sensitive).not.toContain('src/pages/Inbox.tsx');
    expect(x.media).toEqual({ darkMode: false, reducedMotion: false });
  });
});

describe('extract: other routers', () => {
  it('Next app router: pages, a dynamic route, a layout, a login gate, API routes, tokens and media', () => {
    const x = extract(resolve(REPOS, 'next-app'));
    expect(x.stack.router).toBe('next-app');
    expect(x.pages.map((p) => p.route)).toEqual(['/', '/dashboard', '/login', '/team/:id']);
    expect(x.pages.find((p) => p.route === '/team/:id')?.dynamic).toEqual({ param: 'id' });
    expect(x.pages.find((p) => p.route === '/')?.layout).toBe('app/layout.tsx');
    expect(x.pages.find((p) => p.route === '/dashboard')?.gate).toBe('login');
    expect(x.pages.find((p) => p.route === '/login')?.gate).toBeUndefined();
    const login = x.pages.find((p) => p.route === '/login')?.forms[0];
    expect(login).toEqual(
      expect.objectContaining({
        name: 'Log in',
        submit: 'login',
        fields: [
          { name: 'email', type: 'email', required: true },
          { name: 'password', type: 'password', required: true, rule: 'minLength 8' },
        ],
      }),
    );
    expect(x.apis.map((a) => `${a.method} ${a.path}`)).toEqual(
      expect.arrayContaining(['GET /api/items', 'POST /api/items']),
    );
    expect(x.tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'app/globals.css',
          kind: 'css-vars',
          names: ['--bg', '--fg'],
        }),
        expect.objectContaining({ file: 'tailwind.config.ts', kind: 'tailwind' }),
      ]),
    );
    expect(x.breakpoints).toEqual([640, 720, 768, 1024, 1280, 1536]);
    expect(x.media.darkMode).toBe(true);
    expect(x.sensitive).toEqual(
      expect.arrayContaining(['.env.local', 'package.json', 'app/api/items/route.ts']),
    );
    expect(x.stack.tests).toEqual(['vitest', 'playwright']);
    expect(x.stack.styling).toContain('tailwind');
  });

  it('SvelteKit: +page routes, [slug], a +server endpoint, em breakpoints', () => {
    const x = extract(resolve(REPOS, 'sveltekit'));
    expect(x.stack.router).toBe('sveltekit');
    expect(x.pages.map((p) => p.route)).toEqual(['/', '/about', '/blog/:slug']);
    expect(x.apis).toEqual([expect.objectContaining({ method: 'GET', path: '/api/posts' })]);
    expect(x.breakpoints).toEqual([768]);
  });

  it('Expo Router: (tabs) groups vanish, _layout files are skipped, [id] is a param', () => {
    const x = extract(resolve(REPOS, 'expo-router'));
    expect(x.stack.router).toBe('expo-router');
    expect(x.stack.framework).toBe('Expo');
    expect(x.pages.map((p) => p.route)).toEqual(['/', '/chat/:id', '/contacts']);
  });

  it('a folder with no package.json still answers (no pages, a note)', () => {
    const x = extract(resolve(REPOS));
    expect(x.pages).toEqual([]);
    expect(x.notes[0]).toMatch(/couldn’t find any pages/);
  });
});

describe('the repo map', () => {
  it('reads exports and imports, ranks what many files import first, and fits a budget', () => {
    const o = outline(
      "import { a } from './a';\nimport b from '../b.js';\nexport const x = 1;\nexport function f() {}\nexport default class C {}\nexport { y } from './y';",
      'src/m.ts',
    );
    expect(o).toEqual({
      exports: ['x', 'f', 'y'],
      defaultExport: 'C',
      imports: ['./a', '../b.js', './y'],
    });
    const x = extract(DEMO);
    const map = repoMap(DEMO, x.files);
    // The router and api modules are imported by every page: they rank first.
    expect(map.slice(0, 3).map((e) => e.file)).toEqual(
      expect.arrayContaining(['src/router.tsx', 'src/api.ts']),
    );
    const text = renderRepoMap(map, 200);
    expect(text).toMatch(/more files$/);
    expect(text.length).toBeLessThan(1000);
    expect(renderRepoMap(map)).toContain(
      'src/pages/Inbox.tsx (imported by 1): exports Inbox; imports src/api.ts',
    );
  });

  it('resolves relative imports with extensions, index files and the @/ alias', () => {
    const files = new Set(['src/a.tsx', 'src/b/index.ts', 'src/c.ts', 'src/d/e.svelte']);
    expect(resolveImport('src/x.tsx', './a', files)).toBe('src/a.tsx');
    expect(resolveImport('src/x.tsx', './b', files)).toBe('src/b/index.ts');
    expect(resolveImport('src/x.tsx', './c.js', files)).toBe('src/c.ts');
    expect(resolveImport('src/x.tsx', '@/d/e.svelte', files)).toBe('src/d/e.svelte');
    expect(resolveImport('src/x.tsx', 'react', files)).toBeUndefined();
  });
});

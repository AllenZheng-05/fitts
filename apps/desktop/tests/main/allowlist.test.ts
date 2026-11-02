// @vitest-environment node
// The edit allowlist (SPEC-phase4 §7.3): allowed by default, request_scope per mode, sensitive
// files always need the owner.
import { describe, expect, it } from 'vitest';
import { grant, isSensitive, mayEdit, newScope, scopeNeeds } from '../../src/main/fix/allowlist';

const go = 'Go ahead';

describe('isSensitive', () => {
  it('dependencies, lockfiles, env, CI, middleware, auth, API handlers and config', () => {
    for (const p of [
      'package.json',
      'apps/web/package.json',
      'pnpm-lock.yaml',
      '.env',
      '.env.local',
      '.github/workflows/ci.yml',
      'src/middleware.ts',
      'src/auth/session.ts',
      'pages/api/login.ts',
      'server/api.ts',
      'vite.config.ts',
      'tsconfig.json',
    ])
      expect(isSensitive(p), p).toBe(true);
    for (const p of ['src/pages/Compose.tsx', 'src/styles.css', 'src/components/Button.tsx'])
      expect(isSensitive(p), p).toBe(false);
  });
});

describe('mayEdit', () => {
  const scope = () => newScope(['src/pages/Compose.tsx', 'lib/format.ts', 'package.json']);

  it('allows the finding’s files, global CSS and the app’s UI files', () => {
    for (const p of [
      'src/pages/Compose.tsx',
      'lib/format.ts',
      'src/styles.css',
      'src/components/Avatar.tsx',
      'styles/globals.css',
    ])
      expect(mayEdit(p, scope(), 'autonomous'), p).toEqual({ ok: true });
  });

  it('refuses anything else with a message the model can act on', () => {
    const v = mayEdit('scripts/build.mjs', scope(), 'autonomous');
    expect(v.ok).toBe(false);
    expect(!v.ok && v.error).toMatch(/request_scope\("scripts\/build\.mjs", why\)/);
  });

  it('sensitive files are never a default, even when the fixer lists them', () => {
    const v = mayEdit('package.json', scope(), 'dangerous');
    expect(v.ok).toBe(false);
    expect(!v.ok && v.error).toMatch(/owner/);
  });

  it('Plan only changes nothing', () => {
    expect(mayEdit('src/pages/Compose.tsx', scope(), 'plan').ok).toBe(false);
  });
});

describe('request_scope', () => {
  it('Autonomous and Dangerous grant a non-sensitive file; the ask modes need the owner', () => {
    expect(scopeNeeds('scripts/x.ts', 'autonomous')).toBe('grant');
    expect(scopeNeeds('scripts/x.ts', 'dangerous')).toBe('grant');
    expect(scopeNeeds('scripts/x.ts', 'ask-unsure')).toBe('owner');
    expect(scopeNeeds('scripts/x.ts', 'plan')).toBe('refuse');
    const s = newScope();
    expect(grant('scripts/x.ts', s, 'autonomous')).toEqual({ ok: true });
    expect(mayEdit('scripts/x.ts', s, 'autonomous')).toEqual({ ok: true });
    expect(grant('scripts/y.ts', s, 'ask-every').ok).toBe(false);
  });

  it('a hostile fixer can’t get package.json in Autonomous without the owner’s answer', () => {
    const s = newScope(['package.json']);
    expect(grant('package.json', s, 'autonomous').ok).toBe(false);
    expect(grant('package.json', s, 'dangerous').ok).toBe(false);
    // An answer to a different question, or a "Skip it", doesn't count.
    expect(
      grant('package.json', s, 'autonomous', {
        question: 'Can I change src/x.ts?',
        answer: go,
        yes: go,
      }).ok,
    ).toBe(false);
    expect(
      grant('package.json', s, 'autonomous', {
        question: 'To fix it I need package.json. OK?',
        answer: 'Skip it',
        yes: go,
      }).ok,
    ).toBe(false);
    expect(mayEdit('package.json', s, 'autonomous').ok).toBe(false);
    // The owner's own "Go ahead" on the question that names it.
    expect(
      grant('package.json', s, 'autonomous', {
        question: 'To fix it I need to change package.json because … OK?',
        answer: go,
        yes: go,
      }),
    ).toEqual({ ok: true });
    expect(mayEdit('package.json', s, 'autonomous')).toEqual({ ok: true });
  });
});

describe('a strict scope (A9’s brand fix: the theme and the wordmark only)', () => {
  it('allows its own files and refuses every other UI file, in every mode', () => {
    const s = newScope(['src/lib/theme.ts', 'src/components/Wordmark.tsx'], true);
    expect(mayEdit('src/lib/theme.ts', s, 'autonomous').ok).toBe(true);
    expect(mayEdit('src/components/Wordmark.tsx', s, 'dangerous').ok).toBe(true);
    const other = mayEdit('app/(tabs)/index.tsx', s, 'autonomous');
    expect(other.ok).toBe(false);
    expect(!other.ok && other.error).toContain('outside this fix');
    expect(mayEdit('src/index.css', s, 'autonomous').ok).toBe(false);
  });
});

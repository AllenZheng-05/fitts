// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/out/**',
      '**/dist/**',
      '**/test-results/**',
      '**/playwright-report/**',
      'docs/**',
      '.fitts-dev/**',
      '**/.fitts-worktrees/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js', 'scripts/verify/*.cjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['eslint.config.js', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: [
      'apps/desktop/src/main/**',
      'apps/desktop/src/preload/**',
      '**/*.config.{ts,mts}',
      'apps/desktop/tests/e2e/**',
      'scripts/**',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}', 'apps/desktop/tests/unit/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['apps/desktop/src/renderer/**/*.tsx'],
    ...jsxA11y.flatConfigs.strict,
  },
  {
    // CLAUDE.md: colors come from tokens.css. Mock sites are plain websites with their own.
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    ignores: ['apps/desktop/src/renderer/mock/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...['Literal[raw', 'TemplateElement[value.raw'].flatMap((attr) => [
          {
            selector: `${attr}=/#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?(?![0-9a-zA-Z])/]`,
            message: 'Use a token from tokens.css instead of a hex color.',
          },
          {
            selector: `${attr}=/rgba?[(]/]`,
            message: 'Use a token from tokens.css instead of an rgb() color.',
          },
        ]),
      ],
    },
  },
  prettier,
);

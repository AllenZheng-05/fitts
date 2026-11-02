// @ts-check
// The repo's config plus the rules the app's renderer has (jsx-a11y strict, React hooks, no raw
// colors), for the site. `pnpm --filter @fitts/site lint`; the root `pnpm lint` runs the base rules.
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import base from '../../eslint.config.js';

export default tseslint.config(
  ...base,
  { ignores: ['dist/**', 'scripts/**', 'test-results/**', 'playwright-report/**'] },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname, projectService: true },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  { files: ['src/**/*.tsx'], ...jsxA11y.flatConfigs.strict },
  {
    files: ['tests/**', '*.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // Colors come from tokens.css, as in the app.
    files: ['src/**/*.{ts,tsx}'],
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
);

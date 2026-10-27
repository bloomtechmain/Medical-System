// Flat config — required by ESLint 9+ (no .eslintrc.* fallback). Migrated
// from the old .eslintrc.json 1:1; same plugins, same rules, same effect.
// `npm run lint` already restricts to `src --ext .ts,.tsx`, so there's no
// need to scope these by `files` the way a mixed-language repo would.
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist'] },
  js.configs.recommended,
  react.configs.flat.recommended,
  {
    languageOptions: {
      ...react.configs.flat.recommended.languageOptions,
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { '@typescript-eslint': tseslint, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'off',
      'eqeqeq': ['error', 'smart'],
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/no-unescaped-entities': 'off',
      // Only the two classic hooks rules — matching the pre-migration
      // .eslintrc.json's `plugin:react-hooks/recommended`, from before
      // eslint-plugin-react-hooks v7 bundled its ~14 React-Compiler-era
      // rules into "recommended" too. Opting into those is a real decision
      // for a separate change, not a side effect of an ESLint-9 migration.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];

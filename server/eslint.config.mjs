// Flat config — required by ESLint 9+ (no .eslintrc.* fallback, and no
// --ignore-path CLI flag either; ignores move into the config itself).
// Migrated from .eslintrc.json 1:1 — same parser, same rules. The original
// had no `extends`, so there's no eslint:recommended-equivalent to pull in
// here either.
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  { ignores: ['node_modules/**', 'uploads/**', 'dist/**'] },
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: tsParser,
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_|next', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'eqeqeq': ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'warn',
      'no-undef': 'off',
    },
  },
];

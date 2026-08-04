import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

/**
 * One config for all three workspaces.
 *
 * Type-aware linting is deliberately not enabled: each workspace has its own
 * tsconfig and its own installed TypeScript, and `npm run typecheck` in each
 * already covers what the type-aware rules would catch. This is here for the
 * things the compiler does not check.
 */
export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'backend/prisma/migrations/**', 'demos/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // --- Backend --------------------------------------------------------------
  {
    files: ['backend/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Unused function arguments are how resolvers declare the signature they
      // are handed (`_parent`, `__`), so only flag ones not marked as ignored.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      'no-console': 'off',
    },
  },

  // --- Dashboard ------------------------------------------------------------
  {
    files: ['dashboard/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },

  // --- SDK ------------------------------------------------------------------
  {
    files: ['sdk/**/*.js', 'examples/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },

  // --- Tests ----------------------------------------------------------------
  {
    files: ['**/*.test.{ts,tsx,js}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // Mocks legitimately need loose shapes.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Must stay last: turns off every rule Prettier already decides.
  prettier
)

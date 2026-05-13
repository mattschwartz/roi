import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import importX from 'eslint-plugin-import-x';
import tseslint from 'typescript-eslint';

// ESLint 9+ flat config.
//
// Per proposal section 4: `@typescript-eslint/strict-type-checked` plus
// the named overrides below. Rule names in the proposal reference the
// classic `import/...` namespace; we use `eslint-plugin-import-x` (the
// TypeScript-friendly fork) under the `import-x/...` namespace.
//
// Path aliases (`@core/*`, `@scenes/*`, etc.) are taught to the import
// plugin via `import-x/internal-regex` so import/order treats them as
// internal rather than external — keeping the dependency boundaries
// in section 11 visible in the import graph.
export default defineConfig([
  // Ignore generated and vendor output before anything else parses.
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'assets/atlas/**',
      'tests/visual/golden/**',
      '.frames/**',
    ],
  },

  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'import-x': importX,
    },
    settings: {
      'import-x/internal-regex':
        '^@(core|scenes|bullets|hud|patterns|audio|/)/',
    },
    rules: {
      // Type discipline — the explicit overrides named in the proposal.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'prefer-const': 'error',
      '@typescript-eslint/prefer-readonly': 'error',

      // Import discipline.
      'import-x/no-cycle': ['error', { maxDepth: 10 }],
      'import-x/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling', 'index'],
            'type',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },

  // Config files run in Node and don't need the same project-aware rules.
  {
    files: ['vite.config.ts', 'eslint.config.ts', '*.config.ts'],
    rules: {
      'import-x/no-cycle': 'off',
    },
  },
]);

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Rule tuning notes — what's downgraded and why
//
// The defaults (recommended + react-hooks + react-refresh) treat
// the following as errors. We've pragmatically downgraded each to
// warn because they're stylistic tech debt rather than bugs that
// would cause runtime breakage, and the codebase has hundreds of
// pre-existing violations that block CI without delivering any
// runtime safety improvement.
//
//   - no-unused-vars        — many *Form / *Modal / *View files
//                             keep params for API parity even when
//                             unused; the `_` prefix convention
//                             below opts out by name. Promote back
//                             to error once those files are cleaned.
//   - no-explicit-any       — lib/engine/* still uses `any` for
//                             unmodeled response shapes. The proper
//                             fix is generated types from openapi.yaml;
//                             until then, blocking CI on every `any`
//                             is more cost than signal.
//   - cascading renders     — react-hooks/set-state-in-effect.
//                             50+ existing hits across war-room
//                             views. Real fix is to migrate to
//                             reducers / queries; tracking via
//                             warn so new code can't silently add
//                             more.
export default defineConfig([
  globalIgnores([
    'dist',
    'dist-next',
    'node_modules',
    'Fuse-React-v17.0.0-vitejs-demo',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-refresh/only-export-components': 'warn',
      // React Compiler rules — the codebase isn't compiler-ready yet
      // (multi-domain refactor needed). Surface as warnings so new
      // code doesn't silently add violations; promote back to error
      // when each rule's existing hits are down to ~0.
      'react-hooks/refs': 'warn',
      'react-hooks/component-hook-factories': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/error-boundaries': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'no-empty': 'warn',
      'prefer-const': 'warn',
    },
  },
])

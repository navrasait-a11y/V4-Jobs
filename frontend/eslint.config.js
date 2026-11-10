import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^(React|_)', argsIgnorePattern: '^_', ignoreRestSiblings: true }],
      'react-refresh/only-export-components': 'off',
      // Effects here sync server data into editable form state, which this rule flags.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    // Config files run in Node, not the browser, so they need Node globals (process, __dirname, etc.).
    files: ['vite.config.js', 'eslint.config.js', '*.config.{js,mjs,cjs}', 'api/**/*.js', 'e2e/**/*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // Service worker (Firebase web push).
    files: ['public/*-sw.js'],
    languageOptions: { globals: { ...globals.serviceworker, firebase: 'readonly' } },
  },
])

import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'dist-e2e/**', 'release/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser, ...globals.node, chrome: 'readonly', __E2E__: 'readonly' } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
];

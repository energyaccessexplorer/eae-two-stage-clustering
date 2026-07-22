import js from '@eslint/js';

export default [
  { ignores: ['node_modules/**', 'coverage/**', 'index.html'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
  {
    // Node-run scripts (golden-master capture) use the Node global `process`.
    files: ['**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly' },
    },
  },
  {
    // The pass-2 Web Worker and its client use browser worker globals.
    files: ['worker/**/*.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        Worker: 'readonly',
        URL: 'readonly',
        queueMicrotask: 'readonly',
      },
    },
  },
];

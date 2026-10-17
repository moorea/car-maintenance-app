import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

const localStateBan = ['useState', 'useReducer'].flatMap((name) => [
  {
    selector: `CallExpression[callee.name='${name}']`,
    message: `${name} is not allowed in screens. Put state in a core screen model (docs/adr/0003-screen-state.md).`,
  },
  {
    selector: `CallExpression[callee.property.name='${name}']`,
    message: `${name} is not allowed in screens. Put state in a core screen model (docs/adr/0003-screen-state.md).`,
  },
])

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.expo/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    // Core is headless: no UI, platform or vendor SDKs. Those live behind ports.
    files: ['packages/core/**/*.{ts,tsx,mts,cts}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'zustand',
              message: 'Core uses zustand/vanilla only; the React bindings live in the app.',
            },
          ],
          patterns: [
            { group: ['react', 'react/*', '**/react*'], message: 'Core must not depend on React.' },
            {
              group: ['zustand/*', '!zustand/vanilla'],
              message: 'Core uses zustand/vanilla only; the React bindings live in the app.',
            },
            { group: ['expo', 'expo-*', '@expo/*'], message: 'Core must not depend on Expo.' },
            {
              group: ['@supabase/*', '@powersync/*'],
              message: 'Use a port; adapters live in @car/data or the app.',
            },
          ],
        },
      ],
    },
  },
  {
    // Data adapters run on the phone and in Node tests, so they take the database as a parameter
    // instead of importing a platform driver.
    files: ['packages/data/**/*.{ts,tsx,mts,cts}'],
    ignores: ['packages/data/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react/*', 'react-native*', 'expo', 'expo-*', '@expo/*'],
              message: 'Data adapters are headless.',
            },
            {
              group: ['@powersync/react-native', '@powersync/node', '@powersync/web'],
              message: 'Import @powersync/common; the app picks the platform driver.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // In-memory adapters are for tests; only the composition root may use them as placeholders.
    files: ['apps/mobile/**/*.{ts,tsx}'],
    ignores: ['apps/mobile/src/bootstrap/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@car/core/testing'], message: 'Test adapters stay out of app code.' },
          ],
        },
      ],
    },
  },
  {
    // Screens and their views only render model state. See ADR 0003.
    files: ['apps/mobile/src/screens/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...localStateBan],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              importNames: ['useState', 'useReducer'],
              message: 'Screens keep no local state. Put it in a core screen model (ADR 0003).',
            },
          ],
          patterns: [
            { group: ['@car/core/testing'], message: 'Test adapters stay out of app code.' },
            {
              group: ['@supabase/*', '@powersync/*'],
              message: 'Screens never talk to the backend directly; go through a model.',
            },
          ],
        },
      ],
    },
  },
)

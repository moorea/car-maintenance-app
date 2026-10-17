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
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-*', 'react/*'], message: 'Core must not depend on React.' },
            { group: ['expo', 'expo-*', '@expo/*'], message: 'Core must not depend on Expo.' },
            {
              group: ['@supabase/*', '@powersync/*'],
              message: 'Use a port; adapters live in the app.',
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
    // Screens and their views only render model state. See ADR 0003.
    files: ['apps/mobile/src/screens/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...localStateBan],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
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

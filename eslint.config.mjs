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

// Colours come from the theme's semantic roles (apps/mobile/src/theme). Only the palette holds
// literal values, so the app can be rethemed in one place.
const colorLiteralBan = [
  {
    selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
    message: 'Use a semantic colour from useColors() (apps/mobile/src/theme), not a literal.',
  },
  {
    selector: 'Literal[value=/^(?:rgb|rgba|hsl|hsla)\\(/i]',
    message: 'Use a semantic colour from useColors() (apps/mobile/src/theme), not a literal.',
  },
  {
    selector: 'TemplateElement[value.raw=/^(?:#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla)\\()/i]',
    message: 'Use a semantic colour from useColors() (apps/mobile/src/theme), not a literal.',
  },
  {
    // Named colours ('white', 'red', 'transparent') in any *color / *Color style property.
    selector: 'Property[key.name=/[cC]olor$/] > Literal',
    message: 'Use a semantic colour from useColors() (apps/mobile/src/theme), not a literal.',
  },
]

// A separate rule name from the import bans below, so flat-config blocks never override it.
const themeImportBans = {
  paths: [
    {
      name: '@expo/ui',
      importNames: ['Host'],
      message: 'Use Host from src/ui/Host, which tints native controls with the theme accent.',
    },
    {
      name: '@expo/ui',
      importNames: ['Text', 'Collapsible'],
      message: 'Use Text and Collapsible from src/ui, whose text scales with Dynamic Type on iOS.',
    },
    {
      name: '@expo/ui',
      importNames: ['Button'],
      message: 'Use Button from src/ui, whose text buttons take the accent on iOS.',
    },
  ],
  patterns: [
    {
      group: ['**/theme/palette', '**/theme/colors'],
      message: 'Read colours through useColors() from src/theme, never the palette directly.',
    },
  ],
}

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.expo/**',
      'supabase/functions/assistant/index.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    // Type-aware rules for the mistakes that type checking alone lets through: a promise nobody
    // awaits loses its errors, and a switch over a union silently skips a newly added member.
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['packages/*/vitest.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
    },
  },
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
    ignores: ['packages/data/**/*.test.ts', 'packages/data/e2e/**'],
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
    files: ['apps/mobile/**/*.{ts,tsx}'],
    ignores: ['apps/mobile/src/theme/palette.ts', 'apps/mobile/**/*.test.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', ...colorLiteralBan] },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    ignores: [
      'apps/mobile/src/theme/**',
      'apps/mobile/src/ui/Host.tsx',
      'apps/mobile/src/ui/Text*.tsx',
      'apps/mobile/src/ui/Button*.tsx',
      'apps/mobile/src/ui/Collapsible*.tsx',
    ],
    rules: { '@typescript-eslint/no-restricted-imports': ['error', themeImportBans] },
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
      'no-restricted-syntax': ['error', ...localStateBan, ...colorLiteralBan],
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

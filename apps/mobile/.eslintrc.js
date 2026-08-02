/**
 * ESLint — VelChat mobile.
 * Extends @react-native, then enforces the §M3/§M4 layer boundaries and the
 * §M1 hard rules (no AsyncStorage, no console in production paths).
 */
module.exports = {
  root: true,
  extends: '@react-native',
  plugins: ['boundaries'],
  settings: {
    // Resolve TS files + directory (index.ts) imports so boundaries can classify them.
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: require('path').join(__dirname, 'tsconfig.json'),
      },
      node: { extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'] },
    },
    'boundaries/include': ['src/**/*'],
    'boundaries/elements': [
      { type: 'app', mode: 'folder', pattern: 'src/app' },
      { type: 'core', mode: 'folder', pattern: 'src/core' },
      { type: 'platform', mode: 'folder', pattern: 'src/platform' },
      { type: 'design-system', mode: 'folder', pattern: 'src/design-system' },
      { type: 'i18n', mode: 'folder', pattern: 'src/i18n' },
      { type: 'theme', mode: 'folder', pattern: 'src/theme' },
      { type: 'navigation', mode: 'folder', pattern: 'src/navigation' },
      { type: 'ui', mode: 'folder', pattern: 'src/ui' },
      { type: 'domain', mode: 'folder', pattern: 'src/domain' },
      { type: 'infra', mode: 'folder', pattern: 'src/infra' },
      // feature-ui MUST be listed before feature (more specific first)
      {
        type: 'feature-ui',
        mode: 'folder',
        pattern: 'src/features/*/ui',
        capture: ['feature'],
      },
      {
        type: 'feature',
        mode: 'folder',
        pattern: 'src/features/*',
        capture: ['feature'],
      },
    ],
  },
  rules: {
    // §M3/§M4 dependency rule: UI -> Feature -> Domain -> Infra, never reverse.
    'boundaries/element-types': [
      'error',
      {
        default: 'disallow',
        rules: [
          {
            from: 'app',
            allow: [
              'core',
              'platform',
              'design-system',
              'i18n',
              'theme',
              'navigation',
              'ui',
              'feature',
              'feature-ui',
              'domain',
              'infra',
            ],
          },
          // §M3 forward edge: Domain -> Infra is allowed (the SyncEngine orchestrates the
          // socket + DB writers + chat REST). Domain stays pure of React Native imports —
          // that is enforced separately by the `boundaries/external` rule below.
          { from: 'domain', allow: ['domain', 'core', 'infra', 'platform'] },
          { from: 'infra', allow: ['infra', 'domain', 'core', 'platform'] },
          {
            from: 'feature',
            allow: [
              'feature',
              'feature-ui',
              'domain',
              'core',
              'design-system',
              'theme',
              'i18n',
              'ui',
              'navigation',
              'platform',
              'infra',
            ],
          },
          // features/*/ui must NOT import infra directly (use the feature's api/hooks).
          {
            from: 'feature-ui',
            allow: [
              'feature',
              'feature-ui',
              'domain',
              'core',
              'design-system',
              'theme',
              'i18n',
              'ui',
              'navigation',
              'platform',
            ],
          },
          {
            from: 'ui',
            allow: [
              'design-system',
              'theme',
              'i18n',
              'ui',
              'navigation',
              'core',
              'domain',
            ],
          },
          {
            from: 'design-system',
            allow: ['design-system', 'theme', 'i18n', 'core'],
          },
          {
            from: 'navigation',
            allow: [
              'navigation',
              'ui',
              'feature',
              'feature-ui',
              'design-system',
              'theme',
              'i18n',
              'core',
              'domain',
            ],
          },
          { from: 'core', allow: ['core', 'platform'] },
          { from: 'platform', allow: ['platform', 'core'] },
          { from: 'theme', allow: ['theme', 'core', 'design-system'] },
          { from: 'i18n', allow: ['i18n', 'core'] },
        ],
      },
    ],
    // §M3: the domain layer is pure TS — no React Native imports.
    'boundaries/external': [
      'error',
      {
        default: 'allow',
        rules: [
          {
            from: ['domain'],
            disallow: [
              'react-native',
              'react-native-*',
              '@react-native/*',
              '@react-native-*',
            ],
            message:
              '§M3: domain is pure TS — it must not import React Native.',
          },
        ],
      },
    ],
    // §M1: AsyncStorage is forbidden — use MMKV / WatermelonDB.
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@react-native-async-storage/async-storage',
            message:
              'AsyncStorage is forbidden (§M1): unencrypted, slow, string-only. Use infra/kv (MMKV) or infra/db (WatermelonDB).',
          },
        ],
        patterns: [
          {
            group: ['**/AsyncStorage', '**/async-storage*'],
            message:
              'AsyncStorage is forbidden (§M1). Use infra/kv (MMKV) or infra/db (WatermelonDB).',
          },
        ],
      },
    ],
    // §M1/§M22: no console in production paths — structured logging via pino only.
    'no-console': 'error',
    // Styles are theme-driven (dynamic per active scheme), so inline style objects
    // are intentional in the design system and screens.
    'react-native/no-inline-styles': 'off',
  },
  overrides: [
    {
      // Tests and non-shipping scripts may use console.
      files: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/__tests__/**',
        'scripts/**',
        'jest.setup.*',
      ],
      rules: { 'no-console': 'off', 'boundaries/element-types': 'off' },
    },
  ],
};
